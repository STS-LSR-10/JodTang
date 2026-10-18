import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextStructurer } from "@/lib/ai/text-structurer";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { SMART_CANCELLED_TEXT, SMART_PREFACE_TEXT } from "./messages";

let plan = "ultimate";
let tx: { id: string; status: string; type: string } | null = null;

const inserted: Record<string, unknown>[] = [];
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
  getSettings: async () => ({ confirm_style: "off" }),
  loadCategories: async () => [
    {
      id: "food",
      user_id: null,
      type: "expense",
      name: "อาหาร",
      keywords: ["ข้าว"],
      sort_order: 1,
      is_hidden: false,
    },
    {
      id: "other",
      user_id: null,
      type: "expense",
      name: "อื่นๆ",
      keywords: [],
      sort_order: 99,
      is_hidden: false,
    },
  ],
  loadMemoryFor: async () => [],
  getTransaction: async () => tx,
  updateTransaction: (...a: unknown[]) => update(...a),
  insertTransaction: async (_db: unknown, input: Record<string, unknown>) => {
    inserted.push(input);
    return { id: `t${inserted.length}`, status: input.status, title: input.title, amount: "1.00" };
  },
}));

const SENTENCE = "ไปกินข้าวกับแฟนมา จ่ายไป 850 บาท เอาออกจากกระเป๋าเงินสดนะ";
const reply = {
  entries: [{ type: "expense", title: "กินข้าวกับแฟน", amount: 850, category: "อาหาร" }],
};
const structure = vi.fn<TextStructurer["structure"]>(async () => reply);

const textEvent = (t: string): LineEvent => ({
  type: "message",
  replyToken: "rt",
  source: { type: "user", userId: "U" + "a".repeat(32) },
  message: { type: "text", id: "1", text: t },
});

function setup(withStructurer = true, limitAllowed = true) {
  const sent = vi.fn<(token: string, messages: unknown[]) => Promise<undefined>>(
    async () => undefined,
  );
  const deps: HandlerDeps = {
    db: {} as SupabaseClient,
    reply: sent,
    getProfile: async () => null,
    now: () => new Date("2026-10-17T08:00:00Z"),
    limit: async (bucket) => ({
      allowed: bucket !== "smart_day" || limitAllowed,
      hits: 1,
      limit: 60,
    }),
    ...(withStructurer ? { structurer: { name: "t", structure } } : {}),
  };
  return { deps, sent };
}
const messages = (sent: ReturnType<typeof setup>["sent"]) =>
  (sent.mock.calls[0]?.[1] ?? []) as { type: string; text?: string }[];

beforeEach(() => {
  plan = "ultimate";
  tx = null;
  inserted.length = 0;
  structure.mockClear();
  structure.mockImplementation(async () => reply);
  update.mockClear();
});

describe("a long sentence", () => {
  it("is read by the AI on Ultimate and saved as PENDING with a check card", async () => {
    const { deps, sent } = setup();
    await handleEvent(textEvent(SENTENCE), deps);
    expect(structure).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      type: "expense",
      title: "กินข้าวกับแฟน",
      amountSatang: 85_000,
      categoryId: "food",
      status: "pending_confirm",
      rawText: SENTENCE,
    });
    const out = messages(sent);
    expect(out[0]?.text).toBe(SMART_PREFACE_TEXT);
    expect(JSON.stringify(out[1])).toContain("a=sc&id=t1");
    expect(JSON.stringify(out[1])).toContain("a=ax&id=t1");
  });

  it("is not sent to the AI on Professional (the rules handle it as before)", async () => {
    plan = "plus";
    const { deps } = setup();
    await handleEvent(textEvent(SENTENCE), deps);
    expect(structure).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({ status: "confirmed", amountSatang: 85_000 });
  });

  it("falls back to the rules when the AI fails", async () => {
    structure.mockImplementation(async () => {
      throw new Error("down");
    });
    const { deps } = setup();
    await handleEvent(textEvent(SENTENCE), deps);
    expect(inserted[0]).toMatchObject({ status: "confirmed", amountSatang: 85_000 });
  });

  it("falls back to the rules when the AI answers with an amount that is not in the text", async () => {
    structure.mockImplementation(async () => ({
      entries: [{ type: "expense", title: "x", amount: 999 }],
    }));
    const { deps } = setup();
    await handleEvent(textEvent(SENTENCE), deps);
    expect(inserted[0]).toMatchObject({ status: "confirmed", amountSatang: 85_000 });
  });

  it("falls back to the rules when the daily ceiling is reached", async () => {
    const { deps } = setup(true, false);
    await handleEvent(textEvent(SENTENCE), deps);
    expect(structure).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({ status: "confirmed" });
  });

  it("works without any AI configured", async () => {
    const { deps } = setup(false);
    await handleEvent(textEvent(SENTENCE), deps);
    expect(inserted[0]).toMatchObject({ status: "confirmed", amountSatang: 85_000 });
  });
});

describe("a short clear message", () => {
  it("never reaches the AI, even on Ultimate, and is saved straight away", async () => {
    const { deps } = setup();
    await handleEvent(textEvent("กาแฟ 30"), deps);
    expect(structure).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({ status: "confirmed", amountSatang: 3000 });
  });
});

describe("cancelling an AI card (a=ax)", () => {
  it("deletes the pending entry and says so", async () => {
    tx = { id: "t1", status: "pending_confirm", type: "expense" };
    const { deps, sent } = setup();
    await handleEvent(
      {
        type: "postback",
        replyToken: "rt",
        source: { type: "user", userId: "U" + "a".repeat(32) },
        postback: { data: "a=ax&id=t1" },
      },
      deps,
    );
    expect(update).toHaveBeenCalledWith(expect.anything(), "u1", "t1", { status: "deleted" });
    expect(messages(sent)[0]?.text).toBe(SMART_CANCELLED_TEXT);
  });
});
