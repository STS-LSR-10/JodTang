import { beforeEach, describe, expect, it, vi } from "vitest";

let plan = "free";
const sign = vi.fn(async () => "signed-token");

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  limitOr429: async () => null,
}));
vi.mock("@/lib/auth/export-token", () => ({
  signExportToken: (...a: unknown[]) => sign(...(a as [])),
}));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ SESSION_JWT_SECRET: "s".repeat(40) }) }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("https://app.example.com/api/export/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  plan = "free";
  sign.mockClear();
});

describe("POST /api/export/link", () => {
  it("is for Professional and above: Free gets a 403 with the upgrade hint and no link", async () => {
    const res = await post({ format: "csv" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ upgrade: true });
    expect(sign).not.toHaveBeenCalled();
  });

  it.each(["plus", "ultimate"])("%s gets a download link", async (p) => {
    plan = p;
    const res = await post({ format: "xlsx", type: "expense" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://app.example.com/api/export/download?t=signed-token");
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it("an unknown format is still a 400 for a paid user", async () => {
    plan = "plus";
    expect((await post({ format: "pdf" })).status).toBe(400);
  });
});
