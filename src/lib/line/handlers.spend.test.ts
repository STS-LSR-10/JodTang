import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";

let spend: { name: string; amountSatang: number }[] = [];
let recent: Record<string, unknown>[] = [];
let spendRange: { from: string; to: string } | null = null;
let plan = "free";

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan,
    plan_expires_at: null,
  }),
  getSettings: async () => ({ budget_cycle: "monthly", cycle_start_day: 25 }),
}));
vi.mock("@/lib/summary-load", async (original) => ({
  ...(await original<typeof import("@/lib/summary-load")>()),
  loadCategorySpend: async (_db: unknown, _user: string, range: { from: Date; to: Date }) => {
    spendRange = { from: range.from.toISOString(), to: range.to.toISOString() };
    return spend;
  },
}));
vi.mock("@/lib/search", async (original) => ({
  ...(await original<typeof import("@/lib/search")>()),
  loadSearchItems: async (_db: unknown, _user: string, target: unknown, limit: number) => {
    lastSearch = { target, limit };
    return recent;
  },
}));
let lastSearch: { target: unknown; limit: number } | null = null;

const say = (t: string): LineEvent => ({
  type: "message",
  replyToken: "rt",
  source: { type: "user", userId: "U" + "a".repeat(32) },
  message: { type: "text", id: "1", text: t },
});

function setup() {
  const reply = vi.fn<(token: string, messages: unknown[]) => Promise<undefined>>(
    async () => undefined,
  );
  const deps: HandlerDeps = {
    db: {} as SupabaseClient,
    reply,
    getProfile: async () => null,
    now: () => new Date("2026-10-27T08:00:00Z"), // 27 Oct in Bangkok, after the 25th
    limit: async () => ({ allowed: true, hits: 1, limit: 30 }),
  };
  return { deps, reply };
}
const first = (reply: ReturnType<typeof setup>["reply"]) =>
  (reply.mock.calls[0]?.[1][0] ?? {}) as { type?: string; text?: string };

const tx = (title: string, amountSatang: number) => ({
  id: title,
  type: "expense",
  title,
  amountSatang,
  occurredAt: "2026-10-26T05:00:00Z",
  categoryName: "อาหาร",
});

beforeEach(() => {
  spend = [];
  recent = [];
  spendRange = null;
  lastSearch = null;
  plan = "free";
  delete process.env.NEXT_PUBLIC_LIFF_ID;
  delete process.env.APP_BASE_URL;
});

describe("ล่าสุด", () => {
  it.each(["free", "plus", "ultimate"])(
    "is for every plan (%s): a card of the newest five",
    async (p) => {
      plan = p;
      recent = [tx("กาแฟ", 4500), tx("ข้าว", 6000)];
      const { deps, reply } = setup();
      await handleEvent(say("ล่าสุด"), deps);
      expect(first(reply).type).toBe("flex");
      expect(JSON.stringify(first(reply))).toContain("กาแฟ");
      expect(lastSearch).toEqual({ target: { q: null, tag: null }, limit: 5 });
    },
  );

  it("says so in text when nothing has been recorded", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("รายการล่าสุด"), deps);
    expect(first(reply).type).toBe("text");
    expect(first(reply).text).toContain("ยังไม่มีรายการเลย");
  });

  it("links to the list through the LIFF link when there is one", async () => {
    process.env.NEXT_PUBLIC_LIFF_ID = "1234-abcd";
    recent = [tx("กาแฟ", 4500)];
    const { deps, reply } = setup();
    await handleEvent(say("ล่าสุด"), deps);
    expect(JSON.stringify(first(reply))).toContain("https://liff.line.me/1234-abcd/transactions");
  });
});

describe("สรุปหมวด", () => {
  it("is a card of this budget cycle's spend by category, for every plan", async () => {
    spend = [
      { name: "อาหาร", amountSatang: 30_000 },
      { name: "เดินทาง", amountSatang: 10_000 },
    ];
    const { deps, reply } = setup();
    await handleEvent(say("สรุปหมวด"), deps);
    const json = JSON.stringify(first(reply));
    expect(first(reply).type).toBe("flex");
    expect(json).toContain("฿300 · 75%");
    expect(json).toContain("฿400"); // total
    // cycle starting on the 25th: 25 Oct .. 24 Nov, Bangkok
    expect(spendRange).toEqual({
      from: "2026-10-24T17:00:00.000Z",
      to: "2026-11-24T17:00:00.000Z",
    });
  });

  it("answers in text when there is no spending", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("สรุปตามหมวด"), deps);
    expect(first(reply).type).toBe("text");
    expect(first(reply).text).toContain("ยังไม่มีรายจ่าย");
  });
});
