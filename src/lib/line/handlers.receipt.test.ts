import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { NOT_FOUND_TEXT } from "./messages";

let tx: Record<string, unknown> | null = null;
const updateTransaction = vi.fn(async (...args: unknown[]) => ({ id: "t1", args }));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan: "plus",
    plan_expires_at: null,
  }),
  getTransaction: async () => tx,
  updateTransaction: (...a: unknown[]) => updateTransaction(...a),
}));

let dropped = 3;
const cancelSlipEntries = vi.fn(async (...args: unknown[]) => (args.length >= 0 ? dropped : 0));
vi.mock("@/lib/slip-repo", async (original) => ({
  ...(await original<typeof import("@/lib/slip-repo")>()),
  cancelSlipEntries: (...a: unknown[]) => cancelSlipEntries(...a),
}));

const USER_ID = "U" + "a".repeat(32);
const ID = "11111111-1111-1111-1111-111111111111";
const tap = (data: string): LineEvent => ({
  type: "postback",
  replyToken: "rt",
  source: { type: "user", userId: USER_ID },
  postback: { data },
});
function setup() {
  const reply = vi.fn(async (...args: unknown[]) => void args.length);
  const deps: HandlerDeps = {
    db: {} as SupabaseClient,
    reply,
    getProfile: async () => null,
    now: () => new Date("2026-10-28T08:00:00Z"),
  };
  return { deps, reply };
}
const first = (reply: ReturnType<typeof vi.fn>) =>
  ((reply.mock.calls[0] as unknown as [string, { text?: string }[]])[1][0] ?? {}).text;

beforeEach(() => {
  tx = { id: ID, title: "ถุงผ้า", amount: "7.00", status: "confirmed", slip_id: "s1" };
  dropped = 3;
  updateTransaction.mockClear();
  cancelSlipEntries.mockClear();
});

describe("the buttons on a recorded-slip card", () => {
  it("❌ deletes that one entry and says which", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap(`a=rdx&id=${ID}`), deps);
    expect(updateTransaction).toHaveBeenCalledWith(deps.db, "u1", ID, { status: "deleted" });
    expect(first(reply)).toBe("ลบแล้ว: ถุงผ้า ฿7");
  });

  it("❌ on an entry that is already gone (or not from a slip) deletes nothing", async () => {
    const { deps, reply } = setup();
    tx = { ...tx, status: "deleted" };
    await handleEvent(tap(`a=rdx&id=${ID}`), deps);
    tx = { ...tx, status: "confirmed", slip_id: null };
    await handleEvent(tap(`a=rdx&id=${ID}`), deps);
    tx = null;
    await handleEvent(tap(`a=rdx&id=${ID}`), deps);
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(first(reply)).toBe(NOT_FOUND_TEXT);
  });

  it("ยกเลิกทั้งใบ deletes every entry of the slip", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap(`a=rcx&s=${ID}`), deps);
    expect(cancelSlipEntries).toHaveBeenCalledWith(deps.db, "u1", ID);
    expect(first(reply)).toBe("ยกเลิกทั้งใบแล้ว ลบ 3 รายการ");
  });

  it("a second tap on ยกเลิกทั้งใบ finds nothing left", async () => {
    dropped = 0;
    const { deps, reply } = setup();
    await handleEvent(tap(`a=rcx&s=${ID}`), deps);
    expect(first(reply)).toBe(NOT_FOUND_TEXT);
  });

  it("made-up ids never reach the database", async () => {
    const { deps } = setup();
    await handleEvent(tap("a=rdx&id=../x"), deps);
    await handleEvent(tap("a=rcx&s=1%3Bdrop"), deps);
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(cancelSlipEntries).not.toHaveBeenCalled();
  });
});
