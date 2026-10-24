import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";

const TX_ID = "11111111-1111-1111-1111-111111111111";
let edited: Record<string, unknown> | null = null;
let existing: Record<string, unknown> | null = null;
const sinceSeen: Date[] = [];

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan: "free",
    plan_expires_at: null,
  }),
  getSettings: async () => ({
    budget_cycle: "monthly",
    cycle_start_day: 1,
    confirm_style: "full",
    daily_reminder_enabled: false,
    daily_reminder_time: null,
    weekly_summary_enabled: false,
    monthly_summary_enabled: false,
  }),
  loadCategories: async () => [],
  getTransaction: async () => existing,
  getRecentlyEdited: async (_db: unknown, _user: string, since: Date) => {
    sinceSeen.push(since);
    return edited;
  },
}));
vi.mock("@/lib/wallet-repo", async (original) => ({
  ...(await original<typeof import("@/lib/wallet-repo")>()),
  listWallets: async () => [],
}));

const say = (t: string): LineEvent => ({
  type: "message",
  replyToken: "rt",
  source: { type: "user", userId: "U" + "a".repeat(32) },
  message: { type: "text", id: "1", text: t },
});
const tap = (data: string): LineEvent => ({
  type: "postback",
  replyToken: "rt",
  source: { type: "user", userId: "U" + "a".repeat(32) },
  postback: { data },
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

beforeEach(() => {
  process.env.NEXT_PUBLIC_LIFF_ID = "1234-abcd";
  delete process.env.APP_BASE_URL;
  sinceSeen.length = 0;
  existing = {
    id: TX_ID,
    type: "expense",
    title: "กาแฟ",
    amount: "30.00",
    category_id: null,
    occurred_at: "2026-10-17T01:00:00Z",
    status: "confirmed",
    slip_id: null,
  };
  edited = { ...existing, title: "กาแฟเย็น", amount: "45.00", account_id: null };
});

describe("editing an entry from the chat", () => {
  it("the old text-only 'แก้' button now answers with the link to the editor", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap(`a=edit&id=${TX_ID}`), deps);
    const sent = JSON.stringify(reply.mock.calls[0]?.[1]);
    expect(sent).toContain(`https://liff.line.me/1234-abcd/transactions?edit=${TX_ID}`);
  });

  it("after a save in the editor, 'แก้ไขเสร็จแล้ว' answers with the 'แก้ไขรายการสำเร็จ' card of that entry", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("แก้ไขเสร็จแล้ว"), deps);
    const msg = reply.mock.calls[0]?.[1][0] as { type: string };
    const json = JSON.stringify(msg);
    expect(msg.type).toBe("flex");
    expect(json).toContain("แก้ไขรายการสำเร็จ");
    expect(json).toContain("กาแฟเย็น");
    expect(json).toContain("฿45");
    // the 'แก้' chip on that card opens the editor again
    expect(json).toContain(`/transactions?edit=${TX_ID}`);
    // only an edit from the last quarter of an hour counts
    expect(deps.now().getTime() - (sinceSeen[0]?.getTime() ?? 0)).toBe(15 * 60_000);
  });

  it("with nothing edited recently it stays quiet", async () => {
    edited = null;
    const { deps, reply } = setup();
    await handleEvent(say("แก้ไขเสร็จแล้ว"), deps);
    expect(JSON.stringify(reply.mock.calls[0]?.[1] ?? [])).toBe("[]");
  });
});
