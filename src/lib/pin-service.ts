import type { SupabaseClient } from "@supabase/supabase-js";
import { clearAttempts, getSecurity, takeAttempt } from "@/lib/pin-repo";
import { verifyPin } from "@/lib/pin";

export type PinAttempt =
  | { ok: true }
  | { ok: false; reason: "no_pin" }
  | { ok: false; reason: "locked"; lockedUntil: Date }
  | { ok: false; reason: "wrong"; attemptsLeft: number; lockedUntil: Date | null };

/**
 * Check a typed PIN. The try is counted first (so parallel guesses cannot beat the limit), refused
 * outright while locked, and a right PIN clears the count.
 */
export async function attemptPin(
  db: SupabaseClient,
  userId: string,
  pin: string,
  pepper: string,
  now: Date,
): Promise<PinAttempt> {
  const sec = await getSecurity(db, userId, now);
  if (!sec.hasPin || !sec.hash || !sec.salt) return { ok: false, reason: "no_pin" };

  const attempt = await takeAttempt(db, userId, now);
  if (!attempt.allowed) {
    return { ok: false, reason: "locked", lockedUntil: attempt.lockedUntil ?? now };
  }
  if (await verifyPin(pin, { hash: sec.hash, salt: sec.salt }, pepper)) {
    await clearAttempts(db, userId, now);
    return { ok: true };
  }
  return {
    ok: false,
    reason: "wrong",
    attemptsLeft: attempt.attemptsLeft,
    lockedUntil: attempt.lockedUntil,
  };
}
