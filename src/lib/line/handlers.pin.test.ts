import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";

const cancelled: (Date | null)[] = [];

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan: "plus",
    plan_expires_at: null,
  }),
}));
vi.mock("@/lib/pin-repo", () => ({
  setResetRequested: async (_db: unknown, _u: string, at: Date | null) => {
    cancelled.push(at);
  },
}));

const tap = (data: string): LineEvent => ({
  type: "postback",
  replyToken: "rt",
  source: { type: "user", userId: "U" + "a".repeat(32) },
  postback: { data },
});

beforeEach(() => {
  cancelled.length = 0;
});

describe("the cancel button under the 'PIN removal requested' notice", () => {
  it("clears the request and says the PIN still works", async () => {
    const reply = vi.fn<(token: string, messages: unknown[]) => Promise<undefined>>(
      async () => undefined,
    );
    const deps: HandlerDeps = {
      db: {} as SupabaseClient,
      reply,
      getProfile: async () => null,
      now: () => new Date("2026-10-18T05:00:00Z"),
      limit: async () => ({ allowed: true, hits: 1, limit: 60 }),
    };
    await handleEvent(tap("a=pinx"), deps);
    expect(cancelled).toEqual([null]);
    expect(JSON.stringify(reply.mock.calls[0]?.[1])).toContain("ยกเลิกคำขอลบ PIN แล้ว");
  });
});
