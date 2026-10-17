import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";
import { buildCheckoutFields, resultUrls } from "./stripe-checkout";
import { applyAction, interpretEvent, type StripeEvent } from "./stripe-events";
import { StripeApiError, stripePost } from "./stripe-api";
import { verifyStripeSignature } from "./stripe-signature";
import type { PaymentProvider, PaymentRecord } from "./provider";

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  baseUrl: string;
}

export const PAYMENT_FAILED_TEXT = "เปิดหน้าชำระเงินไม่สำเร็จ ลองใหม่อีกครั้งนะ";

/** The generic message plus Stripe's error code, so a failure can be traced without server logs. */
export function failureMessage(error: unknown): string {
  return error instanceof StripeApiError && error.reason
    ? `${PAYMENT_FAILED_TEXT} (รหัส: ${error.reason})`
    : PAYMENT_FAILED_TEXT;
}

export function createStripeProvider(
  config: StripeConfig,
  getDb: () => SupabaseClient,
): PaymentProvider {
  return {
    name: "stripe",
    available: true,

    async createCheckout(request) {
      try {
        const session = await stripePost<{ id: string; url: string | null }>(
          config.secretKey,
          "/checkout/sessions",
          buildCheckoutFields(request, config.baseUrl),
        );
        if (!session.url) return { status: "unavailable", message: PAYMENT_FAILED_TEXT };
        return { status: "redirect", url: session.url, reference: session.id };
      } catch (error) {
        log.error("stripe_checkout_failed", error);
        return { status: "unavailable", message: failureMessage(error) };
      }
    },

    async createPortal(customerId) {
      try {
        const session = await stripePost<{ url: string }>(
          config.secretKey,
          "/billing_portal/sessions",
          { customer: customerId, return_url: resultUrls(config.baseUrl).portalReturn },
        );
        return { status: "redirect", url: session.url };
      } catch (error) {
        log.error("stripe_portal_failed", error);
        return { status: "unavailable", message: failureMessage(error) };
      }
    },

    async listPayments(userId) {
      const { data, error } = await getDb()
        .from("payments")
        .select("id,amount,status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(`list payments: ${error.message}`);
      return (data ?? []).map((p): PaymentRecord => ({
        id: p.id as string,
        amountSatang: p.amount as number,
        status: p.status as PaymentRecord["status"],
        createdAt: p.created_at as string,
        paidAt: p.status === "paid" ? (p.created_at as string) : null,
      }));
    },

    async handleWebhook(rawBody, headers) {
      if (!verifyStripeSignature(rawBody, headers.get("stripe-signature"), config.webhookSecret)) {
        throw new InvalidSignatureError();
      }
      const event = JSON.parse(rawBody) as StripeEvent;
      const result = await applyAction(getDb(), interpretEvent(event));
      log.info("stripe_event", { type: event.type, handled: result.handled });
      return result;
    },
  };
}

export class InvalidSignatureError extends Error {
  constructor() {
    super("invalid stripe signature");
  }
}
