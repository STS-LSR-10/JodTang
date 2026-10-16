import { z } from "zod";

/** Filters shared by the list endpoint and the export. Everything is optional. */
export const txFilterSchema = z.object({
  type: z.enum(["expense", "income"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  categoryId: z.string().uuid().optional(),
  q: z.string().trim().max(60).optional(),
});

export type TxFilters = z.infer<typeof txFilterSchema>;

/** The few PostgREST filter methods we use. */
interface Chainable {
  eq(column: string, value: string): Chainable;
  gte(column: string, value: string): Chainable;
  lt(column: string, value: string): Chainable;
  ilike(column: string, pattern: string): Chainable;
}

/**
 * Apply the filters to a query on `transactions`. User scoping is the caller's job.
 * (Typed loosely on purpose: the full PostgREST builder generics are too deep for tsc here.)
 */
export function applyTxFilters<Q>(query: Q, f: TxFilters): Q {
  let q = query as unknown as Chainable;
  if (f.type) q = q.eq("type", f.type);
  if (f.from) q = q.gte("occurred_at", f.from);
  if (f.to) q = q.lt("occurred_at", f.to);
  if (f.categoryId) q = q.eq("category_id", f.categoryId);
  if (f.q) {
    // strip LIKE wildcards so user text is matched literally
    const term = f.q.replace(/[%_\\]/g, " ").trim();
    if (term) q = q.ilike("title", `%${term}%`);
  }
  return q as unknown as Q;
}
