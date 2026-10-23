-- A slip the bot has checked no longer marks a share paid on its own: it records the slip (one slip pays
-- one share, ever) and leaves the share waiting ("โอนแล้ว"), because only the person who paid the bill
-- can know the money really arrived. Only the payer's confirmation (split_bill_mark_paid) makes it paid.
-- Additive and idempotent.
alter table split_bill_members add column if not exists claim_via text
  check (claim_via is null or claim_via in ('slip', 'slip_unverified'));

-- 'ok', 'duplicate' (this slip was used before), 'already' (paid, or a slip was already sent for it), 'none'.
create or replace function split_bill_claim_by_slip(
  p_bill uuid, p_user text, p_sha text, p_ref text, p_amount bigint, p_verified boolean,
  p_qr_hash text default null
) returns text
language plpgsql security invoker as $$
declare st text; was boolean; via text;
begin
  select status into st from split_bills where id = p_bill for update;
  if st is distinct from 'collecting' then return 'none'; end if;
  select paid, claim_via into was, via
    from split_bill_members where bill_id = p_bill and line_user_id = p_user;
  if not found then return 'none'; end if;
  if was or via is not null then return 'already'; end if;
  begin
    insert into split_bill_slips (bill_id, line_user_id, sha256, reference, amount_satang, receiver_verified, qr_hash)
    values (p_bill, p_user, p_sha, p_ref, p_amount, p_verified, p_qr_hash);
  exception when unique_violation then
    return 'duplicate';
  end;
  update split_bill_members
     set claimed_at = coalesce(claimed_at, now()),
         claim_via = case when p_verified then 'slip' else 'slip_unverified' end
   where bill_id = p_bill and line_user_id = p_user;
  return 'ok';
end $$;

-- The payer's confirmation: paid, and no longer "waiting".
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
  update split_bill_members
     set paid = true, paid_at = now(), paid_via = 'payer', claimed_at = null, claim_via = null
   where bill_id = p_bill and line_user_id = p_user;
  select count(*) into unpaid from split_bill_members where bill_id = p_bill and not paid;
  if unpaid = 0 then
    update split_bills set status = 'settled', settled_at = now() where id = p_bill;
  end if;
  return 'ok';
end $$;

-- The payer takes a tick back: not paid, and no longer waiting either.
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
  update split_bill_members
     set paid = false, paid_at = null, paid_via = null, claimed_at = null, claim_via = null
   where bill_id = p_bill and line_user_id = p_user;
  update split_bills set status = 'collecting', settled_at = null where id = p_bill;
  return 'ok';
end $$;

-- the old "a checked slip pays by itself" function is gone
drop function if exists split_bill_pay_by_slip(uuid, text, text, text, bigint, boolean, text);

revoke execute on function split_bill_claim_by_slip(uuid, text, text, text, bigint, boolean, text) from public, anon, authenticated;
