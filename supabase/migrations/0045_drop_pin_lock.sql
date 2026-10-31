-- The PIN lock was removed from the app. Drops what 0031 created (the stored PIN hashes with it,
-- which is the point: nothing of the lock is kept). Idempotent. Run it AFTER the app without the
-- lock is deployed, or right before: nothing reads these any more.
drop function if exists pin_take_attempt(uuid, timestamptz, int);
drop function if exists pin_clear_attempts(uuid, timestamptz);
drop table if exists user_security;
