import type { SupabaseClient } from "@supabase/supabase-js";
import { toSatang } from "@/lib/money";
import type { DateRange } from "@/lib/budget-cycle";
import { periodSummary } from "@/lib/repo";
import type { CategoryShare, SummaryData, SummaryTx } from "@/lib/summary-report";

const MAX_ROWS = 10_000;

/** Confirmed entries in [from, to) with their category names, for `summarize`. */
export async function loadSummaryTransactions(
  db: SupabaseClient,
  userId: string,
  from: Date,
  to: Date,
): Promise<SummaryTx[]> {
  const { data, error } = await db
    .from("transactions")
    .select("occurred_at,type,amount,categories(name)")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("occurred_at", from.toISOString())
    .lt("occurred_at", to.toISOString())
    .limit(MAX_ROWS);
  if (error) throw new Error(`load summary rows: ${error.message}`);
  return (data ?? []).map((r) => {
    const cat = Array.isArray(r.categories) ? r.categories[0] : r.categories;
    return {
      occurredAt: new Date(r.occurred_at as string),
      type: r.type as "income" | "expense",
      amountSatang: toSatang(r.amount as string | number),
      categoryName: (cat as { name?: string } | null)?.name ?? null,
    };
  });
}

interface CategorySpendRow {
  name: string;
  total: number | string;
}

/**
 * The same numbers as `summarize`, but added up by the database, so a long range is exact and
 * never cut off by a row limit: totals for `range` and `previous`, and the top expense categories
 * of `range`.
 */
export async function loadSummaryData(
  db: SupabaseClient,
  userId: string,
  range: DateRange,
  previous: DateRange,
): Promise<SummaryData> {
  const [current, before, categories] = await Promise.all([
    periodSummary(db, { userId, from: range.from, to: range.to }),
    periodSummary(db, { userId, from: previous.from, to: previous.to }),
    db.rpc("spend_by_category", {
      p_user: userId,
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
      p_type: "expense",
    }),
  ]);
  if (categories.error) throw new Error(`load category totals: ${categories.error.message}`);

  const topExpenses: CategoryShare[] = ((categories.data ?? []) as CategorySpendRow[])
    .map((r) => ({ name: r.name, amountSatang: toSatang(r.total) }))
    .sort((a, b) => b.amountSatang - a.amountSatang)
    .slice(0, 3)
    .map((c) => ({
      ...c,
      percent:
        current.expenseSatang > 0 ? Math.round((c.amountSatang * 100) / current.expenseSatang) : 0,
    }));

  return {
    current: { income: current.incomeSatang, expense: current.expenseSatang, count: current.count },
    previous: { income: before.incomeSatang, expense: before.expenseSatang, count: before.count },
    topExpenses,
  };
}
