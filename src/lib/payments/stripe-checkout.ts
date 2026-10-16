import { PERIOD_MONTHS, PRICES } from "@/lib/pricing";
import { PLAN_LABEL } from "@/lib/plan";
import type { CheckoutRequest } from "./provider";

/** Where Stripe sends the person after paying / cancelling (a public page, no LINE login needed). */
export function resultUrls(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  return {
    success: `${base}/pay/result?status=success`,
    cancel: `${base}/pay/result?status=cancel`,
    portalReturn: `${base}/pay/result?status=portal`,
  };
}

/**
 * Form fields for POST /v1/checkout/sessions (Stripe's API is form-encoded with bracket keys).
 *
 *  - card      -> mode=subscription (Stripe Billing): renews by itself every month / year
 *  - promptpay -> mode=payment: one prepaid period; PromptPay cannot be charged repeatedly
 *
 * The price is built inline (`price_data`) from src/lib/pricing.ts, so there is nothing to create
 * in the Stripe dashboard. Our own user id travels in metadata and comes back in the webhook.
 */
export function buildCheckoutFields(req: CheckoutRequest, baseUrl: string): Record<string, string> {
  const urls = resultUrls(baseUrl);
  const subscription = req.method === "card";
  const meta = { user_id: req.userId, plan: req.plan, period: req.period, method: req.method };

  const f: Record<string, string> = {
    mode: subscription ? "subscription" : "payment",
    success_url: urls.success,
    cancel_url: urls.cancel,
    locale: "th",
    client_reference_id: req.userId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "thb",
    "line_items[0][price_data][unit_amount]": String(PRICES[req.plan][req.period] * 100),
    "line_items[0][price_data][product_data][name]": `จดตังค์ ${PLAN_LABEL[req.plan]} (${
      req.period === "yearly" ? "รายปี" : "รายเดือน"
    })`,
  };
  for (const [k, v] of Object.entries(meta)) f[`metadata[${k}]`] = v;

  if (subscription) {
    f["payment_method_types[0]"] = "card";
    f["line_items[0][price_data][recurring][interval]"] =
      req.period === "yearly" ? "year" : "month";
    for (const [k, v] of Object.entries(meta)) f[`subscription_data[metadata][${k}]`] = v;
  } else {
    f["payment_method_types[0]"] = "promptpay";
    if (!req.customerId) f.customer_creation = "always";
  }
  if (req.customerId) f.customer = req.customerId;
  return f;
}

export function periodMonths(period: "monthly" | "yearly"): number {
  return PERIOD_MONTHS[period];
}
