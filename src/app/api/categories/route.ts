import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { loadCategories } from "@/lib/repo";
import { LIMITS, limitOr429 } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_NAME = "อื่นๆ";
const DEFAULT_COLOR = "#64748B";

/**
 * GET /api/categories            visible categories (for pickers)
 * GET /api/categories?all=1      everything, including hidden, with editing details
 */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const all = new URL(request.url).searchParams.get("all") === "1";
    const categories = await loadCategories(getAdminClient(), auth.userId);
    const items = categories
      .filter((c) => all || !c.is_hidden)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        own: c.user_id !== null,
        keywords: c.keywords,
        color: c.color,
        isHidden: c.is_hidden,
        sortOrder: c.sort_order,
        isFallback: c.name === FALLBACK_NAME,
      }));
    return json({ items });
  });
}

const createSchema = z.object({
  type: z.enum(["expense", "income"]),
  name: z.string().trim().min(1).max(30),
  keywords: z.array(z.string().trim().min(1).max(30)).max(30).default([]),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default(DEFAULT_COLOR),
});

/** POST /api/categories — add a custom category. */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const limited = await limitOr429(getAdminClient(), "write", auth.userId, LIMITS.write);
    if (limited) return limited;

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("กรอกชื่อหมวดให้ถูกต้องนะ (ไม่เกิน 30 ตัวอักษร)", 400);
    const body = parsed.data;

    const db = getAdminClient();
    const existing = await loadCategories(db, auth.userId);
    const sameType = existing.filter((c) => c.type === body.type);
    if (sameType.some((c) => c.name === body.name)) return apiError("มีหมวดชื่อนี้อยู่แล้ว", 409);
    // Place it just before the fallback "อื่นๆ", which stays last.
    const order =
      Math.max(0, ...sameType.filter((c) => c.name !== FALLBACK_NAME).map((c) => c.sort_order)) + 1;

    const { data, error } = await db
      .from("categories")
      .insert({
        user_id: auth.userId,
        type: body.type,
        name: body.name,
        icon: "tag",
        color: body.color,
        keywords: body.keywords,
        sort_order: order,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return apiError("มีหมวดชื่อนี้อยู่แล้ว", 409);
      throw new Error(`create category: ${error.message}`);
    }
    return json({ id: (data as { id: string }).id }, 201);
  });
}
