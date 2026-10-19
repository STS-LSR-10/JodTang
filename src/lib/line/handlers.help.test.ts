import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";

let plan = "free";

vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
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
  getSettings: async () => ({
    confirm_style: "full",
    budget_cycle: "monthly",
    cycle_start_day: 1,
  }),
}));

const source = { type: "user" as const, userId: "U" + "a".repeat(32) };
const say = (t: string): LineEvent => ({
  type: "message",
  replyToken: "rt",
  source,
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
    now: () => new Date("2026-10-18T05:00:00Z"),
    limit: async () => ({ allowed: true, hits: 1, limit: 30 }),
  };
  return { deps, reply };
}
const first = (reply: ReturnType<typeof setup>["reply"]) =>
  (reply.mock.calls[0]?.[1] ?? [])[0] as {
    type: string;
    contents?: { type: string };
    text?: string;
    quickReply?: unknown;
  };

beforeEach(() => {
  plan = "free";
});

describe("the help cards in the chat", () => {
  it.each(["ช่วยเหลือ", "เมนู", "help", "?"])("%s opens the help carousel", async (word) => {
    const { deps, reply } = setup();
    await handleEvent(say(word), deps);
    const m = first(reply);
    expect(m.type).toBe("flex");
    expect(m.contents?.type).toBe("carousel");
  });

  it("the carousel follows the person's plan", async () => {
    plan = "ultimate";
    const { deps, reply } = setup();
    await handleEvent(say("ช่วยเหลือ"), deps);
    expect(JSON.stringify(first(reply))).toContain("Ultimate ✓");
  });

  it("a new friend gets the welcome card", async () => {
    const { deps, reply } = setup();
    await handleEvent({ type: "follow", replyToken: "rt", source }, deps);
    const m = first(reply);
    expect(m.type).toBe("flex");
    expect(JSON.stringify(m)).toContain("สวัสดี! เราคือจดตังค์");
  });

  it("a message the bot cannot read gets the short text plus a button to the guide", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("สวัสดีครับ"), deps);
    const m = first(reply);
    expect(m.type).toBe("text");
    expect(m.text).toContain("ยังไม่เข้าใจ");
    expect(JSON.stringify(m.quickReply)).toContain('"text":"ช่วยเหลือ"');
  });
});
