import { beforeEach, describe, expect, it, vi } from "vitest";

const FOOD = "11111111-1111-4111-8111-111111111111";
let plan = "plus";
const calls: { from: string; to: string }[] = [];

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    rpc: async (_name: string, args: { p_from: string; p_to: string }) => {
      calls.push({ from: args.p_from, to: args.p_to });
      // the month index tells the amount: 100, 200, … for the category asked about
      return {
        data: [
          { category_id: FOOD, total: String(calls.length * 100) },
          { category_id: "other", total: "999" },
        ],
        error: null,
      };
    },
  }),
}));

import { GET } from "./route";

const get = (id: string | null = FOOD) =>
  GET(new Request(`https://x/api/budgets/history${id ? `?categoryId=${id}` : ""}`));

beforeEach(() => {
  plan = "plus";
  calls.length = 0;
});

describe("GET /api/budgets/history", () => {
  it("six months of one category, and their average; each month ends where the next begins", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      series: { start: string; totalSatang: number }[];
      averageSatang: number;
    };
    expect(body.series).toHaveLength(6);
    expect(body.series.every((p) => p.totalSatang > 0)).toBe(true);
    expect(calls).toHaveLength(6);
    const sorted = [...calls].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 0; i < 5; i++) expect(sorted[i]?.to).toBe(sorted[i + 1]?.from);
    expect(body.averageSatang).toBe(
      Math.round(body.series.reduce((s, p) => s + p.totalSatang, 0) / 6),
    );
  });

  it("is for Professional and above, and needs a category id", async () => {
    plan = "free";
    expect((await get()).status).toBe(403);
    expect(calls).toHaveLength(0);
    plan = "plus";
    expect((await get("nope")).status).toBe(400);
    expect((await get(null)).status).toBe(400);
  });
});
