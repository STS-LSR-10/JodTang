import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { signUnlock } from "@/lib/auth/unlock-token";
import { getServerEnv } from "@/lib/env";
import { attemptPin } from "@/lib/pin-service";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ pin: z.string().max(12) });

/**
 * POST /api/pin/unlock { pin } — the right PIN gives an unlock token (15 minutes) to send as
 * X-Unlock. Wrong tries are counted in the database: 5 in a row lock it for 15 / 30 / 60 minutes.
 */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request, { allowLocked: true });
    if (auth instanceof Response) return auth;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("ใส่ PIN ด้วยนะ", 400);

    const env = getServerEnv();
    const now = new Date();
    const result = await attemptPin(
      getAdminClient(),
      auth.userId,
      parsed.data.pin,
      env.SESSION_JWT_SECRET,
      now,
    );
    if (result.ok) {
      const { token, expiresAt } = await signUnlock(auth.userId, env.SESSION_JWT_SECRET, now);
      return json({ token, expiresAt: expiresAt.toISOString() });
    }
    if (result.reason === "no_pin") return json({ token: null });
    if (result.reason === "locked") {
      return json(
        {
          error: "ใส่ PIN ผิดหลายครั้ง รอสักครู่แล้วลองใหม่นะ",
          lockedUntil: result.lockedUntil.toISOString(),
        },
        429,
      );
    }
    if (result.lockedUntil) {
      return json(
        {
          error: "ใส่ PIN ผิดครบ 5 ครั้ง ล็อกชั่วคราว",
          lockedUntil: result.lockedUntil.toISOString(),
        },
        429,
      );
    }
    return json({ error: "PIN ไม่ถูกต้อง", triesLeft: result.attemptsLeft }, 400);
  });
}
