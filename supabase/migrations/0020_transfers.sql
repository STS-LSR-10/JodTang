-- Transfers between a person's own wallets. Kept in their own table (not in `transactions`) so a
-- transfer can never be counted as income or expense by any summary, chart, budget or forecast.
-- Additive and idempotent.
-- A wallet that is deleted leaves its transfers pointing at "no wallet", which means the main
-- wallet (the same rule as entries without a wallet).
create table if not exists transfers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  from_account uuid references accounts(id) on delete set null,
  to_account   uuid references accounts(id) on delete set null,
  amount       numeric(14,2) not null check (amount > 0),
  occurred_at  timestamptz not null default now(),
  note         text,
  created_at   timestamptz not null default now(),
  check (from_account <> to_account)
);
create index if not exists transfers_user_idx on transfers (user_id, occurred_at desc);
create index if not exists transfers_from_idx on transfers (from_account) where from_account is not null;
create index if not exists transfers_to_idx on transfers (to_account) where to_account is not null;

alter table transfers enable row level security;
drop policy if exists transfers_own on transfers;
create policy transfers_own on transfers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- wallet_balances now also reports what came in and went out by transfer (the return type
-- changes, so the old function is dropped first).
drop function if exists wallet_balances(uuid);
create function wallet_balances(p_user uuid)
returns table (
  id uuid, name text, kind text, is_default boolean, opening_balance numeric,
  income numeric, expense numeric, tx_count bigint,
  transfer_in numeric, transfer_out numeric
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
