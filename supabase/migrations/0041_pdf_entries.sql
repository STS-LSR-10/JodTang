-- Record from a PDF (statement, bill, list): entries get their own source, and each file that was read
-- is remembered by its hash so the same file is not read twice. Additive and idempotent.
-- Server only (RLS on, no policies), like usage_counters.

alter type tx_source add value if not exists 'pdf';

create table if not exists pdf_imports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  sha256     text not null check (char_length(sha256) = 64),
  created_at timestamptz not null default now(),
  unique (user_id, sha256)
);
alter table pdf_imports enable row level security;
