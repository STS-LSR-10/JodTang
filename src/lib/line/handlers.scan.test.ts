import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { SCAN_ASK_TEXT, SCAN_LOCKED_TEXT } from "./messages";

let plan = "plus";
let expires: string | null = null;
const cleared: unknown[][] = [];
const upsells: unknown[][] = [];

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan,
    plan_expires_at: expires,
  }),
}));
vi.mock("@/lib/photo-repo", async (original) => ({
  ...(await original<typeof import("@/lib/photo-repo")>()),
  clearPhotoWait: async (...a: unknown[]) => {
    cleared.push(a);
  },
}));
vi.mock("./upsell-reply", async (original) => ({
  ...(await original<typeof import("./upsell-reply")>()),
  upsellReply: async (...a: unknown[]) => {
    upsells.push(a);
    return [{ type: "text", text: "UPSELL" }];
  },
}));

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
type Sent = { text?: string; quickReply?: { items: { action: { type: string } }[] } };
const first = (reply: ReturnType<typeof setup>["reply"]) =>
  (reply.mock.calls[0]?.[1][0] ?? {}) as Sent;

beforeEach(() => {
  plan = "plus";
  expires = null;
  cleared.length = 0;
  upsells.length = 0;
});

describe("the Rich Menu's สแกนบิล button (a=scan)", () => {
  it.each(["plus", "ultimate"])("%s gets the camera and album buttons", async (p) => {
    plan = p;
    const { deps, reply } = setup();
    await handleEvent(tap("a=scan"), deps);
    const msg = first(reply);
    expect(msg.text).toBe(SCAN_ASK_TEXT);
    expect(msg.quickReply?.items.map((i) => i.action.type)).toEqual(["camera", "cameraRoll"]);
    expect(upsells).toHaveLength(0);
  });

  it("clears a photo wait left by a recording, so the picture is read as a bill", async () => {
    const { deps } = setup();
    await handleEvent(tap("a=scan"), deps);
    expect(cleared).toHaveLength(1);
  });

  it("Free gets the upgrade pitch and no camera, and nothing is cleared", async () => {
    plan = "free";
    const { deps, reply } = setup();
    await handleEvent(tap("a=scan"), deps);
    expect(first(reply).text).toBe("UPSELL");
    expect(first(reply).quickReply).toBeUndefined();
    expect(upsells[0]?.[3]).toBe("slip");
    expect(upsells[0]?.[4]).toBe(SCAN_LOCKED_TEXT);
    expect(cleared).toHaveLength(0);
  });

  it("a paid plan that has run out counts as Free", async () => {
    plan = "plus";
    expires = "2026-10-01T00:00:00Z"; // before "now"
    const { deps, reply } = setup();
    await handleEvent(tap("a=scan"), deps);
    expect(first(reply).text).toBe("UPSELL");
  });
});
