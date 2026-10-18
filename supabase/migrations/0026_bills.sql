-- Bill reminders: things to pay on a date (electricity, a credit card...), with a push to the chat
-- a few days before. A bill only reminds; it does not record anything. Additive and idempotent.
create table if not exists bills (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  name          text not null check (length(name) between 1 and 40),
  amount        numeric(14,2) check (amount is null or amount > 0),
  cadence       text not null check (cadence in ('monthly', 'yearly', 'once')),
  day_of_month  smallint not null check (day_of_month between 1 and 31),
  month_of_year smallint check (month_of_year is null or month_of_year between 1 and 12),
  next_due_on   date not null,
  -- days before the due date to remind on (0 = the day itself)
  remind_days   smallint[] not null default '{1}',
  -- hour of the day (Bangkok time) the reminder goes out
  remind_hour   smallint not null default 9 check (remind_hour between 0 and 23),
  -- "remind me again" on this day, once
  snoozed_on    date,
  note          text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists bills_user_idx on bills (user_id, next_due_on) where is_active;
create unique index if not exists bills_name_uq on bills (user_id, lower(name)) where is_active;

-- One row per reminder already sent, so the hourly job never sends it twice. `key` says which:
-- "<bill id or card:<wallet id>>:<due date>:<days before>" (also ":overdue" and "snooze:<day>").
-- Server only (RLS on, no policies), like rate_limits.
create table if not exists bill_reminders (
  user_id uuid not null references users(id) on delete cascade,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table bill_reminders enable row level security;

alter table bills enable row level security;
drop policy if exists bills_own on bills;
create policy bills_own on bills
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
