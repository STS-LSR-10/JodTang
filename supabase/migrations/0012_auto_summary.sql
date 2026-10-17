-- Automatic weekly / monthly summary pushed to the chat (Professional and above, opt-in).
-- Idempotent: safe to run more than once.
alter table user_settings add column if not exists weekly_summary_enabled boolean not null default false;
alter table user_settings add column if not exists monthly_summary_enabled boolean not null default false;
-- last Bangkok day each summary was pushed (so it is sent at most once per period)
alter table user_settings add column if not exists last_weekly_summary_on date;
alter table user_settings add column if not exists last_monthly_summary_on date;