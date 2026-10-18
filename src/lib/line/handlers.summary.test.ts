import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";

type Row = {
  occurred_at: string;
  type: string;
  amount: string;
  categories: { name: string } | null;
};
let rows: Row[] = [];
let lastRange: { from: string; to: string } | null = null;

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan: "free",
    plan_expires_at: null,
  }),
  getSettings: async () => ({ budget_cycle: "monthly", cycle_start_day: 1 }),
}));
vi.mock("@/lib/summary-load", () => ({
  loadSummaryTransactions: async (_db: unknown, _user: string, from: Date, to: Date) => {
    lastRange = { from: from.toISOString(), to: to.toISOString() };
    return rows
      .filter((r) => r.occurred_at >= lastRange!.from && r.occurred_at < lastRange!.to)
      .map((r) => ({
        occurredAt: new Date(r.occurred_at),
        type: r.type as "income" | "expense",
        amountSatang: Math.round(Number(r.amount) * 100),
        categoryName: r.categories?.name ?? null,
      }));
  },
}));

const NOW = new Date("2026-10-17T08:00:00Z"); // 15:00 on 17 Oct in Bangkok
const row = (at: string, type: string, amount: string, cat: string | null): Row => ({
  occurred_at: at,
  type,
  amount,
  categories: cat ? { name: cat } : null,
});

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
    now: () => NOW,
    limit: async () => ({ allowed: true, hits: 1, limit: 30 }),
  };
  return { deps, reply };
}
const sent = (reply: ReturnType<typeof setup>["reply"]) =>
  (reply.mock.calls[0]?.[1] ?? []) as { type: string; text?: string }[];

beforeEach(() => {
  rows = [];
  lastRange = null;
  delete process.env.APP_BASE_URL;
});

describe("สรุปวันนี้", () => {
  it("is a flex card with today's totals and top categories", async () => {
    rows = [
      row("2026-10-17T02:00:00Z", "expense", "120.00", "อาหาร"),
      row("2026-10-17T05:00:00Z", "expense", "60.00", "เดินทาง"),
      row("2026-10-17T03:00:00Z", "income", "500.00", null),
      row("2026-10-16T05:00:00Z", "expense", "999.00", "อาหาร"), // yesterday: not counted
    ];
    const { deps, reply } = setup();
    await handleEvent(say("สรุปวันนี้"), deps);
    const msg = sent(reply)[0]!;
    const json = JSON.stringify(msg);
    expect(msg.type).toBe("flex");
    expect(json).toContain("สรุปวันนี้");
    expect(json).toContain("17 ต.ค. 2569");
    expect(json).toContain("+฿500");
    expect(json).toContain("-฿180");
    expect(json).toContain("฿320"); // net
    expect(json).toContain("อาหาร");
    expect(json).toContain("จดไว้ 3 รายการ");
  });

  it("does not compare a single day with yesterday", async () => {
    rows = [row("2026-10-17T02:00:00Z", "expense", "120.00", "อาหาร")];
    const { deps, reply } = setup();
    await handleEvent(say("สรุปวันนี้"), deps);
    expect(JSON.stringify(sent(reply)[0])).not.toMatch(/เพิ่มขึ้น|ลดลง/);
  });

  it("says so in plain text when nothing was recorded", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("สรุปวันนี้"), deps);
    const msg = sent(reply)[0]!;
    expect(msg.type).toBe("text");
    expect(msg.text).toContain("ยังไม่มีรายการเลย");
  });
});

describe("สรุปเดือนนี้", () => {
  it("is a flex card for the budget cycle, compared with the month before", async () => {
    rows = [
      row("2026-10-05T05:00:00Z", "expense", "300.00", "อาหาร"),
      row("2026-10-06T05:00:00Z", "income", "1000.00", null),
      row("2026-09-10T05:00:00Z", "expense", "200.00", "อาหาร"), // previous month
    ];
    const { deps, reply } = setup();
    await handleEvent(say("สรุปเดือนนี้"), deps);
    const json = JSON.stringify(sent(reply)[0]);
    expect(json).toContain("สรุปเดือนนี้");
    expect(json).toContain("-฿300");
    expect(json).toContain("+฿1,000");
    expect(json).toContain("เพิ่มขึ้น 50% จากเดือนก่อน");
    // it loaded this month and the one before in one go
    expect(lastRange?.from).toBe("2026-08-31T17:00:00.000Z"); // 1 Sep, Bangkok
    expect(lastRange?.to).toBe("2026-10-31T17:00:00.000Z"); // 1 Nov, Bangkok
  });

  it("has a details button only when the app URL is https", async () => {
    rows = [row("2026-10-05T05:00:00Z", "expense", "300.00", "อาหาร")];
    process.env.APP_BASE_URL = "https://app.example.com/";
    const a = setup();
    await handleEvent(say("สรุปเดือนนี้"), a.deps);
    expect(JSON.stringify(sent(a.reply)[0])).toContain("https://app.example.com/summary");

    process.env.APP_BASE_URL = "http://localhost:3000";
    const b = setup();
    await handleEvent(say("สรุปเดือนนี้"), b.deps);
    expect(JSON.stringify(sent(b.reply)[0])).not.toContain("ดูรายละเอียด");
  });

  it("empty month is a plain text answer", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("สรุปเดือนนี้"), deps);
    expect(sent(reply)[0]?.text).toContain("ยังไม่มีรายการเลย");
  });
});
