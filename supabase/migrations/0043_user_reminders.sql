-- Reminders ("เตือน"): "เตือน พรุ่งนี้ 9 โมง จ่ายค่าไฟ" is pushed to the person at that time, once or
-- repeating (daily / weekly / monthly). Separate from the daily "you have not recorded today" nudge and
-- from bill reminders. Additive and idempotent. Times are stored as timestamptz; repeating ones step
-- in Bangkok local time (Asia/Bangkok has no daylight saving).
create table if not exists user_reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 200),
  remind_at    timestamptz not null,
  repeat       text check (repeat in ('daily', 'weekly', 'monthly')),
  status       text not null default 'active' check (status in ('active', 'done')),
  last_sent_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists user_reminders_due_idx on user_reminders (remind_at) where status = 'active';
create index if not exists user_reminders_user_idx on user_reminders (user_id, remind_at);

alter table user_reminders enable row level security;
drop policy if exists user_reminders_own on user_reminders;
create policy user_reminders_own on user_reminders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Take the reminders that are due, once each: a one-off is marked done, a repeating one is moved to its
-- next time after `p_now` (so a missed day is not sent twice). The rows are locked, so two cron runs at
-- once never send the same one. Returns who to push to. Server only.
create or replace function claim_due_reminders(p_now timestamptz, p_limit int)
returns table (r_id uuid, r_user uuid, r_line text, r_body text, r_repeat text)
language plpgsql security invoker as $$
declare
  r record;
  step interval;
  local_at timestamp;
  guard int;
begin
  for r in
    select ur.id as rid, ur.user_id as uid, ur.body as rbody, ur.remind_at as rat,
           ur.repeat as rrep, u.line_user_id as rline
    from user_reminders ur
    join users u on u.id = ur.user_id
    where ur.status = 'active' and ur.remind_at <= p_now
    order by ur.remind_at
    limit p_limit
    for update of ur skip locked
  loop
    if r.rrep is null then
      update user_reminders set status = 'done', last_sent_at = p_now where id = r.rid;
    else
      step := case r.rrep when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end;
      local_at := r.rat at time zone 'Asia/Bangkok';
      guard := 0;
      loop
        local_at := local_at + step;
        guard := guard + 1;
        exit when (local_at at time zone 'Asia/Bangkok') > p_now or guard > 1000;
      end loop;
      update user_reminders
        set remind_at = local_at at time zone 'Asia/Bangkok', last_sent_at = p_now
        where id = r.rid;
    end if;
    r_id := r.rid; r_user := r.uid; r_line := r.rline; r_body := r.rbody; r_repeat := r.rrep;
    return next;
  end loop;
end $$;

revoke execute on function claim_due_reminders(timestamptz, int) from public, anon, authenticated;
