-- RLS on every table. Policies restrict rows to user_id = auth.uid().
-- Webhook / cron use the service role (bypasses RLS) on the server only.
-- Idempotent: policies are dropped and re-created.

alter table users           enable row level security;
alter table user_settings   enable row level security;
alter table categories      enable row level security;
alter table budgets         enable row level security;
alter table accounts        enable row level security;
alter table slips           enable row level security;
alter table transactions    enable row level security;
alter table merchant_memory enable row level security;
alter table recurring_rules enable row level security;
alter table line_events     enable row level security;
alter table point_ledger    enable row level security;

-- users: own row only. Plan/points are changed server-side, so no update policy.
drop policy if exists users_select_own on users;
create policy users_select_own on users for select using (id = auth.uid());

-- user_settings
drop policy if exists user_settings_own on user_settings;
create policy user_settings_own on user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- categories: read system defaults (user_id null) + own; write own only
drop policy if exists categories_select on categories;
create policy categories_select on categories
  for select using (user_id is null or user_id = auth.uid());
drop policy if exists categories_insert on categories;
create policy categories_insert on categories
  for insert with check (user_id = auth.uid());
drop policy if exists categories_update on categories;
create policy categories_update on categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists categories_delete on categories;
create policy categories_delete on categories
  for delete using (user_id = auth.uid());

-- plain per-user tables
drop policy if exists budgets_own on budgets;
create policy budgets_own on budgets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists accounts_own on accounts;
create policy accounts_own on accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists slips_own on slips;
create policy slips_own on slips
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists transactions_own on transactions;
create policy transactions_own on transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists merchant_memory_own on merchant_memory;
create policy merchant_memory_own on merchant_memory
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists recurring_rules_own on recurring_rules;
create policy recurring_rules_own on recurring_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- point_ledger: read-only for the owner (written by server)
drop policy if exists point_ledger_select_own on point_ledger;
create policy point_ledger_select_own on point_ledger
  for select using (user_id = auth.uid());

-- line_events: no policies → service role only
