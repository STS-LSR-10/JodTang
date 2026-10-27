import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/lib/repo";
import { handleSlipImage, type SlipDeps } from "./slips";

let plan = "ultimate";
const insertSlip = vi.fn<(...a: unknown[]) => Promise<{ id: string }>>(async () => ({ id: "s1" }));

vi.mock("@/lib/slip-repo", async (original) => ({
  ...(await original<typeof import("@/lib/slip-repo")>()),
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
  countSlipsThisMonth: async () => 0,
  findSlipByHash: async () => null,
  findSlipByRef: async () => null,
  insertSlip: (...a: unknown[]) => insertSlip(...a),
}));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  loadCategories: async () => [],
  loadMemoryFor: async () => [],
  insertTransaction: async () => ({ id: "t1" }),
}));

const RECEIPT = {
  is_slip: true,
  kind: "receipt",
  amount: 100,
  paid_at: "2026-10-16T10:00:00+07:00",
  payee_name: "เซเว่น",
  items: [
    { name: "นมสด", amount: 30 },
    { name: "ขนมปัง", amount: 70 },
  ],
};

const extract = vi.fn<(image: unknown, options?: { items?: boolean }) => Promise<unknown>>(
  async () => RECEIPT,
);
const db = {
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({}) }) },
} as unknown as SupabaseClient;
const deps = {
  db,
  now: () => new Date("2026-10-17T08:00:00Z"),
  fetchImage: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/jpeg" }),
  ocr: { name: "t", extract },
} as unknown as SlipDeps;
const user = { id: "u1" } as UserRow;
const run = async () => JSON.stringify(await handleSlipImage(deps, user, "m1"));

beforeEach(() => {
  plan = "ultimate";
  extract.mockClear();
  insertSlip.mockClear();
  extract.mockImplementation(async () => RECEIPT);
});

describe("receipt product lines", () => {
  it("are requested for Elite, shown on the card, and saved with the slip", async () => {
    const card = await run();
    expect(extract.mock.calls[0]?.[1]).toEqual({ items: true });
    expect(card).toContain("แยก 2 รายการ");
    const saved = (
      insertSlip.mock.calls[0] as unknown as [unknown, { data: { items: unknown[] } }]
    )[1];
    expect(saved.data.items).toHaveLength(2);
  });

  it("are not requested for Pro, and never offered even if a reader sent them", async () => {
    plan = "plus";
    const card = await run();
    expect(extract.mock.calls[0]?.[1]).toEqual({ items: false });
    expect(card).not.toContain("a=sp");
    expect(card).not.toContain("นมสด");
  });

  it("a transfer slip on Elite has no split button", async () => {
    extract.mockImplementation(async () => ({ ...RECEIPT, kind: "transfer" }));
    expect(await run()).not.toContain("a=sp");
  });
});
