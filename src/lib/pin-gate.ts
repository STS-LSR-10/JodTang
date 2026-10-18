import type { SupabaseClient } from "@supabase/supabase-js";
import { UNLOCK_HEADER, verifyUnlock } from "@/lib/auth/unlock-token";
import { getServerEnv } from "@/lib/env";
import { can } from "@/lib/plan";
import { getPlanInfo } from "@/lib/plan-server";
import { getSecurity } from "@/lib/pin-repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const LOCKED_STATUS = 423;

/** True when this person's PIN must be entered before any data is given out. */
export async function pinRequired(db: SupabaseClient, userId: string, now: Date): Promise<boolean> {
  const sec = await getSecurity(db, userId, now);
  if (!sec.hasPin) return false;
  // a lapsed plan keeps the PIN saved but does not enforce it (it comes back with the plan)
  const { plan } = await getPlanInfo(db, userId, now);
  return can(plan, "pinLock");
}

/**
 * The server-side half of the PIN lock: null when the request may go on, a 423 response when the
 * person has a PIN and this request carries no valid unlock token. Without it, anyone holding a
 * session could read the data by calling the API directly.
 */
export async function enforcePin(
  request: Request,
  userId: string,
  now: Date = new Date(),
): Promise<Response | null> {
  const db = getAdminClient();
  if (!(await pinRequired(db, userId, now))) return null;
  const token = request.headers.get(UNLOCK_HEADER);
  if (token && (await verifyUnlock(token, getServerEnv().SESSION_JWT_SECRET, userId, now)))
    return null;
  return Response.json(
    { error: "ต้องใส่ PIN เพื่อปลดล็อกก่อนนะ", locked: true },
    { status: LOCKED_STATUS, headers: { "Cache-Control": "no-store" } },
  );
}
