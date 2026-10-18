-- Monthly (and lifetime) use counters for the paid-per-use features: voice messages and the AI that
-- reads long sentences. Additive and idempotent. Server-only table (RLS on, no policies).
--   month = first day of the Bangkok month; the date 2000-01-01 is the "lifetime" bucket (the one
--   free taste of voice a Free account gets).
create table if not exists usage_counters (
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  month date not null,
  used int not null default 0 check (used >= 0),
  primary key (user_id, kind, month)
);
alter table usage_counters enable row level security;

-- Use one if any is left (one atomic step: parallel messages cannot take more than the limit).
create or replace function take_usage(p_user uuid, p_kind text, p_month date, p_limit int)
returns boolean
language plpgsql security invoker as $$
declare n int;
begin
  insert into usage_counters (user_id, kind, month) values (p_user, p_kind, p_month) on conflict do nothing;
  update usage_counters set used = used + 1
   where user_id = p_user and kind = p_kind and month = p_month and used < p_limit;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Give one back (the work failed, so it must not count).
create or replace function refund_usage(p_user uuid, p_kind text, p_month date)
returns void
language sql security invoker as $$
  update usage_counters set used = greatest(0, used - 1)
   where user_id = p_user and kind = p_kind and month = p_month;
$$;

revoke execute on function take_usage(uuid, text, date, int) from public, anon, authenticated;
revoke execute on function refund_usage(uuid, text, date) from public, anon, authenticated;
