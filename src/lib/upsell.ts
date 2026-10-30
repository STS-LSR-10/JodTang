import type { SupabaseClient } from "@supabase/supabase-js";
import { bangkokDateKey } from "@/lib/points";

export type UpsellFeature = "backdate" | "slip" | "voice" | "pdf" | "owl";

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
