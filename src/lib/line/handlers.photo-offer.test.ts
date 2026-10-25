import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { PHOTO_OFFER_TEXT } from "./messages";

let style = "short";
let photoPrompt: boolean | undefined = true;
let plan = "plus";
let photosUsed = 0;
const waits: unknown[][] = [];

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
    confirm_style: style,
    budget_cycle: "monthly",
    cycle_start_day: 1,
    photo_prompt: photoPrompt,
  }),
  loadCategories: async () => [],
  loadMemoryFor: async () => [],
  insertTransaction: async (_db: unknown, input: Record<string, unknown>) => ({
    id: `t-${String(input.title)}`,
    status: input.status,
    type: input.type,
    title: input.title,
    amount: "50.00",
    occurred_at: "2026-10-17T08:00:00Z",
    category_id: null,
    slip_id: null,
  }),
  categoryTotalSatang: async () => 5000,
}));
vi.mock("@/lib/photo-repo", async (original) => ({
  ...(await original<typeof import("@/lib/photo-repo")>()),
  countPhotosThisMonth: async () => photosUsed,
  startPhotoWait: async (...a: unknown[]) => {
    waits.push(a);
  },
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
type Sent = { text?: string; quickReply?: { items: { action: { type: string } }[] } };
const sent = (reply: ReturnType<typeof setup>["reply"]) =>
  (reply.mock.calls[0]?.[1] ?? []) as Sent[];

beforeEach(() => {
  style = "short";
  photoPrompt = true;
  plan = "plus";
  photosUsed = 0;
  waits.length = 0;
});

describe("the photo offer after a save (Pro and above)", () => {
  it("comes last with camera and album buttons, and the next image belongs to that entry", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("ข้าว 50"), deps);
    const last = sent(reply).at(-1);
    expect(last?.text).toBe(PHOTO_OFFER_TEXT);
    expect(last?.quickReply?.items.map((i) => i.action.type)).toEqual(["camera", "cameraRoll"]);
    expect(waits).toHaveLength(1);
    expect(waits[0]?.[2]).toBe("t-ข้าว"); // the entry
    expect(waits[0]?.[4]).toBe(3); // a short window, so a slip sent later is still a slip
  });

  it("is not sent to Free, nor once the month's 100 photos are used", async () => {
    plan = "free";
    const a = setup();
    await handleEvent(say("ข้าว 50"), a.deps);
    expect(sent(a.reply).some((m) => m.text === PHOTO_OFFER_TEXT)).toBe(false);
    plan = "plus";
    photosUsed = 100;
    const b = setup();
    await handleEvent(say("ข้าว 50"), b.deps);
    expect(sent(b.reply).some((m) => m.text === PHOTO_OFFER_TEXT)).toBe(false);
    expect(waits).toHaveLength(0);
  });

  it("is not sent when the person turned it off, or has cards turned off", async () => {
    photoPrompt = false;
    const a = setup();
    await handleEvent(say("ข้าว 50"), a.deps);
    expect(waits).toHaveLength(0);
    photoPrompt = true;
    style = "off";
    const b = setup();
    await handleEvent(say("ข้าว 50"), b.deps);
    expect(waits).toHaveLength(0);
  });

  it("is not sent for several entries in one message", async () => {
    const { deps, reply } = setup();
    await handleEvent(say("กาแฟ 45\nข้าว 50"), deps);
    expect(sent(reply).some((m) => m.text === PHOTO_OFFER_TEXT)).toBe(false);
    expect(waits).toHaveLength(0);
  });
});
