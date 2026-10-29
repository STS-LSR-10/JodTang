import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

let plan = "plus";
let todaySpent = 85_000; // ฿850 spent, the new entry (฿100) included
let dailyBudget: string | null = null;

vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  getSettings: async () => ({
    budget_cycle: "monthly",
    cycle_start_day: 1,
    daily_budget: dailyBudget,
  }),
  getBudgetMode: async () => "overall",
  loadBudgets: async () => [{ category_id: null, amount: "1000.00" }],
  loadCategories: async () => [],
  expenseTotalSatang: async () => todaySpent,
}));

import { budgetAlertsFor, budgetReadingFor, dailyBudgetAlertsFor } from "./budget-alert";

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
  todaySpent = 85_000;
  dailyBudget = null;
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

describe("dailyBudgetAlertsFor", () => {
  const NOW = new Date("2026-10-18T05:00:00Z");
  const run = (over: Partial<Parameters<typeof dailyBudgetAlertsFor>[1]> = {}) =>
    dailyBudgetAlertsFor({} as SupabaseClient, {
      userId: "u1",
      amountSatang: 30_000,
      occurredAt: NOW,
      now: NOW,
      pick: 0,
      ...over,
    });

  it("scolds when today went over the limit with this spending", async () => {
    dailyBudget = "500.00";
    todaySpent = 62_000; // before this entry: ฿320
    const alerts = await run();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("฿120");
  });

  it("is quiet while under the limit", async () => {
    dailyBudget = "500.00";
    todaySpent = 45_000;
    expect(await run()).toEqual([]);
  });

  it("is quiet without a daily limit", async () => {
    todaySpent = 900_000;
    expect(await run()).toEqual([]);
  });

  it("Free gets nothing even with a limit saved (a lapsed plan)", async () => {
    plan = "free";
    dailyBudget = "500.00";
    todaySpent = 90_000;
    expect(await run()).toEqual([]);
  });

  it("an entry dated on another day is not today's business", async () => {
    dailyBudget = "500.00";
    todaySpent = 90_000;
    expect(await run({ occurredAt: new Date("2026-10-15T05:00:00Z") })).toEqual([]);
  });

  it("several entries of one message are judged together: one warning", async () => {
    dailyBudget = "500.00";
    todaySpent = 60_000; // two entries of ฿300 and ฿300 on an empty day
    const alerts = await run({ amountSatang: 60_000 });
    expect(alerts).toHaveLength(1);
  });
});

describe("budgetReadingFor: where the budget stands, for the card", () => {
  const reading = (amountSatang = 10_000) =>
    budgetReadingFor({} as SupabaseClient, {
      userId: "u1",
      type: "expense",
      categoryId: null,
      amountSatang,
      occurredAt: new Date("2026-10-15T05:00:00Z"),
      now: new Date("2026-10-18T05:00:00Z"),
    });

  it("gives the figures and a level, and the warning when this spending crossed a line", async () => {
    todaySpent = 85_000; // ฿850 of ฿1,000, the last ฿100 crossed 80%
    const r = await reading();
    expect(r?.status).toEqual({
      scopeName: null,
      spentSatang: 85_000,
      limitSatang: 100_000,
      level: "warn",
    });
    expect(r?.notice).toContain("80%");
  });

  it("says over once past the budget, with no warning when it was already over", async () => {
    todaySpent = 120_000;
    const first = await reading(30_000); // from ฿900 to ฿1,200: crossed 100%
    expect(first?.status.level).toBe("over");
    expect(first?.notice).toContain("เกินงบ");
    const later = await reading(1_000); // was already over
    expect(later?.status.level).toBe("over");
    expect(later?.notice).toBeNull();
  });

  it("Free still sees the figures but gets no warning text", async () => {
    plan = "free";
    todaySpent = 120_000;
    const r = await reading(30_000);
    expect(r?.status.level).toBe("over");
    expect(r?.notice).toBeNull();
  });

  it("is null for income and for an entry outside this cycle", async () => {
    expect(
      await budgetReadingFor({} as SupabaseClient, {
        userId: "u1",
        type: "income",
        categoryId: null,
        amountSatang: 1,
        occurredAt: new Date("2026-10-15T05:00:00Z"),
        now: new Date("2026-10-18T05:00:00Z"),
      }),
    ).toBeNull();
    expect(
      await budgetReadingFor({} as SupabaseClient, {
        userId: "u1",
        type: "expense",
        categoryId: null,
        amountSatang: 1,
        occurredAt: new Date("2026-08-15T05:00:00Z"),
        now: new Date("2026-10-18T05:00:00Z"),
      }),
    ).toBeNull();
  });
});
