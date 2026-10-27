import type { SupabaseClient } from "@supabase/supabase-js";
import { bangkokDateKey } from "@/lib/points";

/** Slip reads every account gets for free, once in a lifetime (a taste of the Pro feature). */
export const TEASER_SLIPS = 1;

export type UpsellFeature = "backdate" | "slip" | "voice";

/** Take one free slip read. False when they are used up (or the counter could not be reached). */
export async function takeTeaserSlip(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.rpc("take_teaser_slip", {
    p_user: userId,
    p_limit: TEASER_SLIPS,
  });
  if (error) throw new Error(`take teaser slip: ${error.message}`);
  return data === true;
}

/** Give a taken free read back because the slip was not recorded. */
export async function refundTeaserSlip(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db.rpc("refund_teaser_slip", { p_user: userId });
  if (error) throw new Error(`refund teaser slip: ${error.message}`);
}

/**
 * True the first time today (Bangkok) that this person is shown this upgrade card; later times the
 * caller sends the short text instead, so the pitch never nags. When the check itself fails the
 * card is not sent (a nag is worse than a missed pitch).
 */
export async function claimUpsellCard(
  db: SupabaseClient,
  userId: string,
  feature: UpsellFeature,
  now: Date,
): Promise<boolean> {
  const { data, error } = await db.rpc("claim_upsell_card", {
    p_user: userId,
    p_feature: feature,
    p_day: bangkokDateKey(now),
  });
  if (error) return false;
  return data === true;
}
