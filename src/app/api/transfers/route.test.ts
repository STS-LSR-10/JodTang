import { beforeEach, describe, expect, it, vi } from "vitest";

let plan = "plus";
const created: Record<string, unknown>[] = [];
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  limitOr429: async () => null,
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/wallet-repo", () => ({
  ensureWallets: async () => [{ id: A }, { id: B }],
}));
vi.mock("@/lib/transfer-repo", () => ({
  createTransfer: async (_db: unknown, _u: string, input: Record<string, unknown>) => {
    created.push(input);
    return "new-id";
  },
  listTransfers: async () => [],
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("https://app.example.com/api/transfers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  plan = "plus";
  created.length = 0;
});

describe("POST /api/transfers", () => {
  it("is for Professional and above", async () => {
    plan = "free";
    const res = await post({ fromId: A, toId: B, amount: "500" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ upgrade: true });
    expect(created).toHaveLength(0);
  });

  it("saves the amount as satang between two of their wallets", async () => {
    const res = await post({ fromId: A, toId: B, amount: "1,200.50", note: "ค่าบัตร" });
    expect(res.status).toBe(201);
    expect(created[0]).toMatchObject({
      fromId: A,
      toId: B,
      amountSatang: 120050,
      note: "ค่าบัตร",
    });
  });

  it.each([
    [{ fromId: A, toId: A, amount: "10" }, 400],
    [{ fromId: A, toId: B, amount: "0" }, 400],
    [{ fromId: A, toId: B, amount: "abc" }, 400],
    [{ fromId: A, toId: B, amount: "-5" }, 400],
    [{ fromId: A, toId: "not-a-uuid", amount: "10" }, 400],
    [{ fromId: A, toId: STRANGER, amount: "10" }, 404],
  ])("%j is refused with %s", async (body, status) => {
    expect((await post(body)).status).toBe(status);
    expect(created).toHaveLength(0);
  });
});
