-- JodTang: core schema. All timestamps are timestamptz (UTC).
-- Idempotent: safe to run more than once.

create extension if not exists pgcrypto;

-- ───── enums ─────
do $$
begin
  create type plan_tier         as enum ('free', 'plus');
exception when duplicate_object then null; end $$;
do $$
begin
  create type tx_type           as enum ('expense', 'income');
exception when duplicate_object then null; end $$;
do $$
begin
  create type budget_cycle      as enum ('monthly', 'weekly');
exception when duplicate_object then null; end $$;
do $$
begin
  create type confirm_style     as enum ('full', 'short', 'off');
exception when duplicate_object then null; end $$;
do $$
begin
  create type account_kind      as enum ('cash', 'bank', 'card', 'ewallet');
exception when duplicate_object then null; end $$;
do $$
begin
  create type tx_source         as enum ('text', 'slip', 'manual', 'recurring');
exception when duplicate_object then null; end $$;
do $$
begin
  create type tx_status         as enum ('confirmed', 'pending_confirm', 'deleted');
exception when duplicate_object then null; end $$;
do $$
begin
  create type recurring_cadence as enum ('daily', 'weekly', 'monthly');
exception when duplicate_object then null; end $$;

-- ───── helpers ─────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───── users ─────
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  line_user_id    text not null unique,
  display_name    text,
  picture_url     text,
  plan            plan_tier not null default 'free',
  plan_expires_at timestamptz,
  locale          text not null default 'th',
  currency        text not null default 'THB',
  timezone        text not null default 'Asia/Bangkok',
  points          int  not null default 0 check (points >= 0),
  referral_code   text not null unique
                  default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  referred_by     uuid references users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists user_settings (
  user_id                uuid primary key references users(id) on delete cascade,
  budget_cycle           budget_cycle  not null default 'monthly',
  cycle_start_day        int  not null default 1 check (cycle_start_day between 1 and 28),
  confirm_style          confirm_style not null default 'full',
  daily_reminder_time    time,
  daily_reminder_enabled boolean not null default false
);

-- ───── categories (user_id null = system default) ─────
create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete cascade,
  type       tx_type not null,
  name       text not null,
  icon       text,
  color      text,
  keywords   text[] not null default '{}',
  sort_order int  not null default 0,
  is_hidden  boolean not null default false
);
create index if not exists categories_user_idx on categories(user_id, type, sort_order);
-- lets the seed use ON CONFLICT for system categories
create unique index if not exists categories_system_uq on categories(type, name) where user_id is null;
create unique index if not exists categories_user_uq on categories(user_id, type, name) where user_id is not null;

-- ───── budgets (category_id null = overall budget) ─────
create table if not exists budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  cycle       budget_cycle not null default 'monthly',
  created_at  timestamptz not null default now()
);
-- one overall budget and one budget per category, per user
create unique index if not exists budgets_overall_uq on budgets(user_id) where category_id is null;
create unique index if not exists budgets_category_uq on budgets(user_id, category_id) where category_id is not null;

-- ───── accounts ─────
create table if not exists accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null,
  kind       account_kind not null default 'cash',
  is_default boolean not null default false
);
create index if not exists accounts_user_idx on accounts(user_id);

-- ───── slips ─────
create table if not exists slips (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  storage_path text not null,
  image_sha256 text not null,
  ocr_json     jsonb,
  slip_ref     text,
  amount       numeric(14,2),
  payee        text,
  bank         text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, slip_ref),
  unique (user_id, image_sha256)
);

-- ───── transactions (soft delete via status) ─────
create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  type        tx_type not null,
  amount      numeric(14,2) not null check (amount > 0),
  title       text not null,
  note        text,
  category_id uuid references categories(id) on delete set null,
  account_id  uuid references accounts(id) on delete set null,
  occurred_at timestamptz not null default now(),
  source      tx_source not null default 'text',
  status      tx_status not null default 'confirmed',
  slip_id     uuid references slips(id) on delete set null,
  raw_text    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists transactions_user_time_idx on transactions(user_id, occurred_at desc);
create index if not exists transactions_user_cat_idx  on transactions(user_id, category_id);
create or replace trigger transactions_updated_at before update on transactions
  for each row execute function set_updated_at();

-- ───── learning: payee/keyword → category ─────
create table if not exists merchant_memory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  match_text  text not null,
  category_id uuid not null references categories(id) on delete cascade,
  hit_count   int not null default 1,
  unique (user_id, match_text)
);

-- ───── recurring rules ─────
create table if not exists recurring_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  type          tx_type not null,
  amount        numeric(14,2) not null check (amount > 0),
  title         text not null,
  category_id   uuid references categories(id) on delete set null,
  cadence       recurring_cadence not null,
  day_of_period int,
  next_run_at   timestamptz not null,
  is_active     boolean not null default true
);
create index if not exists recurring_due_idx on recurring_rules(next_run_at) where is_active;

-- ───── webhook idempotency ─────
create table if not exists line_events (
  event_id    text primary key,
  received_at timestamptz not null default now()
);

-- ───── points ─────
create table if not exists point_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  delta      int  not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
create index if not exists point_ledger_user_idx on point_ledger(user_id, created_at desc);
