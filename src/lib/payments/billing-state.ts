import type { SupabaseClient } from "@supabase/supabase-js";
import { billingState, type BillingState } from "./policy";

/** Load what the person is paying with (one user row + a cheap check of their payment history). */
export async function loadBillingState(
  db: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<BillingState> {
  const [user, prepaid] = await Promise.all([
    db
      .from("users")
      .select("plan,plan_expires_at,stripe_customer_id,stripe_subscription_id")
      .eq("id", userId)
      .single(),
    db
      .from("payments")
      .select("id", { head: false })
      .eq("user_id", userId)
      .eq("method", "promptpay")
      .eq("status", "paid")
      .limit(1),
  ]);
  if (user.error) throw new Error(`load payer: ${user.error.message}`);
  if (prepaid.error) throw new Error(`load payments: ${prepaid.error.message}`);
  return billingState(
    {
      plan: user.data.plan,
      planExpiresAt: user.data.plan_expires_at,
      stripeCustomerId: user.data.stripe_customer_id,
      stripeSubscriptionId: user.data.stripe_subscription_id,
      hasPrepaidPayment: (prepaid.data ?? []).length > 0,
    },
    now,
  );
}
