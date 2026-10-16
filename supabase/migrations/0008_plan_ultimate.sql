-- Third plan tier. The existing 'plus' value is the Professional tier (display name only).
-- Idempotent. The new value is not used inside this migration, so it is safe in a transaction.
alter type plan_tier add value if not exists 'ultimate';
