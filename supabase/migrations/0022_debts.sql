-- Debts: money lent to somebody ("lent") or borrowed from somebody ("borrowed"), with part payments.
-- Kept apart from `transactions`, so a loan is never counted as income or expense; instead it moves
-- the balance of the wallet the money left / reached. Additive and idempotent.
-- A wallet that is deleted leaves its debts and payments pointing at "no wallet" = the main wallet.
create table if not exists debts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  direction   text not null check (direction in ('lent', 'borrowed')),
  person      text not null check (length(person) between 1 and 40),
  amount      numeric(14,2) not null check (amount > 0),
  account_id  uuid references accounts(id) on delete set null,
  occurred_at timestamptz not null default now(),
  due_at      timestamptz,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists debts_user_idx on debts (user_id, occurred_at desc);
create index if not exists debts_user_person_idx on debts (user_id, lower(person));

create table if not exists debt_payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  debt_id    uuid not null references debts(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  amount     numeric(14,2) not null check (amount > 0),
  paid_at    timestamptz not null default now(),
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists debt_payments_debt_idx on debt_payments (debt_id);
create index if not exists debt_payments_user_idx on debt_payments (user_id);

alter table debts enable row level security;
alter table debt_payments enable row level security;
drop policy if exists debts_own on debts;
create policy debts_own on debts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists debt_payments_own on debt_payments;
create policy debt_payments_own on debt_payments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Every debt with what has been paid and what is left.
create or replace function debt_balances(p_user uuid)
returns table (
  id uuid, direction text, person text, amount numeric, account_id uuid,
  occurred_at timestamptz, due_at timestamptz, note text,
  paid numeric, remaining numeric
)
language sql stable security invoker as $$
  select
    d.id, d.direction, d.person, d.amount, d.account_id, d.occurred_at, d.due_at, d.note,
    coalesce(sum(p.amount), 0),
    d.amount - coalesce(sum(p.amount), 0)
  from debts d
  left join debt_payments p on p.debt_id = d.id
  where d.user_id = p_user
  group by d.id
  order by (d.amount - coalesce(sum(p.amount), 0) <= 0), d.due_at nulls last, d.occurred_at desc;
$$;

-- wallet_balances also reports the money a wallet gained / lost through debts (the return type
-- changes, so the old function is dropped first):
--   in  = money borrowed into it + repayments of money lent that it received
--   out = money lent out of it + repayments of money borrowed that it paid
drop function if exists wallet_balances(uuid);
create function wallet_balances(p_user uuid)
returns table (
  id uuid, name text, kind text, is_default boolean, opening_balance numeric,
  income numeric, expense numeric, tx_count bigint,
  transfer_in numeric, transfer_out numeric,
  credit_limit numeric, statement_day smallint, due_day smallint,
  debt_in numeric, debt_out numeric
)
language sql stable security invoker as $$
  select
    a.id,
    a.name,
    a.kind::text,
    a.is_default,
    a.opening_balance,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    count(t.id),
    coalesce((
      select sum(x.amount) from transfers x
      where x.user_id = a.user_id and (x.to_account = a.id or (a.is_default and x.to_account is null))
    ), 0),
    coalesce((
      select sum(x.amount) from transfers x
      where x.user_id = a.user_id and (x.from_account = a.id or (a.is_default and x.from_account is null))
    ), 0),
    a.credit_limit,
    a.statement_day,
    a.due_day,
    coalesce((
      select sum(d.amount) from debts d
      where d.user_id = a.user_id and d.direction = 'borrowed'
        and (d.account_id = a.id or (a.is_default and d.account_id is null))
    ), 0) + coalesce((
      select sum(p.amount) from debt_payments p join debts d on d.id = p.debt_id
      where p.user_id = a.user_id and d.direction = 'lent'
        and (p.account_id = a.id or (a.is_default and p.account_id is null))
    ), 0),
    coalesce((
      select sum(d.amount) from debts d
      where d.user_id = a.user_id and d.direction = 'lent'
        and (d.account_id = a.id or (a.is_default and d.account_id is null))
    ), 0) + coalesce((
      select sum(p.amount) from debt_payments p join debts d on d.id = p.debt_id
      where p.user_id = a.user_id and d.direction = 'borrowed'
        and (p.account_id = a.id or (a.is_default and p.account_id is null))
    ), 0)
  from accounts a
  left join transactions t
    on t.user_id = a.user_id
   and t.status = 'confirmed'
   and (t.account_id = a.id or (a.is_default and t.account_id is null))
  where a.user_id = p_user
  group by a.id
  order by a.is_default desc, a.created_at, a.name;
$$;
