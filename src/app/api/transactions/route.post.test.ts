import { beforeEach, describe, expect, it, vi } from "vitest";

const pushes: unknown[] = [];
let budgetAlerts: string[] = [];
let dailyAlerts: string[] = [];

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  limitOr429: async () => null,
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/plan-server", () => ({ loadMemoryIfAllowed: async () => [] }));
vi.mock("@/lib/points", () => ({ awardActivity: async () => undefined }));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  loadCategories: async () => [],
  insertTransaction: async () => ({ id: "t1", occurred_at: "2026-10-17T05:00:00Z" }),
}));
vi.mock("@/lib/budget-alert", () => ({
  budgetAlertsFor: async () => [...budgetAlerts],
  dailyBudgetAlertsFor: async () => [...dailyAlerts],
}));
vi.mock("@/lib/line/client", () => ({
  createLineClient: () => ({ push: async (...a: unknown[]) => pushes.push(a) }),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("https://app.example.com/api/transactions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  pushes.length = 0;
  budgetAlerts = [];
  dailyAlerts = [];
});

describe("POST /api/transactions: budget alerts", () => {
  it("come back in the response (budget and daily limit) and are never pushed to the chat", async () => {
    budgetAlerts = ["⚠️ หมวดอาหารเกินงบแล้ว"];
    dailyAlerts = ["⚠️ วันนี้เกินงบรายวันแล้ว"];
    const res = await post({ type: "expense", title: "ข้าว", amount: "100" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: "t1",
      alerts: ["⚠️ หมวดอาหารเกินงบแล้ว", "⚠️ วันนี้เกินงบรายวันแล้ว"],
    });
    expect(pushes).toHaveLength(0);
  });

  it("an income entry gets no daily-limit alert, and no alerts means an empty list", async () => {
    dailyAlerts = ["ไม่ควรโผล่"];
    const res = await post({ type: "income", title: "เงินเดือน", amount: "100" });
    expect(await res.json()).toEqual({ id: "t1", alerts: [] });
  });
});
