import { describe, expect, it } from "vitest";
import { buildCheckoutFields, resultUrls } from "./stripe-checkout";

const USER = "11111111-1111-1111-1111-111111111111";
const BASE = "https://jodtang.example.com/";

describe("buildCheckoutFields", () => {
  it("card = subscription with the right recurring interval and card only", () => {
    const f = buildCheckoutFields(
      { userId: USER, plan: "plus", period: "yearly", method: "card" },
      BASE,
    );
    expect(f.mode).toBe("subscription");
    expect(f["payment_method_types[0]"]).toBe("card");
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

  it("PromptPay = one-time payment (no recurring) with PromptPay only", () => {
    const f = buildCheckoutFields(
      { userId: USER, plan: "ultimate", period: "yearly", method: "promptpay" },
      BASE,
    );
    expect(f.mode).toBe("payment");
    expect(f["payment_method_types[0]"]).toBe("promptpay");
    expect(f["line_items[0][price_data][unit_amount]"]).toBe("79900");
    expect(Object.keys(f).some((k) => k.includes("recurring"))).toBe(false);
    expect(f["metadata[method]"]).toBe("promptpay");
    expect(f.customer_creation).toBe("always");
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
