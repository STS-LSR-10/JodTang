-- Totals of a period split into what came from recurring rules and what did not, for the forecast
-- ("พยากรณ์"): the daily spending rate must not average in the rent that a rule already booked.
-- security invoker, like summary_by_period. Idempotent and additive.
create or replace function period_totals_by_source(
  p_user uuid, p_from timestamptz, p_to timestamptz
) returns table (
  income numeric, expense numeric,
  recurring_income numeric, recurring_expense numeric,
  tx_count bigint
)
language sql stable security invoker as $$
  select
    coalesce(sum(amount) filter (where type = 'income'), 0),
    coalesce(sum(amount) filter (where type = 'expense'), 0),
    coalesce(sum(amount) filter (where type = 'income' and source = 'recurring'), 0),
    coalesce(sum(amount) filter (where type = 'expense' and source = 'recurring'), 0),
    count(*)
  from transactions
  where user_id = p_user
    and status = 'confirmed'
    and occurred_at >= p_from
    and occurred_at <  p_to;
$$;
