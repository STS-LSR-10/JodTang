import { describe, expect, it } from "vitest";
import { getPublicEnv, getServerEnv } from "./env";

describe("env", () => {
  it("accepts a complete public env", () => {
    const env = getPublicEnv({
      NEXT_PUBLIC_LIFF_ID: "1234-abcd",
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      APP_BASE_URL: "https://meetang.example.com",
    });
    expect(env.NEXT_PUBLIC_LIFF_ID).toBe("1234-abcd");
  });

  it("names missing keys without leaking values", () => {
    expect(() => getServerEnv({ LINE_CHANNEL_ID: "secret-value" })).toThrowError(
      /LINE_CHANNEL_SECRET/,
    );
  });

  it("rejects a short session secret", () => {
    const base = {
      LINE_CHANNEL_ID: "a",
      LINE_CHANNEL_SECRET: "a",
      LINE_CHANNEL_ACCESS_TOKEN: "a",
      SUPABASE_SERVICE_ROLE_KEY: "a",
      ANTHROPIC_API_KEY: "a",
      CRON_SECRET: "a",
    };
    expect(() => getServerEnv({ ...base, SESSION_JWT_SECRET: "short" })).toThrowError(
      /SESSION_JWT_SECRET/,
    );
    expect(getServerEnv({ ...base, SESSION_JWT_SECRET: "x".repeat(32) }).CRON_SECRET).toBe("a");
  });
});
