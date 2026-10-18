-- Savings goals ("piggy banks"): a name, a target amount and an optional date, filled by deposits
-- and withdrawals the person records. Kept apart from `transactions` and from wallets: a goal is
-- money they intend to set aside, so it never counts as income or expense. Additive and idempotent.
create table if not exists savings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  name          text not null check (length(name) between 1 and 40),
  emoji         text,
  target_amount numeric(14,2) not null check (target_amount > 0),
  due_on        date,
  created_at    timestamptz not null default now(),
  archived_at   timestamptz
);
create unique index if not exists savings_goals_name_uq
  on savings_goals (user_id, lower(name)) where archived_at is null;
create index if not exists savings_goals_user_idx on savings_goals (user_id, created_at);

-- amount > 0 is money put in, amount < 0 is money taken out
create table if not exists savings_deposits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  goal_id     uuid not null references savings_goals(id) on delete cascade,
  amount      numeric(14,2) not null check (amount <> 0),
  occurred_at timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists savings_deposits_goal_idx on savings_deposits (goal_id, occurred_at);

alter table savings_goals enable row level security;
alter table savings_deposits enable row level security;
drop policy if exists savings_goals_own on savings_goals;
create policy savings_goals_own on savings_goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists savings_deposits_own on savings_deposits;
create policy savings_deposits_own on savings_deposits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Every goal of a person with how much is saved so far (the live ones first).
create or replace function goal_balances(p_user uuid)
returns table (
  id uuid, name text, emoji text, target_amount numeric, due_on date,
  created_at timestamptz, archived_at timestamptz, saved numeric
)
language sql stable security invoker as $$
  select
    g.id, g.name, g.emoji, g.target_amount, g.due_on, g.created_at, g.archived_at,
    coalesce(sum(d.amount), 0)
  from savings_goals g
  left join savings_deposits d on d.goal_id = g.id
  where g.user_id = p_user
  group by g.id
  order by (g.archived_at is not null), g.created_at;
$$;
