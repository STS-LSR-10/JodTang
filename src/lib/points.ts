import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAILY_POINT,
  POINTS_PER_PLUS_DAY,
  REFERRAL_BONUS_REFEREE,
  REFERRAL_BONUS_REFERRER,
  REFERRAL_WINDOW_DAYS,
} from "@/lib/config";
import { bangkokParts, fromBangkok } from "@/lib/thai-date";

/** "2026-10-16" for the Bangkok calendar day containing `date`. */
export function bangkokDateKey(date: Date): string {
  const p = bangkokParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Current streak: consecutive days with a daily award, counted back from today.
 * A streak stays alive through "yesterday" (today may simply not be recorded yet).
 * `dailyKeys` are "YYYY-MM-DD" strings in any order, duplicates allowed.
 */
export function currentStreak(dailyKeys: string[], now: Date): number {
  const days = new Set(dailyKeys);
  const p = bangkokParts(now);
  const key = (offset: number) => bangkokDateKey(fromBangkok(p.year, p.month, p.day - offset, 12));

  let offset = days.has(key(0)) ? 0 : days.has(key(1)) ? 1 : -1;
  if (offset === -1) return 0;
  let streak = 0;
  while (days.has(key(offset))) {
    streak += 1;
    offset += 1;
  }
  return streak;
}

/** Whole Plus days the given points can buy, and what is left over. */
export function redeemable(points: number): { days: number; cost: number } {
  const days = Math.floor(Math.max(0, points) / POINTS_PER_PLUS_DAY);
  return { days, cost: days * POINTS_PER_PLUS_DAY };
}

export interface AwardResult {
  /** true when this call gave today's point (first activity of the day). */
  awarded: boolean;
  /** true when this call also paid the one-time referral bonus. */
  referralBonus: boolean;
}

/**
 * Call after an entry was confirmed. Gives the day's point once, and on that same first
 * activity pays the referral bonus (if the user was referred). Best effort: never throws.
 */
export async function awardActivity(
  db: SupabaseClient,
  userId: string,
  now: Date,
): Promise<AwardResult> {
  const none: AwardResult = { awarded: false, referralBonus: false };
  try {
    const { data, error } = await db.rpc("award_points", {
      p_user: userId,
      p_delta: DAILY_POINT,
      p_reason: "daily",
      p_ref: bangkokDateKey(now),
    });
    if (error || data !== true) return none;

    const bonus = await db.rpc("grant_referral_bonus", {
      p_user: userId,
      p_referrer_bonus: REFERRAL_BONUS_REFERRER,
      p_referee_bonus: REFERRAL_BONUS_REFEREE,
    });
    return { awarded: true, referralBonus: bonus.data === true };
  } catch (error) {
    console.error("award failed:", error instanceof Error ? error.message : "unknown error");
    return none;
  }
}

export type ReferralOutcome = "ok" | "invalid" | "self" | "already" | "expired";

export async function applyReferralCode(
  db: SupabaseClient,
  userId: string,
  code: string,
): Promise<ReferralOutcome> {
  const { data, error } = await db.rpc("apply_referral", {
    p_user: userId,
    p_code: code,
    p_window_days: REFERRAL_WINDOW_DAYS,
  });
  if (error) throw new Error(`apply referral: ${error.message}`);
  return data as ReferralOutcome;
}

/** Recent "daily" award dates, newest first (enough for a streak). */
export async function recentDailyKeys(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await db
    .from("point_ledger")
    .select("ref")
    .eq("user_id", userId)
    .eq("reason", "daily")
    .order("ref", { ascending: false })
    .limit(400);
  if (error) return [];
  return (data ?? []).map((r) => (r as { ref: string | null }).ref).filter((r): r is string => !!r);
}

export class NotEnoughPointsError extends Error {}

/** Spend points on Plus days. Returns the new Plus expiry. */
export async function redeemForPlus(
  db: SupabaseClient,
  userId: string,
  days: number,
): Promise<string> {
  const { data, error } = await db.rpc("redeem_points", {
    p_user: userId,
    p_points: days * POINTS_PER_PLUS_DAY,
    p_days: days,
  });
  if (error) {
    if (error.message.includes("not_enough_points")) throw new NotEnoughPointsError();
    throw new Error(`redeem: ${error.message}`);
  }
  return data as string;
}
