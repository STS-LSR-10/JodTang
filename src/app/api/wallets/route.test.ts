import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Wallet } from "@/lib/wallet";

let plan = "free";
let existing: Wallet[] = [];
const created: Record<string, unknown>[] = [];
let createResult: string = "new-id";

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
  ensureWallets: async () => existing,
  createWallet: async (_db: unknown, _u: string, input: Record<string, unknown>) => {
    created.push(input);
    return createResult;
  },
}));

import { GET, POST } from "./route";

const wallet = (n: number): Wallet => ({
  id: `w${n}`,
  name: `กระเป๋า ${n}`,
  kind: "bank",
  isDefault: n === 1,
  openingSatang: 0,
  incomeSatang: 0,
  expenseSatang: 0,
  transferInSatang: 0,
  transferOutSatang: 0,
  creditLimitSatang: null,
  statementDay: null,
  dueDay: null,
  entryCount: 0,
});
const wallets = (n: number) => Array.from({ length: n }, (_, i) => wallet(i + 1));
const post = (body: unknown) =>
  POST(
    new Request("https://app.example.com/api/wallets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const get = () => GET(new Request("https://app.example.com/api/wallets"));

beforeEach(() => {
  plan = "free";
  existing = wallets(1);
  created.length = 0;
  createResult = "new-id";
});

describe("POST /api/wallets: how many each plan may have", () => {
  it("Free has one: a second is refused with an upgrade hint", async () => {
    const res = await post({ name: "KTC", kind: "card" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ upgrade: true });
    expect(created).toHaveLength(0);
  });

  it("Professional can reach five, not six", async () => {
    plan = "plus";
    existing = wallets(4);
    expect((await post({ name: "ใบที่ 5" })).status).toBe(201);
    existing = wallets(5);
    const res = await post({ name: "ใบที่ 6" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ upgrade: true });
  });

  it("Ultimate is not limited to five", async () => {
    plan = "ultimate";
    existing = wallets(8);
    expect((await post({ name: "ใบที่ 9" })).status).toBe(201);
  });
});

describe("POST /api/wallets: the input", () => {
  beforeEach(() => {
    plan = "ultimate";
  });

  it("saves the kind and the opening balance as satang", async () => {
    await post({ name: "KTC", kind: "card", openingBalance: "-3,500.50" });
    expect(created[0]).toMatchObject({ name: "KTC", kind: "card", openingSatang: -350050 });
  });

  it("refuses a bad balance, an empty name and an unknown kind", async () => {
    expect((await post({ name: "A", openingBalance: "abc" })).status).toBe(400);
    expect((await post({ name: "  " })).status).toBe(400);
    expect((await post({ name: "A", kind: "gold" })).status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it("a name that already exists is a 409", async () => {
    createResult = "duplicate";
    expect((await post({ name: "KTC" })).status).toBe(409);
  });
});

describe("GET /api/wallets", () => {
  it("returns the wallets, the total and what the plan allows", async () => {
    plan = "plus";
    existing = wallets(2);
    const body = await (await get()).json();
    expect(body).toMatchObject({ limit: 5, canAdd: true });
    expect(body.items).toHaveLength(2);
  });

  it("canAdd is false at the limit", async () => {
    const body = await (await get()).json();
    expect(body).toMatchObject({ limit: 1, canAdd: false });
  });
});

describe("POST /api/wallets: credit-card fields", () => {
  it("Professional saves the limit and the two days on a card", async () => {
    plan = "plus";
    existing = wallets(1);
    const res = await post({
      name: "KTC",
      kind: "card",
      creditLimit: "50,000",
      statementDay: 25,
      dueDay: 10,
    });
    expect(res.status).toBe(201);
    expect(created[0]).toMatchObject({
      kind: "card",
      creditLimitSatang: 5_000_000,
      statementDay: 25,
      dueDay: 10,
    });
  });

  it("Free can have a card wallet but cannot set the limit or days", async () => {
    existing = [];
    expect((await post({ name: "KTC", kind: "card" })).status).toBe(201);
    const res = await post({ name: "KTC2", kind: "card", creditLimit: 50000 });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ upgrade: true });
    expect(created).toHaveLength(1);
  });

  it("only a card can have them", async () => {
    plan = "plus";
    expect((await post({ name: "ธนาคาร", kind: "bank", creditLimit: 50000 })).status).toBe(400);
  });

  it.each([
    { creditLimit: "0" },
    { creditLimit: "abc" },
    { creditLimit: "-5" },
    { statementDay: 31 },
    { statementDay: 0 },
    { dueDay: 1.5 },
  ])("%j is refused", async (extra) => {
    plan = "plus";
    expect((await post({ name: "KTC", kind: "card", ...extra })).status).toBe(400);
    expect(created).toHaveLength(0);
  });
});
