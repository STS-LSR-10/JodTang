import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";

const cat = (over: Record<string, unknown>) => ({
  user_id: null,
  type: "expense",
  keywords: [],
  sort_order: 0,
  is_hidden: false,
  icon: null,
  color: null,
  ...over,
});
const CATEGORIES = [
  cat({ id: "travel", name: "เดินทาง", keywords: ["น้ำมัน"] }),
  cat({ id: "food", name: "อาหาร", keywords: ["กาแฟ"] }),
  cat({ id: "side", name: "งานพิเศษ", type: "income", keywords: ["ฟรีแลนซ์"] }),
  cat({ id: "other", name: "อื่นๆ", sort_order: 99 }),
];

const inserted: Record<string, unknown>[] = [];
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan: "free",
    plan_expires_at: null,
  }),
  getSettings: async () => ({ confirm_style: "off" }),
  loadCategories: async () => CATEGORIES,
  loadMemoryFor: async () => [],
  insertTransaction: async (_db: unknown, input: Record<string, unknown>) => {
    inserted.push(input);
    return { id: "t1", status: input.status, title: input.title, amount: "1.00" };
  },
}));

const event = (over: Pick<LineEvent, "type"> & Partial<LineEvent>): LineEvent => ({
  replyToken: "rt",
  source: { type: "user", userId: "U" + "a".repeat(32) },
  ...over,
});
const textEvent = (t: string) =>
  event({ type: "message", message: { type: "text", id: "1", text: t } });

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
  inserted.length = 0;
});

describe("a message that starts with a category name", () => {
  it("is filed under that category, even when no keyword matches", async () => {
    const { deps } = setup();
    await handleEvent(textEvent("เดินทาง 120"), deps);
    expect(inserted[0]).toMatchObject({
      type: "expense",
      categoryId: "travel",
      status: "confirmed",
    });
  });

  it("takes the type from the category, so an income category is recorded as income", async () => {
    const { deps } = setup();
    await handleEvent(textEvent("งานพิเศษ 3000"), deps);
    expect(inserted[0]).toMatchObject({ type: "income", categoryId: "side", status: "confirmed" });
  });

  it("keeps the words after the name as the title", async () => {
    const { deps } = setup();
    await handleEvent(textEvent("เดินทาง วิน 30"), deps);
    expect(inserted[0]).toMatchObject({ categoryId: "travel", title: "เดินทาง วิน" });
  });

  it("still asks before saving a million-baht entry", async () => {
    const { deps } = setup();
    await handleEvent(textEvent("เดินทาง 2000000"), deps);
    expect(inserted[0]).toMatchObject({ status: "pending_confirm" });
  });

  it("leaves ordinary messages to the keyword rules", async () => {
    const { deps } = setup();
    await handleEvent(textEvent("กาแฟ 45"), deps);
    expect(inserted[0]).toMatchObject({ categoryId: "food" });
  });
});

describe("compose quick replies", () => {
  it("a=cp answers with the categories of the chosen type", async () => {
    const { deps, reply } = setup();
    await handleEvent(event({ type: "postback", postback: { data: "a=cp&t=income" } }), deps);
    const sent = reply.mock.calls[0]?.[1][0] as { quickReply?: unknown } | undefined;
    const labels = (sent?.quickReply as { items: { action: { label: string } }[] }).items.map(
      (i) => i.action.label,
    );
    expect(labels).toEqual(["งานพิเศษ"]);
  });

  it("tapping a category (a=cc) is silent", async () => {
    const { deps, reply } = setup();
    await handleEvent(event({ type: "postback", postback: { data: "a=cc" } }), deps);
    expect(reply.mock.calls[0]?.[1] ?? []).toHaveLength(0);
  });
});
