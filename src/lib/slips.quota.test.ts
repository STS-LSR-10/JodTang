import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SLIP_LOCKED_TEXT, SLIP_QUOTA_TEXT } from "@/lib/line/messages";
import type { UserRow } from "@/lib/repo";
import { handleSlipImage, type SlipDeps } from "./slips";

let plan = "free";
let used = 0;
vi.mock("@/lib/slip-repo", async (original) => ({
  ...(await original<typeof import("@/lib/slip-repo")>()),
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
  countSlipsThisMonth: async () => used,
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
  fetchImage.mockClear();
});

describe("slip quota by plan", () => {
  it("Free is told slips need Professional, and nothing is downloaded", async () => {
    expect(await run()).toBe(SLIP_LOCKED_TEXT);
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it("Professional is stopped at 5 slips a month", async () => {
    plan = "plus";
    used = 5;
    expect(await run()).toBe(SLIP_QUOTA_TEXT);
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it("Professional can still read the 5th slip", async () => {
    plan = "plus";
    used = 4;
    await expect(run()).rejects.toThrow("stop after the quota check");
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it("Ultimate has no limit", async () => {
    plan = "ultimate";
    used = 500;
    await expect(run()).rejects.toThrow("stop after the quota check");
  });
});
