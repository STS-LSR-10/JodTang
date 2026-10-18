import { beforeEach, describe, expect, it, vi } from "vitest";

let plan = "free";
const saved: { categoryId: string | null; amountSatang: number | null }[] = [];
const modes: unknown[] = [];
const FOOD = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: () => ({
      upsert: async (row: unknown) => {
        modes.push(row);
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  getSettings: async () => ({ budget_cycle: "monthly", cycle_start_day: 1 }),
  loadCategories: async () => [{ id: FOOD, type: "expense", name: "อาหาร" }],
  setBudget: async (
    _db: unknown,
    input: { categoryId: string | null; amountSatang: number | null },
  ) => {
    saved.push(input);
  },
}));

import { PUT } from "./route";

const put = (body: unknown) =>
  PUT(
    new Request("https://app.example.com/api/budgets", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  plan = "free";
  saved.length = 0;
  modes.length = 0;
});

describe("PUT /api/budgets: who may set what", () => {
  it("Free can set the overall budget and go back to the overall mode", async () => {
    expect((await put({ mode: "overall", overall: "10000" })).status).toBe(200);
    expect(saved).toMatchObject([{ categoryId: null, amountSatang: 1_000_000 }]);
  });

  it("Free cannot switch to per-category budgets or set one", async () => {
    for (const body of [
      { mode: "category" },
      { categories: [{ categoryId: FOOD, amount: "1500" }] },
    ]) {
      const res = await put(body);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ upgrade: true });
    }
    expect(saved).toHaveLength(0);
    expect(modes).toHaveLength(0);
  });

  it("Free can still clear a category budget they set before", async () => {
    expect((await put({ categories: [{ categoryId: FOOD, amount: null }] })).status).toBe(200);
    expect(saved).toMatchObject([{ categoryId: FOOD, amountSatang: null }]);
  });

  it.each(["plus", "ultimate"])("%s sets per-category budgets", async (p) => {
    plan = p;
    expect(
      (await put({ mode: "category", categories: [{ categoryId: FOOD, amount: "1500" }] })).status,
    ).toBe(200);
    expect(saved).toMatchObject([{ categoryId: FOOD, amountSatang: 150_000 }]);
  });
});
