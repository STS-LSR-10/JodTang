-- "ถามพี่ฮูก" mode: after the person starts it, what they type next (for a few minutes) is a question to
-- the AI assistant, not an entry. One row per person; a new start replaces it. Additive and idempotent.
-- Server only (RLS on, no policies).
create table if not exists ask_waits (
  user_id    uuid primary key references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table ask_waits enable row level security;
