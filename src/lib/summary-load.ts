import type { SupabaseClient } from "@supabase/supabase-js";
import { toSatang } from "@/lib/money";
import { bangkokParts } from "@/lib/thai-date";
import type { YearResult } from "@/lib/year-summary";
import type { DateRange } from "@/lib/budget-cycle";
import { buildCompareRows, type CompareRow } from "@/lib/period-compare";
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

/** Expense per category in [range.from, range.to), added up by the database, biggest first. */
export async function loadCategorySpend(
  db: SupabaseClient,
  userId: string,
  range: DateRange,
): Promise<{ name: string; amountSatang: number }[]> {
  const { data, error } = await db.rpc("spend_by_category", {
    p_user: userId,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_type: "expense",
  });
  if (error) throw new Error(`load category spend: ${error.message}`);
  return ((data ?? []) as CategorySpendRow[])
    .map((r) => ({ name: r.name, amountSatang: toSatang(r.total) }))
    .sort((a, b) => b.amountSatang - a.amountSatang);
}

export interface MonthTotals {
  /** Start of the month (Bangkok). */
  month: Date;
  incomeSatang: number;
  expenseSatang: number;
}

export interface YearData {
  summary: SummaryData;
  months: MonthTotals[];
}

interface SeriesRow {
  bucket_start: string;
  income: number | string;
  expense: number | string;
}

/**
 * A calendar year, added up by the database: totals against the same days a year earlier, the three
 * biggest expense categories, and income/expense for each month of the year so far.
 */
export async function loadYearData(
  db: SupabaseClient,
  userId: string,
  year: Extract<YearResult, { ok: true }>,
): Promise<YearData> {
  const [summary, series] = await Promise.all([
    loadSummaryData(db, userId, year.range, year.previous),
    db.rpc("analytics_series", {
      p_user: userId,
      p_from: year.range.from.toISOString(),
      p_to: year.range.to.toISOString(),
      p_bucket: "month",
    }),
  ]);
  if (series.error) throw new Error(`load monthly totals: ${series.error.message}`);

  const byMonth = new Map<number, SeriesRow>();
  for (const r of (series.data ?? []) as SeriesRow[]) {
    byMonth.set(bangkokParts(new Date(r.bucket_start)).month, r);
  }
  const months: MonthTotals[] = year.months.map((month) => {
    const row = byMonth.get(bangkokParts(month).month);
    return {
      month,
      incomeSatang: row ? toSatang(row.income) : 0,
      expenseSatang: row ? toSatang(row.expense) : 0,
    };
  });
  return { summary, months };
}

/** Expense per category on two spans, joined for the "เทียบเดือน" card. */
export async function loadCategoryCompare(
  db: SupabaseClient,
  userId: string,
  current: DateRange,
  previous: DateRange,
): Promise<{ rows: CompareRow[]; currentSatang: number; previousSatang: number }> {
  const [cur, prev] = await Promise.all([
    loadCategorySpend(db, userId, current),
    loadCategorySpend(db, userId, previous),
  ]);
  return {
    rows: buildCompareRows(cur, prev),
    currentSatang: cur.reduce((s, c) => s + c.amountSatang, 0),
    previousSatang: prev.reduce((s, c) => s + c.amountSatang, 0),
  };
}
