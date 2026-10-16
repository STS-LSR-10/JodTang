import { describe, expect, it } from "vitest";
import { getStripeEnv } from "@/lib/env";

const ok = {
  STRIPE_SECRET_KEY: "sk_test_abc",
  STRIPE_WEBHOOK_SECRET: "whsec_abc",
  APP_BASE_URL: "https://jodtang.example.com",
};

describe("getStripeEnv", () => {
  it("returns the settings when everything is present", () => {
    expect(getStripeEnv(ok)).toEqual({
      secretKey: "sk_test_abc",
      webhookSecret: "whsec_abc",
      baseUrl: "https://jodtang.example.com",
    });
    expect(getStripeEnv({ ...ok, STRIPE_SECRET_KEY: "rk_live_abc" })).not.toBeNull();
  });

  it("is null (payments stay off) when anything is missing or malformed", () => {
    expect(getStripeEnv({})).toBeNull();
    expect(getStripeEnv({ ...ok, STRIPE_SECRET_KEY: "" })).toBeNull();
    expect(getStripeEnv({ ...ok, STRIPE_WEBHOOK_SECRET: "" })).toBeNull();
    expect(getStripeEnv({ ...ok, APP_BASE_URL: undefined })).toBeNull();
    expect(getStripeEnv({ ...ok, STRIPE_SECRET_KEY: "pk_test_publishable" })).toBeNull();
    expect(getStripeEnv({ ...ok, STRIPE_WEBHOOK_SECRET: "not-a-webhook-secret" })).toBeNull();
  });
});
