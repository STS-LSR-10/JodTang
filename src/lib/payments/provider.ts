/**
 * Payment seam for Plus subscriptions. Only a stub exists today; the interface is shaped so a
 * Stripe or PromptPay implementation can be dropped in without touching callers:
 *
 *   createCheckout  -> returns where to send the user (hosted page / PromptPay QR) and a reference
 *   handleWebhook   -> verifies the provider's callback, then activates Plus (plan_expires_at)
 *   listPayments    -> history for the settings page
 */
export interface CheckoutRequest {
  userId: string;
  plan: "plus";
  /** Subscription length. */
  months: number;
}

export type CheckoutResult =
  | { status: "unavailable"; message: string }
  | { status: "redirect"; url: string; reference: string };

export interface PaymentRecord {
  id: string;
  /** Integer satang. */
  amountSatang: number;
  status: "pending" | "paid" | "failed" | "refunded";
  createdAt: string;
  paidAt: string | null;
}

export interface WebhookResult {
  handled: boolean;
  /** Set when the callback activated Plus for a user. */
  userId?: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly available: boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  listPayments(userId: string): Promise<PaymentRecord[]>;
  handleWebhook(rawBody: string, headers: Headers): Promise<WebhookResult>;
}
