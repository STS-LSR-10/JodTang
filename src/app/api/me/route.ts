import { guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { MAX_RECURRING_RULES, POINTS_PER_PLUS_DAY } from "@/lib/config";
import {
  can,
  effectivePlan,
  FREE_SLIP_LIMIT,
  isPaidPlan,
  slipsRemaining,
  type Feature,
} from "@/lib/plan";
import { getPaymentProvider } from "@/lib/payments";
import { currentStreak, recentDailyKeys, redeemable } from "@/lib/points";
import { countSlipsThisMonth } from "@/lib/slip-repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEATURES: Feature[] = [
  "unlimitedSlips",
  "savingsChart",
  "recurring",
  "multiAccount",
  "merchantMemory",
  "dailyReminder",
  "advancedExport",
];

export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const db = getAdminClient();
    const { data, error } = await db
      .from("users")
      .select(
        "display_name,picture_url,plan,plan_expires_at,points,referral_code,referred_by,stripe_customer_id,stripe_subscription_id",
      )
      .eq("id", auth.userId)
      .single();
    if (error) throw new Error(`load me: ${error.message}`);

    const now = new Date();
    const plan = effectivePlan(data.plan, data.plan_expires_at, now);
    const [slipsUsed, dailyKeys, payments] = await Promise.all([
      countSlipsThisMonth(db, auth.userId, now),
      recentDailyKeys(db, auth.userId),
      getPaymentProvider().listPayments(auth.userId),
    ]);

    return json({
      displayName: data.display_name,
      pictureUrl: data.picture_url,
      // the plan in force now (an expired paid plan reads as "free")
      plan,
      planExpiresAt: data.plan_expires_at,
      features: Object.fromEntries(FEATURES.map((f) => [f, can(plan, f)])),
      slips: {
        used: slipsUsed,
        limit: isPaidPlan(plan) ? null : FREE_SLIP_LIMIT,
        remaining: slipsRemaining(plan, slipsUsed),
      },
      points: data.points,
      streak: currentStreak(dailyKeys, now),
      redeem: { pointsPerDay: POINTS_PER_PLUS_DAY, ...redeemable(data.points) },
      referralCode: data.referral_code,
      referred: Boolean(data.referred_by),
      limits: { recurringRules: MAX_RECURRING_RULES },
      payments: {
        available: getPaymentProvider().available,
        history: payments,
        // paid by card before: the billing portal can be opened
        canManage: Boolean(data.stripe_customer_id),
        autoRenew: Boolean(data.stripe_subscription_id) && plan !== "free",
      },
    });
  });
}
