-- Remember whether a card subscription bills monthly or yearly, so the app can offer
-- "upgrade" / "switch to yearly" (Stripe charges only the difference). Idempotent.

alter table users add column if not exists billing_period text
  check (billing_period in ('monthly', 'yearly'));

-- same as set_plan_until (0009) plus the billing period; the 5-argument version stays for old callers
create or replace function set_plan_until(
  p_user uuid, p_plan plan_tier, p_until timestamptz, p_customer text, p_subscription text, p_period text
) returns timestamptz
language plpgsql as $$
declare
  exp timestamptz;
begin
  if p_period is not null and p_period not in ('monthly', 'yearly') then
    raise exception 'invalid_period';
  end if;
  select plan_expires_at into exp from users where id = p_user for update;
  update users
     set plan = p_plan,
         plan_expires_at = greatest(coalesce(exp, p_until), p_until),
         stripe_customer_id = coalesce(p_customer, stripe_customer_id),
         stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id),
         billing_period = coalesce(p_period, billing_period)
   where id = p_user
   returning plan_expires_at into exp;
  return exp;
end $$;

revoke execute on function set_plan_until(uuid, plan_tier, timestamptz, text, text, text) from public, anon, authenticated;