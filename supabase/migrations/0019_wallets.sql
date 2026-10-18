-- Wallets (cash, bank account, credit card, savings, e-wallet) on top of the accounts table that
-- has existed since 0001. Additive and idempotent.
-- (The new enum value is not used inside this migration, so it is safe in a transaction.)
alter type account_kind add value if not exists 'savings';

alter table accounts add column if not exists opening_balance numeric(14,2) not null default 0;
alter table accounts add column if not exists created_at timestamptz not null default now();

-- a name is used once per person (ignoring case), and at most one wallet is the main one
create unique index if not exists accounts_user_name_uq on accounts (user_id, lower(name));
create unique index if not exists accounts_one_default_uq on accounts (user_id) where is_default;
create index if not exists transactions_account_idx on transactions (account_id) where account_id is not null;

-- Balance of every wallet of a person: opening balance + income - expense. Entries with no wallet
-- (everything recorded before wallets existed) belong to the main wallet. security invoker, like
-- summary_by_period; the server passes p_user explicitly.
-- (dropped first so the migrations can run again after 0020 changed the return type)
drop function if exists wallet_balances(uuid);
create function wallet_balances(p_user uuid)
returns table (
  id uuid, name text, kind text, is_default boolean, opening_balance numeric,
  income numeric, expense numeric, tx_count bigint
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
    count(t.id)
  from accounts a
  left join transactions t
    on t.user_id = a.user_id
   and t.status = 'confirmed'
   and (t.account_id = a.id or (a.is_default and t.account_id is null))
  where a.user_id = p_user
  group by a.id
  order by a.is_default desc, a.created_at, a.name;
$$;
