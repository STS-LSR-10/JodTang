-- Split bills, round 2: "โอนแล้ว" (a friend says they paid), paying by sending a slip (the bot reads it),
-- and a way for the payer to take a tick back. Additive and idempotent. Server only, like 0035.

alter table split_bill_members add column if not exists claimed_at timestamptz;
alter table split_bill_members add column if not exists paid_via text
  check (paid_via is null or paid_via in ('payer', 'slip', 'slip_unverified'));

-- Every slip that paid a share. The image is never stored: its hash and the bank's reference number are
-- kept only so one slip can never pay two shares (unique on each).
create table if not exists split_bill_slips (
  id                 uuid primary key default gen_random_uuid(),
  bill_id            uuid not null references split_bills(id) on delete cascade,
  line_user_id       text not null,
  sha256             text not null unique,
  reference          text unique,
  amount_satang      bigint not null check (amount_satang > 0),
  receiver_verified  boolean not null,
  created_at         timestamptz not null default now()
);
alter table split_bill_slips enable row level security;

-- Marking by the payer now also records how it was paid (and clears a pending "โอนแล้ว").
create or replace function split_bill_mark_paid(p_bill uuid, p_user text)
returns text
language plpgsql security invoker as $$
declare st text; was boolean; unpaid int;
begin
  select status into st from split_bills where id = p_bill for update;
  if st is distinct from 'collecting' then return 'none'; end if;
  select paid into was from split_bill_members where bill_id = p_bill and line_user_id = p_user;
  if not found then return 'none'; end if;
  if was then return 'already'; end if;
  update split_bill_members set paid = true, paid_at = now(), paid_via = 'payer', claimed_at = null
   where bill_id = p_bill and line_user_id = p_user;
  select count(*) into unpaid from split_bill_members where bill_id = p_bill and not paid;
  if unpaid = 0 then
    update split_bills set status = 'settled', settled_at = now() where id = p_bill;
  end if;
  return 'ok';
end $$;

-- The payer's own share is "paid by the payer" from the moment the list is closed.
create or replace function split_bill_close(p_bill uuid, p_shares jsonb)
returns boolean
language plpgsql security invoker as $$
declare b split_bills%rowtype; total bigint; unpaid int;
begin
  select * into b from split_bills where id = p_bill for update;
  if not found or b.status <> 'joining' then return false; end if;
  select coalesce(sum((e->>'share')::bigint), 0) into total from jsonb_array_elements(p_shares) e;
  if total <> b.amount_satang then raise exception 'shares do not add up to the bill'; end if;
  update split_bill_members m
     set share_satang = (e->>'share')::bigint
    from jsonb_array_elements(p_shares) e
   where m.bill_id = p_bill and m.line_user_id = e->>'user';
  if exists (select 1 from split_bill_members where bill_id = p_bill and share_satang is null) then
    raise exception 'a member has no share';
  end if;
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

-- "โอนแล้ว": a friend says they paid; the payer still has to confirm. 'ok', 'already' (already paid or
-- already said so), 'none' (not on this bill / the bill is not collecting).
create or replace function split_bill_claim(p_bill uuid, p_user text)
returns text
language plpgsql security invoker as $$
declare st text; was boolean; claimed timestamptz;
begin
  select status into st from split_bills where id = p_bill for update;
  if st is distinct from 'collecting' then return 'none'; end if;
  select paid, claimed_at into was, claimed
    from split_bill_members where bill_id = p_bill and line_user_id = p_user;
  if not found then return 'none'; end if;
  if was or claimed is not null then return 'already'; end if;
  update split_bill_members set claimed_at = now() where bill_id = p_bill and line_user_id = p_user;
  return 'ok';
end $$;

-- A slip that covers the share: record it (one slip pays one share, ever) and mark the share paid.
-- 'ok', 'duplicate' (this slip was used before), 'already', 'none'.
create or replace function split_bill_pay_by_slip(
  p_bill uuid, p_user text, p_sha text, p_ref text, p_amount bigint, p_verified boolean
) returns text
language plpgsql security invoker as $$
declare st text; was boolean; unpaid int; inserted int;
begin
  select status into st from split_bills where id = p_bill for update;
  if st is distinct from 'collecting' then return 'none'; end if;
  select paid into was from split_bill_members where bill_id = p_bill and line_user_id = p_user;
  if not found then return 'none'; end if;
  if was then return 'already'; end if;
  begin
    insert into split_bill_slips (bill_id, line_user_id, sha256, reference, amount_satang, receiver_verified)
    values (p_bill, p_user, p_sha, p_ref, p_amount, p_verified);
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

-- The payer takes a tick back (a mis-tap, or a slip that turned out to be wrong). Never the payer's own
-- share. A settled bill goes back to collecting.
create or replace function split_bill_unpay(p_bill uuid, p_user text)
returns text
language plpgsql security invoker as $$
declare b split_bills%rowtype; was boolean;
begin
  select * into b from split_bills where id = p_bill for update;
  if not found or b.status not in ('collecting', 'settled') then return 'none'; end if;
  if p_user = b.payer_line_user_id then return 'none'; end if;
  select paid into was from split_bill_members where bill_id = p_bill and line_user_id = p_user;
  if not found or not was then return 'none'; end if;
  update split_bill_members set paid = false, paid_at = null, paid_via = null
   where bill_id = p_bill and line_user_id = p_user;
  -- the slip that paid it no longer counts, so it cannot be used twice but can be sent again by hand
  update split_bills set status = 'collecting', settled_at = null where id = p_bill;
  return 'ok';
end $$;

revoke execute on function split_bill_claim(uuid, text) from public, anon, authenticated;
revoke execute on function split_bill_pay_by_slip(uuid, text, text, text, bigint, boolean) from public, anon, authenticated;
revoke execute on function split_bill_unpay(uuid, text) from public, anon, authenticated;
