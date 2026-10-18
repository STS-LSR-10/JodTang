-- Upsell helpers. Additive and idempotent. Server-only tables (RLS on, no policies).
--  * upsell_state: how many of the free "teaser" slip reads a person has used. Lifetime, never reset
--    (not touched by "erase my data" either, or it could be used again and again).
--  * upsell_seen: which upgrade card was already shown to a person on which day, so the full card
--    is sent at most once per feature per day.
create table if not exists upsell_state (
  user_id uuid primary key references users(id) on delete cascade,
  teaser_slips_used int not null default 0 check (teaser_slips_used >= 0)
);
create table if not exists upsell_seen (
  user_id uuid not null references users(id) on delete cascade,
  feature text not null check (char_length(feature) between 1 and 40),
  day date not null,
  primary key (user_id, feature, day)
);
alter table upsell_state enable row level security;
alter table upsell_seen  enable row level security;

-- Use one teaser read if any is left (one atomic step: parallel photos cannot take more than the limit).
create or replace function take_teaser_slip(p_user uuid, p_limit int)
returns boolean
language plpgsql security invoker as $$
declare n int;
begin
  insert into upsell_state (user_id) values (p_user) on conflict do nothing;
  update upsell_state set teaser_slips_used = teaser_slips_used + 1
   where user_id = p_user and teaser_slips_used < p_limit;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Give one back (the read failed, so it must not count).
create or replace function refund_teaser_slip(p_user uuid)
returns void
language sql security invoker as $$
  update upsell_state set teaser_slips_used = greatest(0, teaser_slips_used - 1) where user_id = p_user;
$$;

-- True the first time this card is shown to this person on this day.
create or replace function claim_upsell_card(p_user uuid, p_feature text, p_day date)
returns boolean
language plpgsql security invoker as $$
declare n int;
begin
  insert into upsell_seen (user_id, feature, day) values (p_user, p_feature, p_day) on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function take_teaser_slip(uuid, int) from public, anon, authenticated;
revoke execute on function refund_teaser_slip(uuid) from public, anon, authenticated;
revoke execute on function claim_upsell_card(uuid, text, date) from public, anon, authenticated;
