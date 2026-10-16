import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { requireFeature } from "@/lib/plan-server";
import { normalizeTime } from "@/lib/reminder";
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
    daily_reminder_enabled: z.boolean(),
    /** "HH:MM" Bangkok time */
    daily_reminder_time: z.string(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "empty");

export async function PATCH(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("ค่าที่ส่งมาไม่ถูกต้อง", 400);
    const patch: Record<string, unknown> = { ...parsed.data };

    const db = getAdminClient();

    if (parsed.data.daily_reminder_time !== undefined) {
      const time = normalizeTime(parsed.data.daily_reminder_time);
      if (!time) return apiError("เวลาไม่ถูกต้อง (เช่น 20:30)", 400);
      patch.daily_reminder_time = time;
    }

    // Reminders are a Plus feature. Turning them off is always allowed.
    const wantsReminder =
      parsed.data.daily_reminder_enabled === true || parsed.data.daily_reminder_time !== undefined;
    if (wantsReminder) {
      const locked = await requireFeature(db, auth.userId, "dailyReminder");
      if (locked) return locked;
    }

    const { error } = await db
      .from("user_settings")
      .upsert({ user_id: auth.userId, ...patch }, { onConflict: "user_id" });
    if (error) throw new Error(`save settings: ${error.message}`);
    return json(await getSettings(db, auth.userId));
  });
}
