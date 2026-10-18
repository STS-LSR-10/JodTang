import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { budgetAlertsFor } from "@/lib/budget-alert";
import { categorizeByRules } from "@/lib/categorize/rules";
import { getServerEnv } from "@/lib/env";
import { createLineClient } from "@/lib/line/client";
import { TX_SELECT, toTxDto } from "@/lib/dto";
import { toSatang } from "@/lib/money";
import { can, effectivePlan } from "@/lib/plan";
import { loadMemoryIfAllowed } from "@/lib/plan-server";
import { loadSearchTotals, parseSearchTerm, type SearchTarget } from "@/lib/search";
import { getUserPlanRow } from "@/lib/slip-repo";
import { awardActivity } from "@/lib/points";
import { insertTransaction, loadCategories } from "@/lib/repo";
import { LIMITS, limitOr429 } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { applyTxFilters, txFilterSchema } from "@/lib/tx-query";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

const listSchema = txFilterSchema.extend({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** GET /api/transactions?type&from&to&categoryId&q&limit&offset */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = listSchema.safeParse(params);
    if (!parsed.success) return apiError("ตัวกรองไม่ถูกต้อง", 400);
    const f = parsed.data;

    const query = applyTxFilters(
      getAdminClient()
        .from("transactions")
        .select(TX_SELECT)
        .eq("user_id", auth.userId)
        .eq("status", "confirmed"),
      f,
    )
      .order("occurred_at", { ascending: false })
      .range(f.offset, f.offset + f.limit); // one extra row tells us if there is a next page

    const { data, error } = await query;
    if (error) throw new Error(`list transactions: ${error.message}`);
    const rows = data ?? [];

    // While searching, the first page also carries the totals of everything found (Professional and
    // above). They are added up by the database, so they cover more than the page that is shown.
    let totals: Awaited<ReturnType<typeof loadSearchTotals>> | null = null;
    const target: SearchTarget | null = f.q
      ? parseSearchTerm(f.q)
      : f.tag
        ? { q: null, tag: f.tag.replace(/^#/, "").toLowerCase() }
        : null;
    if (target && f.offset === 0) {
      const db = getAdminClient();
      const row = await getUserPlanRow(db, auth.userId);
      if (can(effectivePlan(row.plan, row.plan_expires_at, new Date()), "searchTotals")) {
        totals = await loadSearchTotals(db, auth.userId, target);
      }
    }
    return json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: rows.slice(0, f.limit).map((r: any) => toTxDto(r)),
      hasMore: rows.length > f.limit,
      totals,
    });
  });
}

const createSchema = z.object({
  type: z.enum(["expense", "income"]),
  title: z.string().trim().min(1).max(60),
  /** Decimal string such as "50.50" — never a float. */
  amount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  categoryId: z.string().uuid().nullable().optional(),
});

/** POST /api/transactions — add an entry by hand. */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const limited = await limitOr429(getAdminClient(), "write", auth.userId, LIMITS.write);
    if (limited) return limited;

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง", 400);
    const body = parsed.data;

    const amountSatang = toSatang(body.amount);
    if (amountSatang <= 0) return apiError("จำนวนเงินต้องมากกว่า 0", 400);

    const db = getAdminClient();
    const [categories, memory] = await Promise.all([
      loadCategories(db, auth.userId),
      loadMemoryIfAllowed(db, auth.userId),
    ]);

    let categoryId = body.categoryId ?? null;
    if (categoryId) {
      // Only allow a visible category of the same type that the user may use.
      const picked = categories.find((c) => c.id === categoryId);
      if (!picked || picked.type !== body.type) return apiError("หมวดหมู่ไม่ถูกต้อง", 400);
    } else {
      categoryId = categorizeByRules({
        title: body.title,
        type: body.type,
        categories,
        memory,
      }).categoryId;
    }

    const tx = await insertTransaction(db, {
      userId: auth.userId,
      type: body.type,
      title: body.title,
      amountSatang,
      categoryId,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      status: "confirmed",
      rawText: body.title,
      source: "manual",
    });
    // The day's point (and a pending referral bonus) for the first entry of the day.
    await awardActivity(db, auth.userId, new Date());

    // Budget alert for entries made in the web app: pushed to the chat (best effort).
    try {
      const alerts = await budgetAlertsFor(db, {
        userId: auth.userId,
        type: body.type,
        categoryId,
        amountSatang,
        occurredAt: new Date(tx.occurred_at),
        now: new Date(),
      });
      if (alerts.length > 0) {
        const line = createLineClient(getServerEnv().LINE_CHANNEL_ACCESS_TOKEN);
        await line.push(
          auth.lineUserId,
          alerts.map((t) => ({ type: "text", text: t })),
        );
      }
    } catch (error) {
      log.error("budget_alert_failed", error);
    }
    return json({ id: tx.id }, 201);
  });
}
