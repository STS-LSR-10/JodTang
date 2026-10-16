import { getStripeEnv } from "@/lib/env";
import { getAdminClient } from "@/lib/supabase/admin";
import type { PaymentProvider } from "./provider";
import { createStripeProvider } from "./stripe";
import { stubPaymentProvider } from "./stub";

/** Stripe when its keys are configured, otherwise the "not open yet" stub. */
export function getPaymentProvider(): PaymentProvider {
  const env = getStripeEnv();
  return env ? createStripeProvider(env, getAdminClient) : stubPaymentProvider;
}
