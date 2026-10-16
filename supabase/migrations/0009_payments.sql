-- Stripe payments: customer/subscription ids on the user, a payment history, and the two
-- server-only functions that activate a plan. Idempotent: safe to run more than once.

alter table users add column if not exists stripe_customer_id text;
alter table users add column if not exists stripe_subscription_id text;
create unique index if not exists users_stripe_customer_uq
  on users(stripe_customer_id) where stripe_customer_id is not null;

-- one row per successful charge (Checkout session or subscription invoice)
create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  provider      text not null default 'stripe',
  provider_ref  text not null,                 -- Stripe session / invoice id: makes webhooks idempotent
  plan          plan_tier not null,
  months        int not null check (months > 0),
  amount        int not null check (amount >= 0), -- satang
  currency      text not null default 'thb',
  method        text,                          -- card | promptpay | ...
  status        text not null default 'paid' check (status in ('pending', 'paid', 'failed', 'refunded')),
  created_at    timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index if not exists payments_user_idx on payments(user_id, created_at desc);

alter table payments enable row level security;
drop policy if exists payments_select_own on payments;
create policy payments_select_own on payments for select using (user_id = auth.uid());
-- no insert/update/delete policies: only the server (service role) writes payments

-- ───── one-time (PromptPay / prepaid card) purchase: extends the plan, exactly once per ref ─────
create or replace function apply_prepaid_purchase(
  p_user uuid, p_plan plan_tier, p_months int, p_ref text, p_amount int, p_method text
) returns timestamptz
language plpgsql as $$
declare
  inserted int;
  exp timestamptz;
begin
  if p_months <= 0 then raise exception 'invalid_months'; end if;
  insert into payments (user_id, provider_ref, plan, months, amount, method)
  values (p_user, p_ref, p_plan, p_months, p_amount, p_method)
  on conflict (provider, provider_ref) do nothing;
  get diagnostics inserted = row_count;

  select plan_expires_at into exp from users where id = p_user for update;
  if inserted = 0 then
    return exp; -- this payment was already applied
  end if;
  update users
     set plan = p_plan,
         plan_expires_at = greatest(now(), coalesce(exp, now())) + make_interval(months => p_months)
   where id = p_user
   returning plan_expires_at into exp;
  return exp;
end $$;

-- ───── subscription: the plan is paid until the end of the current period (never shortened) ─────
create or replace function set_plan_until(
  p_user uuid, p_plan plan_tier, p_until timestamptz, p_customer text, p_subscription text
) returns timestamptz
language plpgsql as $$
declare
  exp timestamptz;
begin
  select plan_expires_at into exp from users where id = p_user for update;
  update users
     set plan = p_plan,
         plan_expires_at = greatest(coalesce(exp, p_until), p_until),
         stripe_customer_id = coalesce(p_customer, stripe_customer_id),
         stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id)
   where id = p_user
   returning plan_expires_at into exp;
  return exp;
end $$;

-- ───── record a subscription invoice in the history (idempotent) ─────
create or replace function record_payment(
  p_user uuid, p_plan plan_tier, p_months int, p_ref text, p_amount int, p_method text
) returns boolean
language plpgsql as $$
declare
  inserted int;
begin
  insert into payments (user_id, provider_ref, plan, months, amount, method)
  values (p_user, p_ref, p_plan, p_months, p_amount, p_method)
  on conflict (provider, provider_ref) do nothing;
  get diagnostics inserted = row_count;
  return inserted > 0;
end $$;

-- these change plans: server (service role) only, never callable from the browser
revoke execute on function apply_prepaid_purchase(uuid, plan_tier, int, text, int, text) from public, anon, authenticated;
revoke execute on function set_plan_until(uuid, plan_tier, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function record_payment(uuid, plan_tier, int, text, int, text) from public, anon, authenticated;
