-- Split a bill in a group and chase the money ("หารบิล" / "ตามเงิน"). Additive and idempotent.
-- All tables are server only (RLS on, no policies), like the rest of the group ledger. Group money
-- never mixes into anybody's own summaries.

-- Where a person wants to be paid: PromptPay (phone 10, national id 13, e-wallet 15 digits) and/or a
-- bank account (shown as text; there is no standard QR for a plain account number).
create table if not exists payment_accounts (
  user_id      uuid primary key references users(id) on delete cascade,
  promptpay_id text check (promptpay_id is null or promptpay_id ~ '^([0-9]{10}|[0-9]{13}|[0-9]{15})$'),
  bank_name    text check (bank_name is null or char_length(bank_name) between 1 and 30),
  bank_account text check (bank_account is null or bank_account ~ '^[0-9-]{6,20}$'),
  account_name text check (account_name is null or char_length(account_name) between 1 and 60),
  updated_at   timestamptz not null default now()
);

-- One bill someone paid for and wants shared. joining = people tap "ร่วมหาร"; collecting = shares are
-- fixed and the payer collects; settled = everybody paid; cancelled.
create table if not exists split_bills (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references bot_groups(id) on delete cascade,
  payer_line_user_id text not null,
  title              text not null check (char_length(title) between 1 and 40),
  amount_satang      bigint not null check (amount_satang > 0 and amount_satang <= 100000000),
  status             text not null default 'joining'
                     check (status in ('joining', 'collecting', 'settled', 'cancelled')),
  created_at         timestamptz not null default now(),
  closed_at          timestamptz,
  settled_at         timestamptz
);
create index if not exists split_bills_group_idx on split_bills (group_id, created_at desc);

-- Who shares a bill. share_satang is empty until the list is closed. qr_token is the unguessable
-- handle of this person's QR image (the image link carries nothing but this token).
create table if not exists split_bill_members (
  bill_id       uuid not null references split_bills(id) on delete cascade,
  line_user_id  text not null,
  share_satang  bigint check (share_satang is null or share_satang >= 0),
  paid          boolean not null default false,
  paid_at       timestamptz,
  qr_token      uuid not null default gen_random_uuid() unique,
  joined_at     timestamptz not null default now(),
  primary key (bill_id, line_user_id)
);

alter table payment_accounts    enable row level security;
alter table split_bills         enable row level security;
alter table split_bill_members  enable row level security;

-- Tap "ร่วมหาร": 'ok' (also when already in), 'closed' when the list is no longer open, 'full' at 30 people.
create or replace function split_bill_join(p_bill uuid, p_user text)
returns text
language plpgsql security invoker as $$
declare st text; n int;
begin
  select status into st from split_bills where id = p_bill for update;
  if st is distinct from 'joining' then return 'closed'; end if;
  if exists (select 1 from split_bill_members where bill_id = p_bill and line_user_id = p_user) then
    return 'ok';
  end if;
  select count(*) into n from split_bill_members where bill_id = p_bill;
  if n >= 30 then return 'full'; end if;
  insert into split_bill_members (bill_id, line_user_id) values (p_bill, p_user);
  return 'ok';
end $$;

-- Close the list: fix every share (they must add up to the bill, to the satang) and start collecting.
-- The payer's own share counts as paid. True only once, and only while the list is open.
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
  update split_bill_members set paid = true, paid_at = now()
   where bill_id = p_bill and line_user_id = b.payer_line_user_id;
  select count(*) into unpaid from split_bill_members where bill_id = p_bill and not paid;
  update split_bills
     set status = case when unpaid = 0 then 'settled' else 'collecting' end,
         closed_at = now(),
         settled_at = case when unpaid = 0 then now() else null end
   where id = p_bill;
  return true;
end $$;

-- The payer says "got it from this person": 'ok', 'already' (was marked), 'none' (not on this bill or
-- the bill is not collecting). When nobody is left unpaid the bill is settled.
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
  update split_bill_members set paid = true, paid_at = now()
   where bill_id = p_bill and line_user_id = p_user;
  select count(*) into unpaid from split_bill_members where bill_id = p_bill and not paid;
  if unpaid = 0 then
    update split_bills set status = 'settled', settled_at = now() where id = p_bill;
  end if;
  return 'ok';
end $$;

revoke execute on function split_bill_join(uuid, text) from public, anon, authenticated;
revoke execute on function split_bill_close(uuid, jsonb) from public, anon, authenticated;
revoke execute on function split_bill_mark_paid(uuid, text) from public, anon, authenticated;
