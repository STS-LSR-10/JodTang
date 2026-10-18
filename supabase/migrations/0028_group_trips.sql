-- Trips in a group ledger: a stretch of entries that are split between the people on the trip, with
-- a summary of who has to pay whom at the end. Additive and idempotent; server only like the rest
-- of the group ledger (RLS on, no policies).
create table if not exists group_trips (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references bot_groups(id) on delete cascade,
  name       text not null check (length(name) between 1 and 40),
  -- LINE user id of whoever started it (may close it, like the owner of the ledger)
  started_by text not null,
  status     text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
-- one open trip per group at a time
create unique index if not exists group_trips_one_open_uq on group_trips (group_id) where status = 'open';
create index if not exists group_trips_group_idx on group_trips (group_id, created_at desc);

create table if not exists group_trip_members (
  trip_id      uuid not null references group_trips(id) on delete cascade,
  line_user_id text not null,
  joined_at    timestamptz not null default now(),
  primary key (trip_id, line_user_id)
);

-- An entry written during a trip belongs to it and is split between `split_users` (the people it
-- was shared with, decided when it was written). Entries may also be in a foreign currency: the
-- baht amount stays in `amount`, the original beside it (like personal entries).
alter table group_entries add column if not exists trip_id uuid references group_trips(id) on delete set null;
alter table group_entries add column if not exists split_mode text not null default 'all'
  check (split_mode in ('all', 'only', 'except'));
alter table group_entries add column if not exists split_users text[] not null default '{}';
alter table group_entries add column if not exists orig_currency text
  check (orig_currency is null or orig_currency ~ '^[A-Z]{3}$');
alter table group_entries add column if not exists orig_amount numeric(14,2)
  check (orig_amount is null or orig_amount > 0);
alter table group_entries add column if not exists fx_rate numeric(18,8)
  check (fx_rate is null or fx_rate > 0);
create index if not exists group_entries_trip_idx on group_entries (trip_id) where trip_id is not null;

alter table group_trips enable row level security;
alter table group_trip_members enable row level security;
