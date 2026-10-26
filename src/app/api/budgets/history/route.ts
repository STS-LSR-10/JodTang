import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { toSatang } from "@/lib/money";
import { requireFeature } from "@/lib/plan-server";
import { bucketStarts } from "@/lib/series";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SpendRow {
  category_id: string | null;
  total: number | string;
}

/**
 * GET /api/budgets/history?categoryId=<uuid> — what the person spent on one category in each of the
 * last six calendar months (Professional and above, like the analytics charts). One database call
 * per month, so nothing depends on how many entries there are.
 */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const db = getAdminClient();
    const locked = await requireFeature(db, auth.userId, "dashboard");
    if (locked) return locked;

    const id = new URL(request.url).searchParams.get("categoryId");
    if (!z.string().uuid().safeParse(id).success) return apiError("ไม่พบหมวดนี้", 400);

    const { starts, to } = bucketStarts(new Date(), "month");
    const ends = [...starts.slice(1), to];
    const rows = await Promise.all(
      starts.map(async (from, i) => {
        const res = await db.rpc("spend_by_category", {
          p_user: auth.userId,
          p_from: from.toISOString(),
          p_to: (ends[i] as Date).toISOString(),
          p_type: "expense",
        });
        if (res.error) throw new Error(`history: ${res.error.message}`);
        const row = ((res.data ?? []) as SpendRow[]).find((r) => r.category_id === id);
        return { start: from.toISOString(), totalSatang: row ? toSatang(row.total) : 0 };
      }),
    );
    const total = rows.reduce((s, r) => s + r.totalSatang, 0);
    return json({ series: rows, averageSatang: Math.round(total / rows.length) });
  });
}
