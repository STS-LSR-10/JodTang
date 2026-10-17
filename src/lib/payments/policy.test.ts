import { describe, expect, it } from "vitest";
import { billingState, checkoutBlock, type BillingInputs } from "./policy";

const NOW = new Date("2026-10-17T00:00:00Z");
const FUTURE = "2026-11-17T00:00:00Z";
const PAST = "2026-09-17T00:00:00Z";

const input = (over: Partial<BillingInputs> = {}): BillingInputs => ({
  plan: "free",
  planExpiresAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  hasPrepaidPayment: false,
  ...over,
});
const state = (over: Partial<BillingInputs> = {}) => billingState(input(over), NOW);

describe("billingState", () => {
  it("a new user has nothing running", () => {
    expect(state()).toMatchObject({
      plan: "free",
      subscriptionRunning: false,
      prepaidRunning: false,
    });
  });

  it("a card subscription is running only while its period has not ended", () => {
    expect(
      state({ plan: "plus", planExpiresAt: FUTURE, stripeSubscriptionId: "sub_1" }),
    ).toMatchObject({
      plan: "plus",
      subscriptionRunning: true,
      prepaidRunning: false,
    });
    expect(
      state({ plan: "plus", planExpiresAt: PAST, stripeSubscriptionId: "sub_1" }),
    ).toMatchObject({
      plan: "free",
      subscriptionRunning: false,
    });
  });

  it("prepaid time needs a PromptPay payment on record (redeemed points days do not count)", () => {
    expect(
      state({ plan: "plus", planExpiresAt: FUTURE, hasPrepaidPayment: true }).prepaidRunning,
    ).toBe(true);
    expect(state({ plan: "free", planExpiresAt: FUTURE }).prepaidRunning).toBe(false);
    expect(
      state({ plan: "plus", planExpiresAt: PAST, hasPrepaidPayment: true }).prepaidRunning,
    ).toBe(false);
  });
});

describe("checkoutBlock", () => {
  it("allows a first purchase either way", () => {
    expect(checkoutBlock(state(), { plan: "plus", method: "card" })).toBeNull();
    expect(checkoutBlock(state(), { plan: "ultimate", method: "promptpay" })).toBeNull();
  });

  it("allows points-redeemed days to be upgraded to a card subscription", () => {
    expect(
      checkoutBlock(state({ planExpiresAt: FUTURE }), { plan: "plus", method: "card" }),
    ).toBeNull();
  });

  it("a running subscription blocks every second payment and points to the portal", () => {
    const s = state({ plan: "plus", planExpiresAt: FUTURE, stripeSubscriptionId: "sub_1" });
    for (const method of ["card", "promptpay"] as const) {
      const b = checkoutBlock(s, { plan: "ultimate", method });
      expect(b?.manage).toBe(true);
    }
  });

  it("prepaid time can be topped up or upgraded with PromptPay but not mixed with a card", () => {
    const s = state({ plan: "plus", planExpiresAt: FUTURE, hasPrepaidPayment: true });
    expect(checkoutBlock(s, { plan: "plus", method: "promptpay" })).toBeNull();
    expect(checkoutBlock(s, { plan: "ultimate", method: "promptpay" })).toBeNull();
    expect(checkoutBlock(s, { plan: "ultimate", method: "card" })?.message).toMatch(/พร้อมเพย์/);
  });

  it("never sells a cheaper tier than the one in force", () => {
    const s = state({ plan: "ultimate", planExpiresAt: FUTURE, hasPrepaidPayment: true });
    expect(checkoutBlock(s, { plan: "plus", method: "promptpay" })?.message).toMatch(/สูงกว่า/);
  });

  it("an expired plan is just a new purchase again", () => {
    const s = state({
      plan: "ultimate",
      planExpiresAt: PAST,
      stripeSubscriptionId: "sub_1",
      hasPrepaidPayment: true,
    });
    expect(checkoutBlock(s, { plan: "plus", method: "card" })).toBeNull();
  });
});
