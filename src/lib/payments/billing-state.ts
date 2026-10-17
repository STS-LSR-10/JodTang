import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan } from "@/lib/plan";
import { billingState, type BillingState } from "./policy";

/** Load what the person is paying with: the user row, their latest prepaid purchase and trials. */
export async function loadBillingState(
  db: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<BillingState> {
  const [user, prepaid, trials] = await Promise.all([
    db
      .from("users")
      .select("plan,plan_expires_at,stripe_customer_id,stripe_subscription_id,billing_period")
      .eq("id", userId)
      .single(),
    db
      .from("payments")
      .select("months")
      .eq("user_id", userId)
      .eq("method", "promptpay")
      .eq("status", "paid")
      .eq("kind", "purchase")
      .order("created_at", { ascending: false })
      .limit(1),
    db.from("plan_trials").select("plan").eq("user_id", userId),
  ]);
  if (user.error) throw new Error(`load payer: ${user.error.message}`);
  if (prepaid.error) throw new Error(`load payments: ${prepaid.error.message}`);
  // plan_trials arrives with migration 0011; until it is applied nobody has used a trial
  const trialsUsed = trials.error ? [] : ((trials.data ?? []).map((t) => t.plan as Plan) as Plan[]);
  const latest = (prepaid.data ?? [])[0] as { months: number } | undefined;
  return billingState(
    {
      plan: user.data.plan,
      planExpiresAt: user.data.plan_expires_at,
      stripeCustomerId: user.data.stripe_customer_id,
      stripeSubscriptionId: user.data.stripe_subscription_id,
      billingPeriod: user.data.billing_period,
      hasPrepaidPayment: Boolean(latest),
      prepaidMonths: latest?.months ?? null,
      trialsUsed,
    },
    now,
  );
}
