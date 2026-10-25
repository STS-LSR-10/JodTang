-- "Ask me to attach a photo after I record something" (Professional and above use it; the bot checks
-- the plan each time). On by default. Additive and idempotent.
alter table user_settings add column if not exists photo_prompt boolean not null default true;
