-- Card colour theme and the bot's manner of speaking (Professional and above). Additive and idempotent.
-- Existing users keep today's look and tone (mint, polite). The server checks the plan and the allowed
-- values; the checks here only keep stray values out of the table.
alter table user_settings add column if not exists card_theme text not null default 'mint'
  check (card_theme in ('mint', 'ocean', 'rose', 'lavender', 'night'));
alter table user_settings add column if not exists bot_persona text not null default 'polite'
  check (bot_persona in ('polite', 'friendly', 'strict', 'cheer'));
