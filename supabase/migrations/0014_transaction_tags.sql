-- Tags on entries ("หมูกระทะ 500 #ปาร์ตี้บริษัท"), searchable apart from the category.
-- Additive and idempotent: older code simply never reads the column.
alter table transactions add column if not exists tags text[] not null default '{}';

-- "tags @> array['x']" (filter by one tag) uses this index.
create index if not exists transactions_tags_idx on transactions using gin (tags);
