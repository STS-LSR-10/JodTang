-- Split bills, round 3: the payer picks who shares the bill on a LIFF page (no more "ร่วมหาร" taps),
-- the QR codes go into the group at once, a once-a-day reminder, and slips are de-duplicated by the
-- QR printed on them. Additive and idempotent. Server only, like 0035 / 0036.

-- a bill is first 'setup' (the payer has not chosen the people yet)
alter table split_bills drop constraint if exists split_bills_status_check;
alter table split_bills add constraint split_bills_status_check
  check (status in ('setup', 'joining', 'collecting', 'settled', 'cancelled'));

alter table split_bills add column if not exists qr_announced_at timestamptz;
alter table split_bills add column if not exists last_reminded_on date;

-- the QR on a slip, as a hash: the same slip (even photographed again) gives the same hash
alter table split_bill_slips add column if not exists qr_hash text;
create unique index if not exists split_bill_slips_qr_hash_key
  on split_bill_slips (qr_hash) where qr_hash is not null;

-- Choose the people and start collecting, in one step: the shares are fixed (they must add up to the
-- bill to the satang, the payer must be one of them, at most 30 people) and the payer's own share is
-- paid. For a 'setup' bill, and for an older 'joining' one (people who had tapped "ร่วมหาร" but are not
-- in the list are taken off). True only once.
create or replace function split_bill_confirm(p_bill uuid, p_shares jsonb)
returns boolean
language plpgsql security invoker as $$
declare b split_bills%rowtype; total bigint; unpaid int;
begin
  select * into b from split_bills where id = p_bill for update;
  if not found or b.status not in ('setup', 'joining') then return false; end if;
  if jsonb_array_length(p_shares) > 30 then raise exception 'too many people'; end if;
  select coalesce(sum((e->>'share')::bigint), 0) into total from jsonb_array_elements(p_shares) e;
  if total <> b.amount_satang then raise exception 'shares do not add up to the bill'; end if;
  if not exists (select 1 from jsonb_array_elements(p_shares) e where e->>'user' = b.payer_line_user_id) then
    raise exception 'the payer is not on the list';
  end if;
  delete from split_bill_members
   where bill_id = p_bill
     and line_user_id not in (select e->>'user' from jsonb_array_elements(p_shares) e);
  insert into split_bill_members (bill_id, line_user_id, share_satang)
  select p_bill, e->>'user', (e->>'share')::bigint from jsonb_array_elements(p_shares) e
  on conflict (bill_id, line_user_id) do update set share_satang = excluded.share_satang;
  update split_bill_members set paid = true, paid_at = now(), paid_via = 'payer'
   where bill_id = p_bill and line_user_id = b.payer_line_user_id;
  select count(*) into unpaid from split_bill_members where bill_id = p_bill and not paid;
  update split_bills
     set status = case when unpaid = 0 then 'settled' else 'collecting' end,
         closed_at = now(),
         settled_at = case when unpaid = 0 then now() else null end
   where id = p_bill;
  return true;
end $$;

-- True the first time only: the QR codes were put into the group (a double tap sends them once).
create or replace function split_bill_mark_announced(p_bill uuid)
returns boolean
language plpgsql security invoker as $$
declare n int;
begin
  update split_bills set qr_announced_at = now()
   where id = p_bill and qr_announced_at is null and status in ('collecting', 'settled');
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- True the first time on each day (Bangkok date given by the caller): the reminder for this bill is due.
create or replace function split_bill_mark_reminded(p_bill uuid, p_day date)
returns boolean
language plpgsql security invoker as $$
declare n int;
begin
  update split_bills set last_reminded_on = p_day
   where id = p_bill and status = 'collecting'
     and (last_reminded_on is null or last_reminded_on < p_day);
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- A slip that covers the share, now also keyed by the QR printed on it (when it could be read).
drop function if exists split_bill_pay_by_slip(uuid, text, text, text, bigint, boolean);
create or replace function split_bill_pay_by_slip(
  p_bill uuid, p_user text, p_sha text, p_ref text, p_amount bigint, p_verified boolean,
  p_qr_hash text default null
) returns text
language plpgsql security invoker as $$
declare st text; was boolean; unpaid int;
begin
  select status into st from split_bills where id = p_bill for update;
  if st is distinct from 'collecting' then return 'none'; end if;
  select paid into was from split_bill_members where bill_id = p_bill and line_user_id = p_user;
  if not found then return 'none'; end if;
  if was then return 'already'; end if;
  begin
    insert into split_bill_slips (bill_id, line_user_id, sha256, reference, amount_satang, receiver_verified, qr_hash)
    values (p_bill, p_user, p_sha, p_ref, p_amount, p_verified, p_qr_hash);
  exception when unique_violation then
    return 'duplicate';
  end;
  update split_bill_members
     set paid = true, paid_at = now(), claimed_at = null,
         paid_via = case when p_verified then 'slip' else 'slip_unverified' end
   where bill_id = p_bill and line_user_id = p_user;
  select count(*) into unpaid from split_bill_members where bill_id = p_bill and not paid;
  if unpaid = 0 then
    update split_bills set status = 'settled', settled_at = now() where id = p_bill;
  end if;
  return 'ok';
end $$;

revoke execute on function split_bill_confirm(uuid, jsonb) from public, anon, authenticated;
revoke execute on function split_bill_mark_announced(uuid) from public, anon, authenticated;
revoke execute on function split_bill_mark_reminded(uuid, date) from public, anon, authenticated;
revoke execute on function split_bill_pay_by_slip(uuid, text, text, text, bigint, boolean, text) from public, anon, authenticated;
