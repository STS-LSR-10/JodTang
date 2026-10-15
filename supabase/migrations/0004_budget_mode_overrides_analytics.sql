-- Phase 3: budget mode, per-user overrides of system categories, analytics series.
-- Idempotent: safe to run more than once.

-- ───── budget mode: one overall budget or one per category ─────
alter table user_settings
  add column if not exists budget_mode text not null default 'overall';

do $$
begin
  alter table user_settings
    add constraint user_settings_budget_mode_check check (budget_mode in ('overall', 'category'));
exception when duplicate_object then null; end $$;

-- ───── per-user tweaks to shared system categories ─────
-- System categories (categories.user_id is null) are shared rows. A user hides,
-- reorders or re-keywords one by storing an override instead of editing the row.
create table if not exists category_overrides (
  user_id     uuid not null references users(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  keywords    text[],
  is_hidden   boolean,
  sort_order  int,
  primary key (user_id, category_id)
);

alter table category_overrides enable row level security;
drop policy if exists category_overrides_own on category_overrides;
create policy category_overrides_own on category_overrides
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───── income/expense per day|week|month bucket (Asia/Bangkok) ─────
create or replace function analytics_series(
  p_user uuid, p_from timestamptz, p_to timestamptz, p_bucket text
) returns table (bucket_start timestamptz, income numeric, expense numeric)
language sql stable security invoker as $$
  select
    (date_trunc(p_bucket, t.occurred_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'),
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
  from transactions t
  where t.user_id = p_user
    and t.status = 'confirmed'
    and t.occurred_at >= p_from
    and t.occurred_at <  p_to
    and p_bucket in ('day', 'week', 'month')
  group by 1
  order by 1;
$$;
