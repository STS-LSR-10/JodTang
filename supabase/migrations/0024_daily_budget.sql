-- A limit per day (all categories together), next to the budget per cycle. Additive and idempotent.
-- null = no daily limit. Spending of the day is worked out from the entries, nothing is stored.
alter table user_settings add column if not exists daily_budget numeric(14,2)
  check (daily_budget is null or daily_budget > 0);
