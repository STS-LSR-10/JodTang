import type { SupabaseClient } from "@supabase/supabase-js";
import { alertText, crossedThreshold } from "@/lib/budget";
import { cycleRange } from "@/lib/budget-cycle";
import { toSatang } from "@/lib/money";
import { can } from "@/lib/plan";
import { getPlanInfo } from "@/lib/plan-server";
import {
  expenseTotalSatang,
  getBudgetMode,
  getSettings,
  loadBudgets,
  loadCategories,
} from "@/lib/repo";
import type { TxType } from "@/lib/types";

/**
 * After an expense is saved, return alert texts when it pushed the budget across 80% / 100%.
 * Best effort: callers should treat failures as "no alert".
 */
export async function budgetAlertsFor(
  db: SupabaseClient,
  input: {
    userId: string;
    type: TxType;
    categoryId: string | null;
    amountSatang: number;
    occurredAt: Date;
    now: Date;
  },
): Promise<string[]> {
  if (input.type !== "expense") return [];
  // 80% / 100% warnings are for Professional and above (a lapsed plan stops them)
  const { plan } = await getPlanInfo(db, input.userId, input.now);
  if (!can(plan, "budgetAlert")) return [];

  const [settings, mode, budgets] = await Promise.all([
    getSettings(db, input.userId),
    getBudgetMode(db, input.userId),
    loadBudgets(db, input.userId),
  ]);
  const range = cycleRange(input.now, settings.budget_cycle, settings.cycle_start_day);
  // An entry dated outside the current cycle does not affect this cycle's budget.
  if (input.occurredAt < range.from || input.occurredAt >= range.to) return [];

  const wantsCategory = mode === "category";
  if (wantsCategory && !input.categoryId) return [];
  const budget = budgets.find((b) =>
    wantsCategory ? b.category_id === input.categoryId : b.category_id === null,
  );
  if (!budget) return [];

  const limit = toSatang(budget.amount);
  const after = await expenseTotalSatang(db, {
    userId: input.userId,
    from: range.from,
    to: range.to,
    categoryId: wantsCategory ? (input.categoryId ?? undefined) : undefined,
  });
  const level = crossedThreshold(after - input.amountSatang, after, limit);
  if (!level) return [];

  let scopeName: string | null = null;
  if (wantsCategory) {
    const categories = await loadCategories(db, input.userId);
    scopeName = categories.find((c) => c.id === input.categoryId)?.name ?? null;
  }
  return [alertText({ level, scopeName, spentSatang: after, limitSatang: limit })];
}
