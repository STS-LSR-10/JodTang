import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { BACKDATE_LOCKED_TEXT } from "./messages";

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
  it.each(["เมื่อวาน กาแฟ 45", "12/10 ค่าไฟ 1200"])("is locked for Free: %s", async (input) => {
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
