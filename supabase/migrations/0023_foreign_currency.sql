-- Entries in a foreign currency ("1500 JPY"). `amount` stays the amount in baht (converted at the
-- rate of the entry's day), so every summary, budget and chart keeps working unchanged; the
-- original amount, its currency and the rate are kept alongside for display and export.
-- Additive and idempotent.
alter table transactions add column if not exists orig_currency text
  check (orig_currency is null or orig_currency ~ '^[A-Z]{3}$');
alter table transactions add column if not exists orig_amount numeric(14,2)
  check (orig_amount is null or orig_amount > 0);
alter table transactions add column if not exists fx_rate numeric(18,8)
  check (fx_rate is null or fx_rate > 0);

-- Daily exchange rates (baht per 1 unit of `currency`), cached so the rate source is asked once
-- per day and currency. `day` is the day asked for, `source_day` the day the rate is from (a
-- weekend gets Friday's). Server only (RLS on, no policies), like rate_limits.
create table if not exists fx_rates (
  day        date not null,
  currency   text not null check (currency ~ '^[A-Z]{3}$'),
  rate       numeric(18,8) not null check (rate > 0),
  source_day date not null,
  fetched_at timestamptz not null default now(),
  primary key (day, currency)
);
alter table fx_rates enable row level security;
