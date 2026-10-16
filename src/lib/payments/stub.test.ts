import { describe, expect, it } from "vitest";
import { PAYMENTS_UNAVAILABLE_TEXT, stubPaymentProvider } from "./stub";

describe("payment stub (used until Stripe keys are set)", () => {
  it("never charges: checkout and portal are unavailable with a polite Thai message", async () => {
    const p = stubPaymentProvider;
    expect(p.available).toBe(false);
    expect(
      await p.createCheckout({ userId: "u", plan: "plus", period: "monthly", method: "card" }),
    ).toEqual({ status: "unavailable", message: PAYMENTS_UNAVAILABLE_TEXT });
    expect(await p.createPortal("cus_1")).toEqual({
      status: "unavailable",
      message: PAYMENTS_UNAVAILABLE_TEXT,
    });
  });

  it("has no history and ignores webhooks", async () => {
    expect(await stubPaymentProvider.listPayments("u")).toEqual([]);
    expect(await stubPaymentProvider.handleWebhook("{}", new Headers())).toEqual({
      handled: false,
    });
  });
});
