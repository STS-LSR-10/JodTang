import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { cycleRange } from "@/lib/budget-cycle";
import { toSatang } from "@/lib/money";
import { getBudgetMode, getSettings, loadBudgets, loadCategories, setBudget } from "@/lib/repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SpendRow {
  category_id: string | null;
  total: number | string;
}

/** GET /api/budgets — mode, overall budget and per-category budgets with this cycle's spending. */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const db = getAdminClient();
    const settings = await getSettings(db, auth.userId);
    const range = cycleRange(new Date(), settings.budget_cycle, settings.cycle_start_day);

    const [mode, budgets, categories, spend] = await Promise.all([
      getBudgetMode(db, auth.userId),
      loadBudgets(db, auth.userId),
      loadCategories(db, auth.userId),
      db.rpc("spend_by_category", {
        p_user: auth.userId,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
        p_type: "expense",
      }),
    ]);
    if (spend.error) throw new Error(`spend: ${spend.error.message}`);

    const spentBy = new Map<string | null, number>();
    let overallSpent = 0;
    for (const row of (spend.data ?? []) as SpendRow[]) {
      const total = toSatang(row.total);
      spentBy.set(row.category_id, total);
      overallSpent += total;
    }
    const budgetBy = new Map(budgets.map((b) => [b.category_id, toSatang(b.amount)]));

    return json({
      mode,
      cycle: settings.budget_cycle,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      overall: { amountSatang: budgetBy.get(null) ?? null, spentSatang: overallSpent },
      categories: categories
        .filter((c) => c.type === "expense" && !c.is_hidden)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({
          categoryId: c.id,
          name: c.name,
          color: c.color,
          amountSatang: budgetBy.get(c.id) ?? null,
          spentSatang: spentBy.get(c.id) ?? 0,
        })),
    });
  });
}

const amountSchema = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,2})?$/)
  .nullable();

const putSchema = z.object({
  mode: z.enum(["overall", "category"]).optional(),
  overall: amountSchema.optional(),
  categories: z
    .array(z.object({ categoryId: z.string().uuid(), amount: amountSchema }))
    .max(100)
    .optional(),
});

function toBudgetSatang(amount: string | null | undefined): number | null | undefined {
  if (amount === undefined) return undefined;
  if (amount === null) return null;
  const satang = toSatang(amount);
  return satang > 0 ? satang : null; // "0" clears the budget
}

/** PUT /api/budgets — partial update: mode, overall amount, per-category amounts (null clears). */
export async function PUT(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const parsed = putSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("จำนวนเงินไม่ถูกต้อง (เช่น 5000 หรือ 5000.50)", 400);
    const body = parsed.data;

    const db = getAdminClient();
    const settings = await getSettings(db, auth.userId);

    if (body.categories?.length) {
      const allowed = new Set(
        (await loadCategories(db, auth.userId))
          .filter((c) => c.type === "expense")
          .map((c) => c.id),
      );
      if (body.categories.some((c) => !allowed.has(c.categoryId))) {
        return apiError("งบตั้งได้เฉพาะหมวดรายจ่ายนะ", 400);
      }
    }

    if (body.mode) {
      const { error } = await db
        .from("user_settings")
        .upsert({ user_id: auth.userId, budget_mode: body.mode }, { onConflict: "user_id" });
      if (error) throw new Error(`save mode: ${error.message}`);
    }

    const overall = toBudgetSatang(body.overall);
    if (overall !== undefined) {
      await setBudget(db, {
        userId: auth.userId,
        categoryId: null,
        amountSatang: overall,
        cycle: settings.budget_cycle,
      });
    }
    for (const c of body.categories ?? []) {
      await setBudget(db, {
        userId: auth.userId,
        categoryId: c.categoryId,
        amountSatang: toBudgetSatang(c.amount) ?? null,
        cycle: settings.budget_cycle,
      });
    }
    return json({ ok: true });
  });
}
