import { apiError, guard, json } from "@/lib/api";
import { UNLOCK_HEADER, signUnlock, verifyUnlock } from "@/lib/auth/unlock-token";
import { requireUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pin/touch — still using the app: swap a still-valid unlock token for a fresh one, so
 * the 15 minutes count from the last use. An expired or missing token cannot be refreshed.
 */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request, { allowLocked: true });
    if (auth instanceof Response) return auth;
    const secret = getServerEnv().SESSION_JWT_SECRET;
    const token = request.headers.get(UNLOCK_HEADER);
    if (!token || !(await verifyUnlock(token, secret, auth.userId))) {
      return apiError("ต้องใส่ PIN เพื่อปลดล็อกก่อนนะ", 423);
    }
    const fresh = await signUnlock(auth.userId, secret);
    return json({ token: fresh.token, expiresAt: fresh.expiresAt.toISOString() });
  });
}
