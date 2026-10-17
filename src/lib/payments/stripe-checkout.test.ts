import { describe, expect, it } from "vitest";
import { buildCheckoutFields, resultUrls } from "./stripe-checkout";

const USER = "11111111-1111-1111-1111-111111111111";
const BASE = "https://jodtang.example.com/";

describe("buildCheckoutFields", () => {
  it("card = subscription with the right recurring interval", () => {
    const f = buildCheckoutFields(
      { userId: USER, plan: "plus", period: "yearly", method: "card" },
      BASE,
    );
    expect(f.mode).toBe("subscription");
    expect(Object.keys(f).some((k) => k.startsWith("payment_method_types"))).toBe(false);
    expect(f["line_items[0][price_data][currency]"]).toBe("thb");
    expect(f["line_items[0][price_data][unit_amount]"]).toBe("29900"); // ฿299 in satang
    expect(f["line_items[0][price_data][recurring][interval]"]).toBe("year");
    expect(f["subscription_data[metadata][user_id]"]).toBe(USER);
    expect(f["subscription_data[metadata][plan]"]).toBe("plus");
    expect(f["subscription_data[metadata][period]"]).toBe("yearly");
  });

  it("monthly Ultimate card costs ฿139 and renews monthly", () => {
    const f = buildCheckoutFields(
      { userId: USER, plan: "ultimate", period: "monthly", method: "card" },
      BASE,
    );
    expect(f["line_items[0][price_data][unit_amount]"]).toBe("13900");
    expect(f["line_items[0][price_data][recurring][interval]"]).toBe("month");
  });

  it("PromptPay = one-time payment (no recurring)", () => {
    const f = buildCheckoutFields(
      { userId: USER, plan: "ultimate", period: "yearly", method: "promptpay" },
      BASE,
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
