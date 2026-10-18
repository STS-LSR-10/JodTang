import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Wallet } from "@/lib/wallet";

let wallets: Wallet[] = [];
let rows: Record<string, unknown>[] = [];
let calls: [string, ...unknown[]][] = [];
const ME = "22222222-2222-4222-8222-222222222222";
const SHARED = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: ME, lineUserId: "U1" }),
}));
vi.mock("@/lib/wallet-repo", () => ({ listWallets: async () => wallets }));
vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan: "free", plan_expires_at: null }),
}));
/** A query that records what was asked and answers with `rows`. */
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = new Proxy(
        {},
        {
          get: (_t, name: string) => {
            if (name === "then") {
              return (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
            }
            return (...args: unknown[]) => {
              calls.push([name, ...args]);
              return q;
            };
          },
        },
      );
      return q;
    },
  }),
}));

import { GET } from "./route";

const get = (qs = "") => GET(new Request(`https://app.example.com/api/transactions${qs}`));
const asked = (name: string, col: string) => calls.some((c) => c[0] === name && c[1] === col);

const wallet = (over: Partial<Wallet>): Wallet => ({
  id: SHARED,
  name: "กองกลาง",
  kind: "bank",
  isDefault: false,
  openingSatang: 0,
  incomeSatang: 0,
  expenseSatang: 0,
  transferInSatang: 0,
  transferOutSatang: 0,
  debtInSatang: 0,
  debtOutSatang: 0,
  entryCount: 0,
  creditLimitSatang: null,
  statementDay: null,
  dueDay: null,
  ...over,
});

beforeEach(() => {
  calls = [];
  wallets = [
    wallet({ id: "main", name: "เงินสด", isDefault: true }),
    wallet({ shared: true, ownerId: OTHER }),
  ];
  rows = [
    {
      id: "t1",
      type: "expense",
      title: "ข้าว",
      amount: "100.00",
      occurred_at: "2026-10-10T05:00:00Z",
      source: "text",
      category_id: null,
      user_id: ME,
      account_id: SHARED,
      accounts: { name: "กองกลาง", is_shared: true },
      users: { display_name: "แอน" },
      categories: null,
    },
    {
      id: "t2",
      type: "expense",
      title: "กาแฟ",
      amount: "50.00",
      occurred_at: "2026-10-10T06:00:00Z",
      source: "text",
      category_id: null,
      user_id: OTHER,
      account_id: SHARED,
      accounts: { name: "กองกลาง", is_shared: true },
      users: { display_name: "บ๊อบ" },
      categories: null,
    },
  ];
});

describe("GET /api/transactions and shared wallets", () => {
  it("without a wallet filter only the person's own entries are asked for", async () => {
    await get();
    expect(calls.some((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === ME)).toBe(true);
  });

  it("filtering by a private wallet is still only their own entries", async () => {
    await get("?accountId=" + "44444444-4444-4444-8444-444444444444");
    expect(calls.some((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === ME)).toBe(true);
  });

  it("filtering by a shared wallet they are on asks for everybody's entries in it", async () => {
    await get("?accountId=" + SHARED);
    expect(asked("eq", "user_id")).toBe(false);
    expect(calls.some((c) => c[0] === "eq" && c[1] === "account_id" && c[2] === SHARED)).toBe(true);
  });

  it("a shared wallet they are NOT on is treated like any other: only their own entries", async () => {
    wallets = [wallet({ id: "main", name: "เงินสด", isDefault: true })];
    await get("?accountId=" + SHARED);
    expect(calls.some((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === ME)).toBe(true);
  });

  it("each entry says who wrote it and whether it is the viewer's own", async () => {
    const body = await (await get("?accountId=" + SHARED)).json();
    const [mine, theirs] = body.items;
    expect(mine).toMatchObject({
      title: "ข้าว",
      mine: true,
      accountShared: true,
      writerName: "แอน",
    });
    expect(theirs).toMatchObject({
      title: "กาแฟ",
      mine: false,
      accountShared: true,
      writerName: "บ๊อบ",
    });
  });
});
