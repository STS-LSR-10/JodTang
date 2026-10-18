import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";

let style = "short";
const CATEGORIES = [
  {
    id: "cat",
    user_id: "u1",
    type: "expense",
    name: "ค่าอาหารแมว",
    icon: "🐱",
    color: "#7C3AED",
    keywords: ["ทราย"],
    sort_order: 1,
    is_hidden: false,
  },
  {
    id: "food",
    user_id: null,
    type: "expense",
    name: "อาหาร",
    icon: "utensils",
    color: "#0F766E",
    keywords: ["ข้าว"],
    sort_order: 2,
    is_hidden: false,
  },
];

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan: "plus",
    plan_expires_at: null,
  }),
  getSettings: async () => ({
    confirm_style: style,
    budget_cycle: "monthly",
    cycle_start_day: 1,
  }),
  loadCategories: async () => CATEGORIES,
  loadMemoryFor: async () => [],
  insertTransaction: async (_db: unknown, input: Record<string, unknown>) => ({
    id: "t1",
    status: input.status,
    type: input.type,
    title: input.title,
    amount: "50.00",
    occurred_at: "2026-10-17T08:00:00Z",
    category_id: input.categoryId,
    slip_id: null,
  }),
  categoryTotalSatang: async () => 5000,
}));

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
    now: () => new Date("2026-10-17T08:00:00Z"),
    limit: async () => ({ allowed: true, hits: 1, limit: 30 }),
  };
  return { deps, reply };
}
const firstJson = (reply: ReturnType<typeof setup>["reply"]) =>
  JSON.stringify(reply.mock.calls[0]?.[1][0] ?? {});

beforeEach(() => {
  style = "short";
});

describe("the category in the saved-entry card", () => {
  it("shows the emoji of a custom category (short card)", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("ทราย 50"), deps);
    expect(firstJson(reply)).toContain("🐱 ค่าอาหารแมว");
  });

  it("shows the emoji on the full card too", async () => {
    style = "full";
    const { deps, reply } = setup();
    await handleEvent(say("ทราย 50"), deps);
    expect(firstJson(reply)).toContain("🐱 ค่าอาหารแมว");
  });

  it("a system category (an icon name, not an emoji) shows its plain name", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("ข้าว 50"), deps);
    const json = firstJson(reply);
    expect(json).toContain("อาหาร");
    expect(json).not.toContain("utensils");
  });
});
