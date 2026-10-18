import { beforeEach, describe, expect, it, vi } from "vitest";

let plan = "free";
const rpc = vi.fn(async (name: string) => ({
  data:
    name === "analytics_series"
      ? []
      : [{ category_id: null, name: "อาหาร", color: null, total: "10.00" }],
  error: null,
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  getSettings: async () => ({ budget_cycle: "monthly", cycle_start_day: 1 }),
}));

import { GET } from "./route";

const get = () => GET(new Request("https://app.example.com/api/analytics?view=month&scope=cycle"));

beforeEach(() => {
  plan = "free";
  rpc.mockClear();
});

describe("GET /api/analytics", () => {
  it("is for Professional and above: Free gets a 403 with the upgrade hint and no data", async () => {
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ upgrade: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["plus", "ultimate"])("%s gets the series and the category split", async (p) => {
    plan = p;
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { series: unknown[]; categories: { name: string }[] };
    expect(body.series).toHaveLength(6);
    expect(body.categories[0]?.name).toBe("อาหาร");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
