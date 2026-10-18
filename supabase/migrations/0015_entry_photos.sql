-- A photo attached to an entry (food, the thing bought...). Additive and idempotent.
-- The image itself lives in the private `slips` bucket under "<user id>/photo-<hash>.<ext>";
-- it never goes through slip OCR and does not count toward the slip quota.
alter table transactions add column if not exists photo_path text;
alter table transactions add column if not exists photo_at timestamptz;

-- Photos attached this month are counted per user (monthly cap in the app).
create index if not exists transactions_photo_at_idx
  on transactions (user_id, photo_at) where photo_at is not null;

-- "The next image I send belongs to this entry": one short-lived row per user.
-- Server only (RLS on, no policies), like rate_limits.
create table if not exists photo_waits (
  user_id    uuid primary key references users(id) on delete cascade,
  tx_id      uuid not null references transactions(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table photo_waits enable row level security;
