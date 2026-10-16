-- Phase 6: fixed-window rate limiting in Postgres (no extra service needed).
-- Idempotent: safe to run more than once.

create table if not exists rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hit_count    int         not null default 0,
  primary key (key, window_start)
);

-- server only: RLS on and no policies, so anon/authenticated can never read or write it
alter table rate_limits enable row level security;

-- Count one hit for `p_key` in the current window and say whether it is still allowed.
create or replace function check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns table (is_allowed boolean, hits_in_window int)
language plpgsql as $$
declare
  ws timestamptz;
  n  int;
begin
  if p_window_seconds <= 0 or p_limit <= 0 then
    raise exception 'invalid_rate_limit';
  end if;
  ws := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limits as r (key, window_start, hit_count)
  values (p_key, ws, 1)
  on conflict (key, window_start) do update set hit_count = r.hit_count + 1
  returning r.hit_count into n;

  -- housekeeping: now and then drop windows older than a day
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select n <= p_limit, n;
end $$;

revoke execute on function check_rate_limit(text, int, int) from public, anon, authenticated;
