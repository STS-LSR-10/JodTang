import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    rpc: async (_name: string, args: { p_type: string }) => ({
      data:
        args.p_type === "income"
          ? [
              { category_id: "salary", total: "35000.00" },
              { category_id: null, total: "10.00" },
            ]
          : [{ category_id: "food", total: "250.00" }],
      error: null,
    }),
  }),
}));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  getSettings: async () => ({ budget_cycle: "monthly", cycle_start_day: 5, daily_budget: null }),
  getBudgetMode: async () => "category",
  loadBudgets: async () => [{ category_id: "food", amount: "600.00" }],
  loadCategories: async () => [
    { id: "food", type: "expense", name: "อาหาร", color: null, is_hidden: false, sort_order: 1 },
  ],
  expenseTotalSatang: async () => 0,
}));

import { GET } from "./route";

describe("GET /api/budgets", () => {
  it("carries the cycle's start day and what came in per income category", async () => {
    const body = (await (await GET(new Request("https://x/api/budgets"))).json()) as {
      cycleStartDay: number;
      income: { categoryId: string; receivedSatang: number }[];
      categories: { categoryId: string; amountSatang: number | null; spentSatang: number }[];
    };
    expect(body.cycleStartDay).toBe(5);
    // the entry with no category is left out: there is no card to put it on
    expect(body.income).toEqual([{ categoryId: "salary", receivedSatang: 3_500_000 }]);
    expect(body.categories[0]).toMatchObject({
      categoryId: "food",
      amountSatang: 60_000,
      spentSatang: 25_000,
    });
  });
});
