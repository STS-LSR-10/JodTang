import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/lib/repo";
import { handleSlipImage, type SlipDeps } from "./slips";

let plan = "ultimate";
let failOn: number | null = null;
const inserted: Record<string, unknown>[] = [];
const rolledBack: { id: string; patch: unknown }[] = [];
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
  loadCategories: async () => [
    {
      id: "c-food",
      name: "อาหาร",
      type: "expense",
      is_hidden: false,
      sort_order: 1,
      icon: "🍜",
      keywords: ["นม", "ขนม", "ข้าว"],
    },
    {
      id: "c-shop",
      name: "ชอปปิ้ง",
      type: "expense",
      is_hidden: false,
      sort_order: 2,
      icon: null,
      keywords: [],
    },
  ],
  loadMemoryFor: async () => [],
  insertTransaction: async (_d: unknown, input: Record<string, unknown>) => {
    if (failOn !== null && inserted.length === failOn) throw new Error("db down");
    inserted.push(input);
    return { id: `t${inserted.length}`, category_id: input.categoryId };
  },
  updateTransaction: async (_d: unknown, _u: unknown, id: string, patch: unknown) => {
    rolledBack.push({ id, patch });
    return { id };
  },
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
  failOn = null;
  inserted.length = 0;
  rolledBack.length = 0;
  extract.mockClear();
  insertSlip.mockClear();
  extract.mockImplementation(async () => RECEIPT);
});

describe("a slip is recorded at once", () => {
  it("Elite: a receipt becomes one confirmed entry per product line, on one card with ✏️ ❌ per row", async () => {
    const card = await run();
    expect(extract.mock.calls[0]?.[1]).toEqual({ items: true });
    expect(inserted.map((i) => [i.title, i.amountSatang, i.status, i.source, i.slipId])).toEqual([
      ["นมสด", 3000, "confirmed", "slip", "s1"],
      ["ขนมปัง", 7000, "confirmed", "slip", "s1"],
    ]);
    expect(card).toContain("จดสำเร็จ");
    expect(card).toContain("a=rdx&id=t1");
    expect(card).toContain("a=rdx&id=t2");
    expect(card).toContain("a=rcx&s=s1");
    expect(card).not.toContain("a=sc"); // nothing waits for a confirm tap any more
    const saved = (
      insertSlip.mock.calls[0] as unknown as [unknown, { data: { items: unknown[] } }]
    )[1];
    expect(saved.data.items).toHaveLength(2);
  });

  it("Elite: a line the reader missed (VAT, service) is a row of its own, so the rows add up to the total", async () => {
    extract.mockImplementation(async () => ({
      ...RECEIPT,
      amount: 110,
      items: [
        { name: "นมสด", amount: 30 },
        { name: "ขนมปัง", amount: 70 },
      ],
    }));
    await run();
    expect(inserted.map((i) => i.amountSatang)).toEqual([3000, 7000, 1000]);
    expect(inserted[2]?.title).toBe("ส่วนต่างในใบเสร็จ");
  });

  it("Pro: one confirmed entry with the total, never the product lines", async () => {
    plan = "plus";
    const card = await run();
    expect(extract.mock.calls[0]?.[1]).toEqual({ items: false });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      title: "เซเว่น",
      amountSatang: 10000,
      status: "confirmed",
    });
    expect(card).not.toContain("นมสด");
    expect(card).toContain("a=rdx&id=t1");
    expect(card).not.toContain("a=rcx"); // one row: the ❌ is enough
  });

  it("a transfer slip on Elite is one entry too", async () => {
    extract.mockImplementation(async () => ({ ...RECEIPT, kind: "transfer" }));
    await run();
    expect(inserted).toHaveLength(1);
  });

  it("puts the extra messages (budget warnings, points) after the card", async () => {
    const out = await handleSlipImage(
      {
        ...deps,
        onRecorded: async (made) => [{ type: "text", text: `after ${made.length}` }],
      },
      user,
      "m1",
    );
    expect(out).toHaveLength(2);
    expect((out[1] as unknown as { text: string }).text).toBe("after 2");
  });

  it("takes the first rows back when a later one fails, and tells the caller", async () => {
    failOn = 1;
    await expect(run()).rejects.toThrow("db down");
    expect(rolledBack).toEqual([{ id: "t1", patch: { status: "deleted" } }]);
  });
});
