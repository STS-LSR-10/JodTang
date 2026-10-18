import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

let plan = "plus";

vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  getSettings: async () => ({ budget_cycle: "monthly", cycle_start_day: 1 }),
  getBudgetMode: async () => "overall",
  loadBudgets: async () => [{ category_id: null, amount: "1000.00" }],
  loadCategories: async () => [],
  expenseTotalSatang: async () => 85_000, // ฿850 spent, the new entry (฿100) included
}));

import { budgetAlertsFor } from "./budget-alert";

const run = () =>
  budgetAlertsFor({} as SupabaseClient, {
    userId: "u1",
    type: "expense",
    categoryId: null,
    amountSatang: 10_000,
    occurredAt: new Date("2026-10-15T05:00:00Z"),
    now: new Date("2026-10-18T05:00:00Z"),
  });

beforeEach(() => {
  plan = "plus";
});

describe("budgetAlertsFor: who gets the 80% / 100% warnings", () => {
  it.each(["plus", "ultimate"])("%s is warned when the spending crosses 80%", async (p) => {
    plan = p;
    const alerts = await run();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("80%");
  });

  it("Free gets no warning, even for the overall budget", async () => {
    plan = "free";
    expect(await run()).toEqual([]);
  });
});
