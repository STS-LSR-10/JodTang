import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SLIP_FAIR_USE_TEXT, SLIP_LOCKED_TEXT, SLIP_QUOTA_TEXT } from "@/lib/line/messages";
import type { UserRow } from "@/lib/repo";
import { handleSlipImage, type SlipDeps } from "./slips";

let plan = "free";
let used = 0;
let usedWeek = 0;
vi.mock("@/lib/upsell", () => ({ claimUpsellCard: async () => false }));
vi.mock("@/lib/slip-repo", async (original) => ({
  ...(await original<typeof import("@/lib/slip-repo")>()),
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
  countSlipsThisMonth: async () => used,
  countSlipsThisWeek: async () => usedWeek,
}));

const fetchImage = vi.fn(async () => {
  throw new Error("stop after the quota check");
});

const deps: SlipDeps = {
  db: {} as SupabaseClient,
  now: () => new Date("2026-10-17T08:00:00Z"),
  fetchImage,
  ocr: { name: "t", extract: async () => ({ kind: "not_slip" }) } as unknown as SlipDeps["ocr"],
};
const user = { id: "u1" } as UserRow;

const run = async () => {
  const reply = await handleSlipImage(deps, user, "m1");
  return (reply[0] as { text?: string }).text;
};

beforeEach(() => {
  plan = "free";
  used = 0;
  usedWeek = 0;
  fetchImage.mockClear();
});

describe("slip quota by plan", () => {
  it("Free reads the 1st, 2nd and 3rd photo of the week", async () => {
    for (usedWeek = 0; usedWeek < 3; usedWeek++) {
      fetchImage.mockClear();
      await expect(run()).rejects.toThrow("stop after the quota check");
      expect(fetchImage).toHaveBeenCalledTimes(1);
    }
  });

  it("Free with 3 photos already this week is pitched an upgrade, and nothing is downloaded", async () => {
    usedWeek = 3;
    expect(await run()).toBe(SLIP_LOCKED_TEXT);
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it("Pro is stopped at 30 slips a month", async () => {
    plan = "plus";
    used = 30;
    expect(await run()).toBe(SLIP_QUOTA_TEXT);
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it("Pro can still read the 30th slip", async () => {
    plan = "plus";
    used = 29;
    await expect(run()).rejects.toThrow("stop after the quota check");
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it("Elite reads far more than Pro, up to the fair-use ceiling", async () => {
    plan = "ultimate";
    used = 299;
    await expect(run()).rejects.toThrow("stop after the quota check");
    used = 300;
    expect(await run()).toBe(SLIP_FAIR_USE_TEXT(300));
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });
});
