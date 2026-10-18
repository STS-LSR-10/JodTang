import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env";
import { clearPin } from "@/lib/pin-repo";
import { attemptPin } from "@/lib/pin-service";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ pin: z.string().max(12) });

/** POST /api/pin/disable { pin } — turn the lock off; the current PIN must be typed (open to every plan). */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request, { allowLocked: true });
    if (auth instanceof Response) return auth;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("ใส่ PIN ด้วยนะ", 400);

    const db = getAdminClient();
    const check = await attemptPin(
      db,
      auth.userId,
      parsed.data.pin,
      getServerEnv().SESSION_JWT_SECRET,
      new Date(),
    );
    if (!check.ok) {
      if (check.reason === "no_pin") return json({ ok: true });
      if (check.reason === "locked" || (check.reason === "wrong" && check.lockedUntil)) {
        return apiError("ใส่ PIN ผิดหลายครั้ง รอสักครู่แล้วลองใหม่นะ", 429);
      }
      return apiError("PIN ไม่ถูกต้อง", 400);
    }
    await clearPin(db, auth.userId);
    return json({ ok: true });
  });
}
