-- Free trials (once per user and tier) and prepaid upgrades (PromptPay: pay the difference).
-- Idempotent: safe to run more than once.

-- a payment is either a normal purchase or an upgrade of prepaid time already running
alter table payments add column if not exists kind text not null default 'purchase'
  check (kind in ('purchase', 'upgrade'));

create table if not exists plan_trials (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  plan        plan_tier not null check (plan <> 'free'),
  started_at  timestamptz not null default now(),
  unique (user_id, plan)
);
alter table plan_trials enable row level security;
drop policy if exists plan_trials_select_own on plan_trials;
create policy plan_trials_select_own on plan_trials for select using (user_id = auth.uid());
-- no write policies: trials are started by the server only

-- ───── start a free trial: once per (user, tier), only while nothing paid or redeemed is running ─────
create or replace function start_plan_trial(p_user uuid, p_plan plan_tier, p_days int default 7)
returns timestamptz
language plpgsql as $$
declare
  cur plan_tier;
  exp timestamptz;
  inserted int;
begin
  if p_plan = 'free' or p_days <= 0 then raise exception 'invalid_trial'; end if;
  select plan, plan_expires_at into cur, exp from users where id = p_user for update;
  if not found then raise exception 'unknown_user'; end if;
  if exp is not null and exp > now() then return null; end if;   -- a plan (paid, redeemed or trial) is running
  if cur <> 'free' and exp is null then return null; end if;      -- a plan without an end date

  insert into plan_trials (user_id, plan) values (p_user, p_plan) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return null; end if;                       -- this tier was tried before

  update users
     set plan = p_plan, plan_expires_at = now() + make_interval(days => p_days)
   where id = p_user
   returning plan_expires_at into exp;
  return exp;
end $$;

-- ───── prepaid upgrade: raise the tier of time already paid for, keeping the end date ─────
-- Returns false when it was already applied, or when the prepaid time ended in the meantime
-- (the payment is still recorded so it can be refunded by hand).
create or replace function apply_prepaid_upgrade(
  p_user uuid, p_plan plan_tier, p_ref text, p_amount int, p_method text
) returns boolean
language plpgsql as $$
declare
  inserted int;
  changed int;
begin
  insert into payments (user_id, provider_ref, plan, months, amount, method, kind)
  values (p_user, p_ref, p_plan, 1, p_amount, p_method, 'upgrade')
  on conflict (provider, provider_ref) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return false; end if;

  update users
     set plan = p_plan
   where id = p_user and plan_expires_at > now() and plan < p_plan;
  get diagnostics changed = row_count;
  return changed > 0;
end $$;

revoke execute on function start_plan_trial(uuid, plan_tier, int) from public, anon, authenticated;
revoke execute on function apply_prepaid_upgrade(uuid, plan_tier, text, int, text) from public, anon, authenticated;