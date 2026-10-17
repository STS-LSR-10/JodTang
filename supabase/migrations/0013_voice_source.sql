-- Entries recorded from a voice message get their own source. Idempotent.
-- (The new value is not used inside this migration, so it is safe in a transaction.)
alter type tx_source add value if not exists 'voice';