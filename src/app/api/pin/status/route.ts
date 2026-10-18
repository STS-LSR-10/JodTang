import { guard, json } from "@/lib/api";
import { UNLOCK_HEADER, verifyUnlock } from "@/lib/auth/unlock-token";
import { requireUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env";
import { can } from "@/lib/plan";
import { getPlanInfo } from "@/lib/plan-server";
import { MAX_FAILS, isLocked, resetEffectiveAt } from "@/lib/pin";
import { getSecurity } from "@/lib/pin-repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pin/status — what the lock screen and the settings card need. Open even when locked (it
 * says nothing about money): whether a PIN is set and enforced, whether this request is unlocked,
 * a running lock-out, and a pending "forgot my PIN" request.
 */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request, { allowLocked: true });
    if (auth instanceof Response) return auth;
    const db = getAdminClient();
    const now = new Date();

    const [sec, { plan }] = await Promise.all([
      getSecurity(db, auth.userId, now),
      getPlanInfo(db, auth.userId, now),
    ]);
    const enforced = sec.hasPin && can(plan, "pinLock");
    const token = request.headers.get(UNLOCK_HEADER);
    const unlocked = token
      ? await verifyUnlock(token, getServerEnv().SESSION_JWT_SECRET, auth.userId, now)
      : false;
    return json({
      hasPin: sec.hasPin,
      /** The PIN is asked for (a lapsed plan keeps it saved but does not ask). */
      required: enforced,
      unlocked: !enforced || unlocked,
      canSet: can(plan, "pinLock"),
      lockedUntil: isLocked(sec.lock, now) ? sec.lock.lockedUntil?.toISOString() : null,
      triesLeft: MAX_FAILS - sec.lock.failed,
      resetAt: sec.resetRequestedAt ? resetEffectiveAt(sec.resetRequestedAt).toISOString() : null,
    });
  });
}
