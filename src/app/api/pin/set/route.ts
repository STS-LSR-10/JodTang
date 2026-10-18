import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { signUnlock } from "@/lib/auth/unlock-token";
import { getServerEnv } from "@/lib/env";
import { checkPin, hashPin } from "@/lib/pin";
import { getSecurity, savePin } from "@/lib/pin-repo";
import { attemptPin } from "@/lib/pin-service";
import { requireFeature } from "@/lib/plan-server";
import { LIMITS, limitOr429 } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  pin: z.string().max(12),
  confirmPin: z.string().max(12),
  /** The PIN in force now, needed to change it. */
  current: z.string().max(12).optional(),
});

/**
 * POST /api/pin/set { pin, confirmPin, current? } — set a PIN (Professional and above), or change it
 * (the current one must be typed, counted like any other try). The new PIN is 4–6 digits and not an
 * easy one. Answers with an unlock token so the person is not locked out of what they just set.
 */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request, { allowLocked: true });
    if (auth instanceof Response) return auth;
    const db = getAdminClient();

    const locked = await requireFeature(db, auth.userId, "pinLock");
    if (locked) return locked;
    const limited = await limitOr429(db, "pin_change", auth.userId, LIMITS.pinChange);
    if (limited) return limited;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("ข้อมูลไม่ถูกต้อง", 400);
    const { pin, confirmPin, current } = parsed.data;

    const verdict = checkPin(pin);
    if (verdict === "format") return apiError("PIN ต้องเป็นตัวเลข 4–6 หลักนะ", 400);
    if (verdict === "weak")
      return apiError("PIN นี้เดาง่ายเกินไป (เช่น 1234 หรือเลขซ้ำ) ลองรหัสอื่นนะ", 400);
    if (pin !== confirmPin) return apiError("PIN สองครั้งไม่ตรงกัน", 400);

    const env = getServerEnv();
    const now = new Date();
    const sec = await getSecurity(db, auth.userId, now);
    if (sec.hasPin) {
      if (!current) return apiError("ใส่ PIN เดิมก่อนถึงจะเปลี่ยนได้นะ", 400);
      const check = await attemptPin(db, auth.userId, current, env.SESSION_JWT_SECRET, now);
      if (!check.ok) {
        if (check.reason === "locked" || (check.reason === "wrong" && check.lockedUntil)) {
          return apiError("ใส่ PIN ผิดหลายครั้ง รอสักครู่แล้วลองใหม่นะ", 429);
        }
        return apiError("PIN เดิมไม่ถูกต้อง", 400);
      }
    }

    await savePin(db, auth.userId, await hashPin(pin, env.SESSION_JWT_SECRET));
    const { token, expiresAt } = await signUnlock(auth.userId, env.SESSION_JWT_SECRET, now);
    return json({ ok: true, token, expiresAt: expiresAt.toISOString() });
  });
}
