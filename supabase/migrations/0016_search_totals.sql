-- Totals of the entries a search finds ("ค้นหา กาแฟ", "ค้นหา #ปาร์ตี้"). Idempotent and additive.
-- security invoker, like summary_by_period: RLS applies when called as a user; the server passes
-- p_user explicitly. The text is matched literally (strpos), so % and _ are not wildcards.
create or replace function search_totals(
  p_user uuid,
  p_q text default null,
  p_tag text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns table (income numeric, expense numeric, tx_count bigint)
language sql stable security invoker as $$
  select
    coalesce(sum(amount) filter (where type = 'income'), 0),
    coalesce(sum(amount) filter (where type = 'expense'), 0),
    count(*)
  from transactions
  where user_id = p_user
    and status = 'confirmed'
    and (p_q is null or p_q = '' or strpos(lower(title), lower(p_q)) > 0)
    and (p_tag is null or p_tag = '' or tags @> array[lower(p_tag)])
    and (p_from is null or occurred_at >= p_from)
    and (p_to is null or occurred_at < p_to);
$$;
