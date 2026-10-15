import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getSettings } from "@/lib/repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;
    return json(await getSettings(getAdminClient(), auth.userId));
  });
}

const patchSchema = z
  .object({
    confirm_style: z.enum(["full", "short", "off"]),
    budget_cycle: z.enum(["monthly", "weekly"]),
    cycle_start_day: z.number().int().min(1).max(28),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "empty");

export async function PATCH(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("ค่าที่ส่งมาไม่ถูกต้อง", 400);

    const db = getAdminClient();
    const { error } = await db
      .from("user_settings")
      .upsert({ user_id: auth.userId, ...parsed.data }, { onConflict: "user_id" });
    if (error) throw new Error(`save settings: ${error.message}`);
    return json(await getSettings(db, auth.userId));
  });
}
