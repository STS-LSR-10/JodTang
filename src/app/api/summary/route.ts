import { calendarMonthRange, cycleRange, dayRange } from "@/lib/budget-cycle";
import { guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { TX_SELECT, toTxDto } from "@/lib/dto";
import { getSettings, periodSummary } from "@/lib/repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT_COUNT = 5;

/** GET /api/summary?scope=cycle|month|day  (default: the current budget cycle) */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const scope = new URL(request.url).searchParams.get("scope") ?? "cycle";
    const db = getAdminClient();
    const settings = await getSettings(db, auth.userId);
    const now = new Date();

    const range =
      scope === "day"
        ? dayRange(now)
        : scope === "month"
          ? calendarMonthRange(now)
          : cycleRange(now, settings.budget_cycle, settings.cycle_start_day);

    const [totals, recent] = await Promise.all([
      periodSummary(db, { userId: auth.userId, from: range.from, to: range.to }),
      db
        .from("transactions")
        .select(TX_SELECT)
        .eq("user_id", auth.userId)
        .eq("status", "confirmed")
        .order("occurred_at", { ascending: false })
        .limit(RECENT_COUNT),
    ]);
    if (recent.error) throw new Error(`recent: ${recent.error.message}`);

    return json({
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      cycle: settings.budget_cycle,
      incomeSatang: totals.incomeSatang,
      expenseSatang: totals.expenseSatang,
      balanceSatang: totals.incomeSatang - totals.expenseSatang,
      count: totals.count,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent: (recent.data ?? []).map((r: any) => toTxDto(r)),
    });
  });
}
