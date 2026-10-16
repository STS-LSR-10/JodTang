-- Phase 5: points ledger idempotency, referral, redeem, reminder bookkeeping.
-- Idempotent: safe to run more than once.

-- one ledger entry per (user, reason, ref): "daily" uses the Bangkok date as ref, so a day
-- can only be rewarded once even if two requests race
alter table point_ledger add column if not exists ref text;
create unique index if not exists point_ledger_ref_uq
  on point_ledger(user_id, reason, ref) where ref is not null;

-- last Bangkok day a reminder was pushed (so it is sent at most once a day)
alter table user_settings add column if not exists last_reminded_on date;

-- ───── award points (idempotent) ─────
create or replace function award_points(p_user uuid, p_delta int, p_reason text, p_ref text)
returns boolean
language plpgsql as $$
declare
  inserted int;
begin
  insert into point_ledger (user_id, delta, reason, ref)
  values (p_user, p_delta, p_reason, p_ref)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false; -- already awarded
  end if;
  update users set points = greatest(0, points + p_delta) where id = p_user;
  return true;
end $$;

-- ───── redeem points for Plus days (atomic) ─────
create or replace function redeem_points(p_user uuid, p_points int, p_days int)
returns timestamptz
language plpgsql as $$
declare
  cur int;
  exp timestamptz;
begin
  if p_points <= 0 or p_days <= 0 then
    raise exception 'invalid_redeem';
  end if;
  select points, plan_expires_at into cur, exp from users where id = p_user for update;
  if cur is null or cur < p_points then
    raise exception 'not_enough_points';
  end if;
  update users
     set points = points - p_points,
         plan_expires_at = greatest(now(), coalesce(exp, now())) + make_interval(days => p_days)
   where id = p_user
   returning plan_expires_at into exp;
  insert into point_ledger (user_id, delta, reason) values (p_user, -p_points, 'redeem');
  return exp;
end $$;

-- ───── referral: attach a referrer to a new user ─────
create or replace function apply_referral(p_user uuid, p_code text, p_window_days int)
returns text
language plpgsql as $$
declare
  referrer uuid;
  me_referred uuid;
  me_created timestamptz;
begin
  select id into referrer from users where referral_code = upper(trim(p_code));
  if referrer is null then return 'invalid'; end if;
  if referrer = p_user then return 'self'; end if;
  select referred_by, created_at into me_referred, me_created from users where id = p_user for update;
  if me_referred is not null then return 'already'; end if;
  if me_created < now() - make_interval(days => p_window_days) then return 'expired'; end if;
  update users set referred_by = referrer where id = p_user;
  return 'ok';
end $$;

-- ───── referral bonus: paid once, when the referred user first records something ─────
create or replace function grant_referral_bonus(p_user uuid, p_referrer_bonus int, p_referee_bonus int)
returns boolean
language plpgsql as $$
declare
  referrer uuid;
  granted boolean;
begin
  select referred_by into referrer from users where id = p_user;
  if referrer is null then return false; end if;
  granted := award_points(p_user, p_referee_bonus, 'referral_welcome', p_user::text);
  if granted then
    perform award_points(referrer, p_referrer_bonus, 'referral', p_user::text);
  end if;
  return granted;
end $$;

-- these change balances: server (service role) only, never callable from the browser
revoke execute on function award_points(uuid, int, text, text) from public, anon, authenticated;
revoke execute on function redeem_points(uuid, int, int) from public, anon, authenticated;
revoke execute on function apply_referral(uuid, text, int) from public, anon, authenticated;
revoke execute on function grant_referral_bonus(uuid, int, int) from public, anon, authenticated;
