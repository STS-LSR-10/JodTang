-- The entry names a person uses most in a period, added up ("ชานม ฿420 · 6 ครั้ง"), for the
-- AI Insight. Names are compared lower-cased with the spaces tidied. security invoker, like
-- summary_by_period. Idempotent and additive.
create or replace function top_titles(
  p_user uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_type tx_type default 'expense',
  p_limit int default 10
) returns table (title text, total numeric, tx_count bigint)
language sql stable security invoker as $$
  select
    lower(regexp_replace(btrim(t.title), '\s+', ' ', 'g')) as title,
    sum(t.amount) as total,
    count(*) as tx_count
  from transactions t
  where t.user_id = p_user
    and t.status = 'confirmed'
    and t.type = p_type
    and t.occurred_at >= p_from
    and t.occurred_at <  p_to
  group by 1
  order by 2 desc, 3 desc, 1
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;
