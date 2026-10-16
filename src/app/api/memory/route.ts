import { guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { requireFeature } from "@/lib/plan-server";
import { loadCategories } from "@/lib/repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/memory — learned "recipient / word -> category" mappings (Plus). */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const db = getAdminClient();
    const locked = await requireFeature(db, auth.userId, "merchantMemory");
    if (locked) return locked;

    const [memory, categories] = await Promise.all([
      db
        .from("merchant_memory")
        .select("id,match_text,category_id,hit_count")
        .eq("user_id", auth.userId)
        .order("hit_count", { ascending: false })
        .limit(200),
      loadCategories(db, auth.userId),
    ]);
    if (memory.error) throw new Error(`load memory: ${memory.error.message}`);
    const names = new Map(categories.map((c) => [c.id, c.name]));

    return json({
      items: (memory.data ?? []).map((m) => {
        const row = m as { id: string; match_text: string; category_id: string; hit_count: number };
        return {
          id: row.id,
          text: row.match_text,
          categoryId: row.category_id,
          categoryName: names.get(row.category_id) ?? null,
          hits: row.hit_count,
        };
      }),
    });
  });
}
