-- PIN lock for the web app (LIFF pages): the server refuses data until the right PIN was entered.
-- Server only (RLS on, no policies), like rate_limits. Additive and idempotent.
--  * the PIN itself is never stored: only a salted slow hash (scrypt, with a server-side pepper);
--  * wrong tries are counted here (not just in the page), so guessing is limited whatever client is used;
--  * "forgot my PIN" asks to remove it and takes effect after 24 hours, so someone holding the
--    phone cannot just wipe the lock, and the owner is told in the chat and can cancel.
create table if not exists user_security (
  user_id            uuid primary key references users(id) on delete cascade,
  pin_hash           text,
  pin_salt           text,
  failed_count       int not null default 0 check (failed_count >= 0),
  -- how many times in a row the lock was triggered (each one waits longer: 15 / 30 / 60 minutes)
  lock_level         int not null default 0 check (lock_level >= 0),
  locked_until       timestamptz,
  reset_requested_at timestamptz,
  updated_at         timestamptz not null default now(),
  -- a PIN is either complete or absent
  check ((pin_hash is null) = (pin_salt is null))
);
alter table user_security enable row level security;

-- One try at the PIN, counted BEFORE the PIN is checked and in one locked step, so many requests at
-- once cannot each slip through a check that has not seen the others' failures yet. Returns whether
-- this try may be checked (not while locked), how many tries remain, and the lock if it just started:
-- the 5th try in a row starts a lock of 15, then 30, then 60 minutes. A right PIN clears it all.
create or replace function pin_take_attempt(p_user uuid, p_now timestamptz, p_max int default 5)
returns table (allowed boolean, failed_count int, lock_level int, locked_until timestamptz, attempts_left int)
language plpgsql security invoker as $$
declare
  r user_security%rowtype;
  next_failed int;
  minutes int;
  until timestamptz;
begin
  select * into r from user_security where user_id = p_user for update;
  if not found then
    return query select false, 0, 0, null::timestamptz, 0;
    return;
  end if;
  if r.locked_until is not null and r.locked_until > p_now then
    return query select false, r.failed_count, r.lock_level, r.locked_until, 0;
    return;
  end if;
  next_failed := r.failed_count + 1;
  if next_failed >= p_max then
    minutes := case when r.lock_level = 0 then 15 when r.lock_level = 1 then 30 else 60 end;
    until := p_now + make_interval(mins => minutes);
    update user_security
       set failed_count = 0, lock_level = r.lock_level + 1, locked_until = until, updated_at = p_now
     where user_id = p_user;
    return query select true, 0, r.lock_level + 1, until, 0;
  else
    update user_security set failed_count = next_failed, updated_at = p_now where user_id = p_user;
    return query select true, next_failed, r.lock_level, null::timestamptz, p_max - next_failed;
  end if;
end;
$$;

create or replace function pin_clear_attempts(p_user uuid, p_now timestamptz)
returns void
language sql security invoker as $$
  update user_security
     set failed_count = 0, lock_level = 0, locked_until = null, updated_at = p_now
   where user_id = p_user;
$$;
