import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import {
  BACKDATE_BAD_DATE_TEXT,
  BACKDATE_LOCKED_TEXT,
  BACKDATE_PICKER_LOCKED_TEXT,
  MULTI_ENTRY_LOCKED_TEXT,
  TAGS_LOCKED_TEXT,
} from "./messages";

let plan = "free";
const insertTransaction = vi.fn(async () => ({
  id: "t1",
  type: "expense",
  title: "กาแฟ",
  amount: "45.00",
  category_id: null,
  occurred_at: "2026-10-16T05:00:00Z",
  status: "confirmed",
  slip_id: null,
}));

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan,
    plan_expires_at: null,
  }),
  getSettings: async () => ({}),
  loadCategories: async () => [],
  loadMemoryFor: async () => new Map(),
  insertTransaction: (...args: unknown[]) =>
    (insertTransaction as unknown as (...a: unknown[]) => unknown)(...args),
  periodSummary: async () => ({ incomeSatang: 0, expenseSatang: 0 }),
  categoryTotalSatang: async () => 0,
  txAmountSatang: () => 4500,
}));

const message = (t: string): LineEvent => ({
  type: "message",
  replyToken: "rt",
  source: { type: "user", userId: "U" + "a".repeat(32) },
  message: { type: "text", id: "1", text: t },
});

function setup() {
  const reply = vi.fn(async () => undefined);
  const deps: HandlerDeps = {
    db: {} as SupabaseClient,
    reply,
    getProfile: async () => null,
    now: () => new Date("2026-10-17T08:00:00Z"),
    limit: async () => ({ allowed: true, hits: 1, limit: 30 }),
  };
  return { deps, reply };
}

const repliedText = (reply: ReturnType<typeof vi.fn>) =>
  ((reply.mock.calls[0] as unknown as [string, { text?: string }[]])[1][0] ?? {}).text;

beforeEach(() => {
  insertTransaction.mockClear();
  plan = "free";
});

describe("backdating in text messages", () => {
  it.each([
    "เมื่อวาน กาแฟ 45",
    "12/10 ค่าไฟ 1200",
    "จ่ายค่าทุเรียน เมื่อวาน 300",
    "ค่าไฟ 12/10 1200",
  ])("is locked for Free: %s", async (input) => {
    const { deps, reply } = setup();
    await handleEvent(message(input), deps);
    expect(repliedText(reply)).toBe(BACKDATE_LOCKED_TEXT);
    expect(insertTransaction).not.toHaveBeenCalled();
  });

  it("still lets Free record without a date or with วันนี้", async () => {
    const { deps, reply } = setup();
    await handleEvent(message("กาแฟ 45"), deps);
    expect(insertTransaction).toHaveBeenCalledTimes(1);
    expect(repliedText(reply)).not.toBe(BACKDATE_LOCKED_TEXT);
  });

  it.each(["plus", "ultimate"])("is allowed on %s", async (p) => {
    plan = p;
    const { deps } = setup();
    await handleEvent(message("เมื่อวาน กาแฟ 45"), deps);
    expect(insertTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("several entries in one message", () => {
  const many = "ข้าวเช้า 50\nกาแฟ 45\nวินมอไซค์ 30";

  it("is locked for Free and records nothing", async () => {
    const { deps, reply } = setup();
    await handleEvent(message(many), deps);
    expect(repliedText(reply)).toBe(MULTI_ENTRY_LOCKED_TEXT);
    expect(insertTransaction).not.toHaveBeenCalled();
  });

  it("does not treat a thousands separator as a second entry", async () => {
    const { deps, reply } = setup();
    await handleEvent(message("เงินเดือน 20,000"), deps);
    expect(repliedText(reply)).not.toBe(MULTI_ENTRY_LOCKED_TEXT);
    expect(insertTransaction).toHaveBeenCalledTimes(1);
  });

  it.each(["plus", "ultimate"])("records every line on %s", async (p) => {
    plan = p;
    const { deps } = setup();
    await handleEvent(message(many), deps);
    expect(insertTransaction).toHaveBeenCalledTimes(3);
  });
});

describe("#tags in text messages", () => {
  it("are locked for Free and record nothing", async () => {
    const { deps, reply } = setup();
    await handleEvent(message("หมูกระทะ 500 #ปาร์ตี้"), deps);
    expect(repliedText(reply)).toBe(TAGS_LOCKED_TEXT);
    expect(insertTransaction).not.toHaveBeenCalled();
  });

  it.each(["plus", "ultimate"])("are saved with the entry on %s", async (p) => {
    plan = p;
    const { deps } = setup();
    await handleEvent(message("หมูกระทะ 500 #ปาร์ตี้"), deps);
    expect(insertTransaction).toHaveBeenCalledTimes(1);
    const input = (insertTransaction.mock.calls[0] as unknown as [unknown, { tags: string[] }])[1];
    expect(input.tags).toEqual(["ปาร์ตี้"]);
  });
});

describe("the 📅 จดย้อนหลัง button", () => {
  const tap = (data: string, params?: { date?: string }): LineEvent => ({
    type: "postback",
    replyToken: "rt",
    source: { type: "user", userId: "U" + "a".repeat(32) },
    postback: { data, ...(params ? { params } : {}) },
  });
  const first = (reply: ReturnType<typeof vi.fn>) =>
    (reply.mock.calls[0] as unknown as [string, Record<string, unknown>[]])[1][0] as {
      text?: string;
      quickReply?: { items: { action: Record<string, string> }[] };
    };

  it("Free gets the upsell and no calendar", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap("a=bd"), deps);
    expect(first(reply).text).toBe(BACKDATE_PICKER_LOCKED_TEXT);
    expect(first(reply).quickReply).toBeUndefined();
  });

  it.each(["plus", "ultimate"])("%s gets the calendar", async (p) => {
    plan = p;
    const { deps, reply } = setup();
    await handleEvent(tap("a=bd"), deps);
    expect(first(reply).quickReply?.items[0]?.action.type).toBe("datetimepicker");
  });

  it("a chosen day opens the keyboard with DD/MM/YYYY already typed", async () => {
    plan = "plus";
    const { deps, reply } = setup();
    await handleEvent(tap("a=bdp", { date: "2026-10-12" }), deps);
    const a = first(reply).quickReply?.items[0]?.action;
    expect(a?.fillInText).toBe("12/10/2026 ");
    expect(first(reply).text).toContain("12 ต.ค. 2569");
  });

  it.each([
    ["a day in the future", "2026-10-20"],
    ["more than a year back", "2024-01-01"],
    ["not a real date", "2026-02-31"],
    ["garbage", "yesterday"],
  ])("rejects %s", async (_label, date) => {
    plan = "plus";
    const { deps, reply } = setup();
    await handleEvent(tap("a=bdp", { date }), deps);
    expect(first(reply).text).toBe(BACKDATE_BAD_DATE_TEXT);
  });

  it("a missing date is rejected too", async () => {
    plan = "plus";
    const { deps, reply } = setup();
    await handleEvent(tap("a=bdp"), deps);
    expect(first(reply).text).toBe(BACKDATE_BAD_DATE_TEXT);
  });

  it("Free cannot get through by sending the calendar's postback directly", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap("a=bdp", { date: "2026-10-12" }), deps);
    expect(first(reply).text).toBe(BACKDATE_PICKER_LOCKED_TEXT);
  });

  it("the keyboard button itself (a=bdk) is silent", async () => {
    plan = "plus";
    const { deps, reply } = setup();
    await handleEvent(tap("a=bdk"), deps);
    expect(
      (reply.mock.calls[0] as unknown as [string, unknown[]] | undefined)?.[1] ?? [],
    ).toHaveLength(0);
  });
});
