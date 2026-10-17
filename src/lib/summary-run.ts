import type { SupabaseClient } from "@supabase/supabase-js";
import type { DateRange } from "@/lib/budget-cycle";
import { log } from "@/lib/log";
import { toSatang } from "@/lib/money";
import { can, effectivePlan, type Plan } from "@/lib/plan";
import {
  bangkokDay,
  buildSummaryMessage,
  isMonthlySummaryDue,
  isWeeklySummaryDue,
  lastMonthRange,
  lastWeekRange,
  previousRange,
  summarize,
  type SummaryKind,
  type SummaryTx,
} from "@/lib/summary-report";
import type { BudgetCycle, LineMessage } from "@/lib/types";

export interface SummaryRunResult {
  candidates: number;
  sent: number;
  /** Nothing was recorded in the period, so nothing is pushed. */
  skippedEmpty: number;
  errors: number;
}

const BATCH = 1000;
const MAX_ROWS = 10_000;

interface SettingRow {
  user_id: string;
  budget_cycle: BudgetCycle;
  cycle_start_day: number;
  weekly_summary_enabled: boolean;
  monthly_summary_enabled: boolean;
  last_weekly_summary_on: string | null;
  last_monthly_summary_on: string | null;
}

async function loadTransactions(
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

/**
 * Push the weekly (Monday 09:00) and monthly (cycle start day, 09:00) summaries to people who
 * turned them on and have a paid plan. Run it hourly: each summary goes out once per period
 * (`last_*_summary_on`), and an hour missed is caught up later the same day.
 */
export async function runSummaries(
  db: SupabaseClient,
  push: (lineUserId: string, messages: LineMessage[]) => Promise<void>,
  now: Date,
  liffBaseUrl?: string,
): Promise<SummaryRunResult> {
  const result: SummaryRunResult = { candidates: 0, sent: 0, skippedEmpty: 0, errors: 0 };
  const today = bangkokDay(now);

  const settings = await db
    .from("user_settings")
    .select(
      "user_id,budget_cycle,cycle_start_day,weekly_summary_enabled,monthly_summary_enabled,last_weekly_summary_on,last_monthly_summary_on",
    )
    .or("weekly_summary_enabled.eq.true,monthly_summary_enabled.eq.true")
    .limit(BATCH);
  if (settings.error) throw new Error(`load summary settings: ${settings.error.message}`);
  const rows = (settings.data ?? []) as SettingRow[];

  type Job = { row: SettingRow; kind: SummaryKind };
  const jobs: Job[] = [];
  for (const row of rows) {
    if (row.weekly_summary_enabled && isWeeklySummaryDue(now, row.last_weekly_summary_on)) {
      jobs.push({ row, kind: "weekly" });
    }
    if (
      row.monthly_summary_enabled &&
      isMonthlySummaryDue(now, row.budget_cycle, row.cycle_start_day, row.last_monthly_summary_on)
    ) {
      jobs.push({ row, kind: "monthly" });
    }
  }
  result.candidates = jobs.length;
  if (jobs.length === 0) return result;

  const users = await db
    .from("users")
    .select("id,line_user_id,plan,plan_expires_at")
    .in("id", [...new Set(jobs.map((j) => j.row.user_id))]);
  if (users.error) throw new Error(`load summary users: ${users.error.message}`);
  const byId = new Map(
    (
      (users.data ?? []) as {
        id: string;
        line_user_id: string;
        plan: Plan;
        plan_expires_at: string | null;
      }[]
    ).map((u) => [u.id, u]),
  );

  const liffUrl = liffBaseUrl ? `${liffBaseUrl.replace(/\/$/, "")}/analytics` : undefined;

  for (const { row, kind } of jobs) {
    const user = byId.get(row.user_id);
    // a lapsed plan keeps its settings but stops getting summaries
    if (!user || !can(effectivePlan(user.plan, user.plan_expires_at, now), "autoSummary")) continue;
    try {
      const range: DateRange =
        kind === "weekly"
          ? lastWeekRange(now)
          : lastMonthRange(now, row.budget_cycle, row.cycle_start_day);
      const previous = previousRange(kind, range);

      // Mark first: a failing push (blocked account) must not be retried every hour.
      const mark = await db
        .from("user_settings")
        .update(
          kind === "weekly"
            ? { last_weekly_summary_on: today }
            : { last_monthly_summary_on: today },
        )
        .eq("user_id", user.id);
      if (mark.error) throw new Error(`mark summary sent: ${mark.error.message}`);

      const data = summarize(
        await loadTransactions(db, user.id, previous.from, range.to),
        range,
        previous,
      );
      if (data.current.count === 0) {
        result.skippedEmpty += 1;
        continue;
      }
      await push(user.line_user_id, [buildSummaryMessage({ kind, range, data, liffUrl })]);
      result.sent += 1;
    } catch (error) {
      result.errors += 1;
      log.error("summary_failed", error);
    }
  }
  return result;
}
