import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_FAILS, resetDue, type LockState } from "@/lib/pin";

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

export interface Security {
  hasPin: boolean;
  hash: string | null;
  salt: string | null;
  lock: LockState;
  resetRequestedAt: Date | null;
}

const COLUMNS = "pin_hash,pin_salt,failed_count,lock_level,locked_until,reset_requested_at";

interface Row {
  pin_hash: string | null;
  pin_salt: string | null;
  failed_count: number;
  lock_level: number;
  locked_until: string | null;
  reset_requested_at: string | null;
}

const toSecurity = (r: Row | null): Security => ({
  hasPin: Boolean(r?.pin_hash),
  hash: r?.pin_hash ?? null,
  salt: r?.pin_salt ?? null,
  lock: {
    failed: r?.failed_count ?? 0,
    level: r?.lock_level ?? 0,
    lockedUntil: r?.locked_until ? new Date(r.locked_until) : null,
  },
  resetRequestedAt: r?.reset_requested_at ? new Date(r.reset_requested_at) : null,
});

/** The person's PIN state (no row = no PIN). A reset that has waited its 24 hours is carried out here. */
export async function getSecurity(
  db: SupabaseClient,
  userId: string,
  now: Date,
): Promise<Security> {
  const { data, error } = await db
    .from("user_security")
    .select(COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("load security", error);
  const sec = toSecurity(data as Row | null);
  if (sec.hasPin && resetDue(sec.resetRequestedAt, now)) {
    await clearPin(db, userId);
    return toSecurity(null);
  }
  return sec;
}

/** Save a new PIN (hash + salt); counters and any pending reset start over. */
export async function savePin(
  db: SupabaseClient,
  userId: string,
  pin: { hash: string; salt: string },
): Promise<void> {
  const { error } = await db.from("user_security").upsert(
    {
      user_id: userId,
      pin_hash: pin.hash,
      pin_salt: pin.salt,
      failed_count: 0,
      lock_level: 0,
      locked_until: null,
      reset_requested_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) fail("save pin", error);
}

export async function clearPin(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db
    .from("user_security")
    .update({
      pin_hash: null,
      pin_salt: null,
      failed_count: 0,
      lock_level: 0,
      locked_until: null,
      reset_requested_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) fail("clear pin", error);
}

export interface Attempt {
  /** False while locked: the PIN is not even checked. */
  allowed: boolean;
  attemptsLeft: number;
  lockedUntil: Date | null;
}

/** Take one try at the PIN (counted first, atomically, in the database). */
export async function takeAttempt(db: SupabaseClient, userId: string, now: Date): Promise<Attempt> {
  const { data, error } = await db.rpc("pin_take_attempt", {
    p_user: userId,
    p_now: now.toISOString(),
    p_max: MAX_FAILS,
  });
  if (error) fail("take pin attempt", error);
  const r = (Array.isArray(data) ? data[0] : data) as {
    allowed: boolean;
    locked_until: string | null;
    attempts_left: number;
  } | null;
  return {
    allowed: r?.allowed === true,
    attemptsLeft: Number(r?.attempts_left ?? 0),
    lockedUntil: r?.locked_until ? new Date(r.locked_until) : null,
  };
}

/** The right PIN was typed: counts, level and lock start over. */
export async function clearAttempts(db: SupabaseClient, userId: string, now: Date): Promise<void> {
  const { error } = await db.rpc("pin_clear_attempts", {
    p_user: userId,
    p_now: now.toISOString(),
  });
  if (error) fail("clear pin attempts", error);
}

export async function setResetRequested(
  db: SupabaseClient,
  userId: string,
  at: Date | null,
): Promise<void> {
  const { error } = await db
    .from("user_security")
    .update({ reset_requested_at: at?.toISOString() ?? null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) fail("save reset request", error);
}
