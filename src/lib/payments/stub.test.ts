import { describe, expect, it } from "vitest";
import { getPaymentProvider, PAYMENTS_UNAVAILABLE_TEXT } from "./stub";

describe("payment stub", () => {
  it("never charges: checkout is unavailable with a polite Thai message", async () => {
    const p = getPaymentProvider();
    expect(p.available).toBe(false);
    expect(await p.createCheckout({ userId: "u", plan: "plus", months: 1 })).toEqual({
      status: "unavailable",
      message: PAYMENTS_UNAVAILABLE_TEXT,
    });
  });

  it("has no history and ignores webhooks", async () => {
    const p = getPaymentProvider();
    expect(await p.listPayments("u")).toEqual([]);
    expect(await p.handleWebhook("{}", new Headers())).toEqual({ handled: false });
  });
});
