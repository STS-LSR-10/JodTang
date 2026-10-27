import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { NOT_FOUND_TEXT, SPLIT_LOCKED_TEXT, SPLIT_UNAVAILABLE_TEXT } from "./messages";

let plan = "ultimate";
let pending: { id: string; status: string; slip_id: string | null; amount: string } | null = null;
let items = [
  { name: "นมสด", amountSatang: 3000 },
  { name: "ขนมปัง", amountSatang: 7000 },
];
let claimable = true;
let insertFails = false;

const inserted: Record<string, unknown>[] = [];
const claim = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () =>
  claimable ? { id: "t1", type: "expense" } : null,
);
const release = vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
const update = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({}));

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan,
    plan_expires_at: null,
  }),
  getTransaction: async () => pending,
  claimPendingTransaction: (...a: unknown[]) => claim(...a),
  releasePendingTransaction: (...a: unknown[]) => release(...a),
  updateTransaction: (...a: unknown[]) => update(...a),
  loadCategories: async () => [],
  loadMemoryFor: async () => [],
  insertTransaction: async (_db: unknown, input: Record<string, unknown>) => {
    if (insertFails && inserted.length === 1) throw new Error("db down");
    inserted.push(input);
    return { id: `n${inserted.length}`, category_id: null, amount: "1.00" };
  },
}));
vi.mock("@/lib/slip-repo", async (original) => ({
  ...(await original<typeof import("@/lib/slip-repo")>()),
  getSlipItems: async () => items,
}));

const tap = (): LineEvent => ({
  type: "postback",
  replyToken: "rt",
  source: { type: "user", userId: "U" + "a".repeat(32) },
  postback: { data: "a=sp&id=t1" },
});

function setup() {
  const reply = vi.fn<(token: string, messages: unknown[]) => Promise<undefined>>(
    async () => undefined,
  );
  const deps: HandlerDeps = {
    db: {} as SupabaseClient,
    reply,
    getProfile: async () => null,
    now: () => new Date("2026-10-17T08:00:00Z"),
    limit: async () => ({ allowed: true, hits: 1, limit: 30 }),
  };
  return { deps, reply };
}
const firstText = (reply: ReturnType<typeof setup>["reply"]) =>
  (reply.mock.calls[0]?.[1][0] as { text?: string } | undefined)?.text;

beforeEach(() => {
  plan = "ultimate";
  pending = { id: "t1", status: "pending_confirm", slip_id: "s1", amount: "100.00" };
  items = [
    { name: "นมสด", amountSatang: 3000 },
    { name: "ขนมปัง", amountSatang: 7000 },
  ];
  claimable = true;
  insertFails = false;
  inserted.length = 0;
  for (const f of [claim, release, update]) f.mockClear();
});

describe("splitting a receipt (a=sp)", () => {
  it("creates one confirmed entry per line, tied to the slip, and replaces the pending one", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap(), deps);
    expect(inserted.map((i) => [i.title, i.amountSatang, i.status, i.slipId])).toEqual([
      ["นมสด", 3000, "confirmed", "s1"],
      ["ขนมปัง", 7000, "confirmed", "s1"],
    ]);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(firstText(reply)).toContain("แยกเป็น 2 รายการแล้ว");
  });

  it("adds a remainder entry when the lines come to less than the total", async () => {
    items = [
      { name: "นมสด", amountSatang: 3000 },
      { name: "ขนมปัง", amountSatang: 6000 },
    ];
    const { deps } = setup();
    await handleEvent(tap(), deps);
    expect(inserted.map((i) => i.amountSatang)).toEqual([3000, 6000, 1000]);
  });

  it("is for Elite only and creates nothing otherwise", async () => {
    plan = "plus";
    const { deps, reply } = setup();
    await handleEvent(tap(), deps);
    expect(firstText(reply)).toBe(SPLIT_LOCKED_TEXT);
    expect(claim).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("refuses when the lines exceed the total", async () => {
    items = [
      { name: "a", amountSatang: 9000 },
      { name: "b", amountSatang: 9000 },
    ];
    const { deps, reply } = setup();
    await handleEvent(tap(), deps);
    expect(firstText(reply)).toBe(SPLIT_UNAVAILABLE_TEXT);
    expect(inserted).toHaveLength(0);
  });

  it("a second tap finds nothing to split", async () => {
    pending = { id: "t1", status: "deleted", slip_id: "s1", amount: "100.00" };
    const { deps, reply } = setup();
    await handleEvent(tap(), deps);
    expect(firstText(reply)).toBe(NOT_FOUND_TEXT);
    expect(inserted).toHaveLength(0);
  });

  it("only the tap that wins the claim creates entries (double tap)", async () => {
    claimable = false;
    const { deps, reply } = setup();
    await handleEvent(tap(), deps);
    expect(firstText(reply)).toBe(NOT_FOUND_TEXT);
    expect(inserted).toHaveLength(0);
  });

  it("puts the receipt back and removes partial entries when something fails", async () => {
    insertFails = true;
    const { deps } = setup();
    await expect(handleEvent(tap(), deps)).rejects.toThrow("db down");
    expect(release).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.anything(), "u1", "n1", { status: "deleted" });
  });
});
