import { getPaymentProvider } from "@/lib/payments";
import { InvalidSignatureError } from "@/lib/payments/stripe";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook — Stripe calls this after a payment or a subscription change.
 * The body is verified against the signing secret before anything is read from it.
 * A 5xx makes Stripe retry later; every step is idempotent, so retries are safe.
 */
export async function POST(request: Request): Promise<Response> {
  const provider = getPaymentProvider();
  if (!provider.available) return new Response("payments not configured", { status: 503 });

  const rawBody = await request.text();
  try {
    await provider.handleWebhook(rawBody, request.headers);
    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof InvalidSignatureError) {
      return new Response("invalid signature", { status: 400 });
    }
    log.error("stripe_webhook_failed", error);
    return new Response("webhook error", { status: 500 });
  }
}
