import { afterEach, describe, expect, it, vi } from "vitest";
import { StripeApiError, stripePost } from "./stripe-api";
import { failureMessage, PAYMENT_FAILED_TEXT } from "./stripe";

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

describe("stripePost", () => {
  it("returns the JSON body and sends the key as a bearer token, form-encoded", async () => {
    reply(200, { id: "cs_1", url: "https://checkout.stripe.com/x" });
    const out = await stripePost<{ id: string }>("sk_test_abc", "/checkout/sessions", {
      mode: "payment",
    });
    expect(out.id).toBe("cs_1");
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_abc");
    expect(init.body).toBe("mode=payment");
  });

  it("turns a Stripe error into a StripeApiError with the code, and never leaks the key", async () => {
    reply(401, {
      error: { code: "api_key_invalid", message: "Invalid API Key provided: sk_test_***abc" },
    });
    const err = await stripePost("sk_test_secretvalue", "/checkout/sessions", {}).catch(
      (e: unknown) => e as StripeApiError,
    );
    expect(err).toBeInstanceOf(StripeApiError);
    expect(err.reason).toBe("401 api_key_invalid");
    expect(err.message).not.toContain("sk_test_secretvalue");
  });
});

describe("failureMessage", () => {
  it("adds the Stripe error code to the generic text", () => {
    expect(failureMessage(new StripeApiError(400, "x", "payment_method_unactivated"))).toBe(
      `${PAYMENT_FAILED_TEXT} (รหัส: 400 payment_method_unactivated)`,
    );
  });

  it("stays generic for other errors", () => {
    expect(failureMessage(new Error("boom"))).toBe(PAYMENT_FAILED_TEXT);
  });
});
