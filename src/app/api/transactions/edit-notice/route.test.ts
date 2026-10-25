import { beforeEach, describe, expect, it, vi } from "vitest";

const pushed: unknown[][] = [];
let card: unknown = { type: "flex" };

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  limitOr429: async () => null,
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ LINE_CHANNEL_ACCESS_TOKEN: "t" }) }));
vi.mock("@/lib/line/client", () => ({
  createLineClient: () => ({
    push: async (...args: unknown[]) => {
      pushed.push(args);
    },
  }),
}));
vi.mock("@/lib/line/handlers", () => ({ editedCardFor: async () => card }));

import { POST } from "./route";

beforeEach(() => {
  pushed.length = 0;
  card = { type: "flex" };
});

describe("POST /api/transactions/edit-notice", () => {
  it("pushes the edited-entry card to the signed-in user", async () => {
    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(pushed).toEqual([["U1", [{ type: "flex" }]]]);
  });

  it("404 and nothing pushed when no entry was edited recently", async () => {
    card = null;
    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(404);
    expect(pushed).toHaveLength(0);
  });
});
