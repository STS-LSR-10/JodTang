import { describe, expect, it } from "vitest";
import { getPublicEnv, getServerEnv, getSupabaseAdminEnv } from "./env";

const base = {
  LINE_CHANNEL_ID: "a",
  LINE_CHANNEL_SECRET: "a",
  LINE_CHANNEL_ACCESS_TOKEN: "a",
  SUPABASE_SERVICE_ROLE_KEY: "a",
  SESSION_JWT_SECRET: "x".repeat(32),
  CRON_SECRET: "a",
};

describe("env", () => {
  it("accepts a complete public env", () => {
    const env = getPublicEnv({
      NEXT_PUBLIC_LIFF_ID: "1234-abcd",
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      APP_BASE_URL: "https://jodtang.example.com",
    });
    expect(env.NEXT_PUBLIC_LIFF_ID).toBe("1234-abcd");
  });

  it("names missing keys without leaking values", () => {
    expect(() => getServerEnv({ LINE_CHANNEL_ID: "secret-value" })).toThrowError(
      /LINE_CHANNEL_SECRET/,
    );
  });

  it("rejects a short session secret", () => {
    expect(() =>
      getServerEnv({ ...base, SESSION_JWT_SECRET: "short", GEMINI_API_KEY: "k" }),
    ).toThrowError(/SESSION_JWT_SECRET/);
  });

  it("defaults to gemini and requires its key", () => {
    expect(() => getServerEnv({ ...base })).toThrowError(/GEMINI_API_KEY/);
    const env = getServerEnv({ ...base, GEMINI_API_KEY: "k" });
    expect(env.AI_PROVIDER).toBe("gemini");
  });

  it("an empty AI_PROVIDER counts as not set", () => {
    const env = getServerEnv({ ...base, AI_PROVIDER: "", GEMINI_API_KEY: "k" });
    expect(env.AI_PROVIDER).toBe("gemini");
  });

  it("only requires the selected provider's key", () => {
    expect(() =>
      getServerEnv({ ...base, AI_PROVIDER: "anthropic", GEMINI_API_KEY: "k" }),
    ).toThrowError(/ANTHROPIC_API_KEY/);
    const env = getServerEnv({
      ...base,
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "k",
      AI_MODEL: "gpt-x",
    });
    expect(env.AI_MODEL).toBe("gpt-x");
  });

  it("treats empty strings as unset", () => {
    expect(() => getServerEnv({ ...base, GEMINI_API_KEY: "" })).toThrowError(/GEMINI_API_KEY/);
  });

  it("supabase admin env needs only the URL and service key", () => {
    const env = getSupabaseAdminEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "k",
    });
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("k");
    expect(() =>
      getSupabaseAdminEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }),
    ).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("rejects an unknown provider", () => {
    expect(() => getServerEnv({ ...base, AI_PROVIDER: "foo", GEMINI_API_KEY: "k" })).toThrowError(
      /AI_PROVIDER/,
    );
  });
});
