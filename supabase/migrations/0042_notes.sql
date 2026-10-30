-- Notes ("โน้ต"): free text the person jots down (a Wi-Fi password, a shopping list, a thought) and
-- searches later, from the chat or from the web app. Kept apart from money. Additive and idempotent.
create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_idx on notes (user_id, created_at desc);

alter table notes enable row level security;
drop policy if exists notes_own on notes;
create policy notes_own on notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
