import { describe, expect, it } from "vitest";
import { buildCheckoutFields, resultUrls } from "./stripe-checkout";

const USER = "11111111-1111-1111-1111-111111111111";
const BASE = "https://jodtang.example.com/";
// after the launch prices ended (31 Dec 2569) and during them
const AFTER = new Date("2027-02-01T00:00:00Z");
const LAUNCH = new Date("2026-11-01T00:00:00Z");

describe("buildCheckoutFields", () => {
  it("card = subscription with the right recurring interval", () => {
    const f = buildCheckoutFields(
      { userId: USER, plan: "plus", period: "yearly", method: "card" },
      BASE,
      AFTER,
    );
    expect(f.mode).toBe("subscription");
    expect(Object.keys(f).some((k) => k.startsWith("payment_method_types"))).toBe(false);
    expect(f["line_items[0][price_data][currency]"]).toBe("thb");
    expect(f["line_items[0][price_data][unit_amount]"]).toBe("33900"); // ฿339 in satang
    expect(f["line_items[0][price_data][recurring][interval]"]).toBe("year");
    expect(f["subscription_data[metadata][user_id]"]).toBe(USER);
    expect(f["subscription_data[metadata][plan]"]).toBe("plus");
    expect(f["subscription_data[metadata][period]"]).toBe("yearly");
  });

  it("monthly Ultimate card costs ฿139 and renews monthly", () => {
    const f = buildCheckoutFields(
      { userId: USER, plan: "ultimate", period: "monthly", method: "card" },
      BASE,
      AFTER,
    );
    expect(f["line_items[0][price_data][unit_amount]"]).toBe("13900");
    expect(f["line_items[0][price_data][recurring][interval]"]).toBe("month");
  });

  it("during the launch the card is charged the launch price, after it the normal price", () => {
    const price = (plan: "plus" | "ultimate", period: "monthly" | "yearly", now: Date) =>
      buildCheckoutFields({ userId: USER, plan, period, method: "card" }, BASE, now)[
        "line_items[0][price_data][unit_amount]"
      ];
    expect(price("plus", "monthly", LAUNCH)).toBe("3900");
    expect(price("plus", "yearly", LAUNCH)).toBe("29900");
    expect(price("ultimate", "monthly", LAUNCH)).toBe("11900");
    expect(price("ultimate", "yearly", LAUNCH)).toBe("69900");
    expect(price("plus", "monthly", AFTER)).toBe("5900");
    expect(price("plus", "yearly", AFTER)).toBe("33900");
    expect(price("ultimate", "monthly", AFTER)).toBe("13900");
    expect(price("ultimate", "yearly", AFTER)).toBe("79900");
    // the last second of 31 Dec 2569 is still launch, the next one is not
    expect(price("plus", "monthly", new Date("2026-12-31T16:59:59Z"))).toBe("3900");
    expect(price("plus", "monthly", new Date("2026-12-31T17:00:00Z"))).toBe("5900");
  });

  it("PromptPay = one-time payment (no recurring)", () => {
    const f = buildCheckoutFields(
      { userId: USER, plan: "ultimate", period: "yearly", method: "promptpay" },
      BASE,
      AFTER,
    );
    expect(f.mode).toBe("payment");
    // payment methods come from the Dashboard settings: the API no longer accepts a list here
    expect(Object.keys(f).some((k) => k.startsWith("payment_method_types"))).toBe(false);
    expect(f["line_items[0][price_data][unit_amount]"]).toBe("79900");
    expect(Object.keys(f).some((k) => k.includes("recurring"))).toBe(false);
    expect(f["metadata[method]"]).toBe("promptpay");
    expect(f.customer_creation).toBe("always");
  });

  it("a prepaid upgrade charges only the difference and is marked as an upgrade", () => {
    const f = buildCheckoutFields(
      {
        userId: USER,
        plan: "ultimate",
        period: "monthly",
        method: "promptpay",
        upgrade: { amountSatang: 4000, days: 15 },
      },
      BASE,
    );
    expect(f.mode).toBe("payment");
    expect(f["line_items[0][price_data][unit_amount]"]).toBe("4000");
    expect(f["metadata[kind]"]).toBe("upgrade");
    expect(f["line_items[0][price_data][product_data][name]"]).toContain("ส่วนต่าง 15 วัน");
  });

  it("ignores an upgrade amount for a card subscription (never a custom price)", () => {
    const f = buildCheckoutFields(
      {
        userId: USER,
        plan: "ultimate",
        period: "monthly",
        method: "card",
        upgrade: { amountSatang: 100, days: 1 },
      },
      BASE,
      AFTER,
    );
    expect(f["line_items[0][price_data][unit_amount]"]).toBe("13900");
    expect(f["metadata[kind]"]).toBeUndefined();
  });

  it("reuses an existing customer instead of creating one", () => {
    const f = buildCheckoutFields(
      { userId: USER, plan: "plus", period: "monthly", method: "promptpay", customerId: "cus_1" },
      BASE,
    );
    expect(f.customer).toBe("cus_1");
    expect(f.customer_creation).toBeUndefined();
  });

  it("sends the person back to our public result page", () => {
    const f = buildCheckoutFields(
      { userId: USER, plan: "plus", period: "monthly", method: "card" },
      BASE,
    );
    expect(f.success_url).toBe("https://jodtang.example.com/pay/result?status=success");
    expect(f.cancel_url).toBe(resultUrls(BASE).cancel);
    expect(f.locale).toBe("th");
  });
});
