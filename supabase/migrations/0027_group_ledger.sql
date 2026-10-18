-- Group ledger: the bot sits in a LINE group and the members write expenses together. Kept apart
-- from personal `transactions`: group money never mixes into anybody's own summaries.
-- All three tables are server only (RLS on, no policies), like photo_waits. Additive and idempotent.

-- One row per LINE group the ledger was opened in. The owner is the Ultimate member who opened it;
-- the ledger works while the owner's plan is Ultimate and is read only after that.
create table if not exists bot_groups (
  id            uuid primary key default gen_random_uuid(),
  line_group_id text not null unique,
  owner_user_id uuid not null references users(id) on delete cascade,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);
create index if not exists bot_groups_owner_idx on bot_groups (owner_user_id) where is_active;

-- Who is who in a group: LINE user id and the name shown, so entries can say who paid.
create table if not exists group_members (
  group_id      uuid not null references bot_groups(id) on delete cascade,
  line_user_id  text not null,
  display_name  text not null,
  updated_at    timestamptz not null default now(),
  primary key (group_id, line_user_id)
);

-- Expenses written in the group; `payer_line_user_id` is who paid.
create table if not exists group_entries (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references bot_groups(id) on delete cascade,
  payer_line_user_id text not null,
  title              text not null check (length(title) between 1 and 60),
  amount             numeric(14,2) not null check (amount > 0),
  occurred_at        timestamptz not null default now(),
  status             text not null default 'confirmed' check (status in ('confirmed', 'deleted')),
  raw_text           text,
  created_at         timestamptz not null default now()
);
create index if not exists group_entries_group_idx on group_entries (group_id, occurred_at desc);

alter table bot_groups enable row level security;
alter table group_members enable row level security;
alter table group_entries enable row level security;

-- What each member paid in a period: payer, total and number of entries.
create or replace function group_payer_totals(p_group uuid, p_from timestamptz, p_to timestamptz)
returns table (payer_line_user_id text, total numeric, entries bigint)
language sql stable security invoker as $$
  select e.payer_line_user_id, sum(e.amount), count(*)
  from group_entries e
  where e.group_id = p_group
    and e.status = 'confirmed'
    and e.occurred_at >= p_from and e.occurred_at < p_to
  group by e.payer_line_user_id
  order by sum(e.amount) desc;
$$;
