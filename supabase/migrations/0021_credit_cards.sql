-- Credit-card wallets: a limit and the statement cycle. Additive and idempotent.
-- A card is an `accounts` row of kind 'card'; its balance (negative = owed) already comes from
-- wallet_balances, so only the limit and the two days are new.
alter table accounts add column if not exists credit_limit numeric(14,2) check (credit_limit is null or credit_limit > 0);
alter table accounts add column if not exists statement_day smallint check (statement_day is null or statement_day between 1 and 28);
alter table accounts add column if not exists due_day smallint check (due_day is null or due_day between 1 and 28);

-- wallet_balances also returns the card fields (the return type changes, so drop it first)
drop function if exists wallet_balances(uuid);
create function wallet_balances(p_user uuid)
returns table (
  id uuid, name text, kind text, is_default boolean, opening_balance numeric,
  income numeric, expense numeric, tx_count bigint,
  transfer_in numeric, transfer_out numeric,
  credit_limit numeric, statement_day smallint, due_day smallint
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
    a.due_day
  from accounts a
  left join transactions t
    on t.user_id = a.user_id
   and t.status = 'confirmed'
   and (t.account_id = a.id or (a.is_default and t.account_id is null))
  where a.user_id = p_user
  group by a.id
  order by a.is_default desc, a.created_at, a.name;
$$;

-- What was spent (expenses only) on one wallet between two moments; used for a card's
-- statement-cycle totals. Entries with no wallet count for the main wallet.
create or replace function wallet_expense_between(p_user uuid, p_account uuid, p_from timestamptz, p_to timestamptz)
returns numeric
language sql stable security invoker as $$
  select coalesce(sum(t.amount), 0)
  from accounts a
  join transactions t
    on t.user_id = a.user_id
   and t.status = 'confirmed'
   and t.type = 'expense'
   and t.occurred_at >= p_from and t.occurred_at < p_to
   and (t.account_id = a.id or (a.is_default and t.account_id is null))
  where a.id = p_account and a.user_id = p_user;
$$;
