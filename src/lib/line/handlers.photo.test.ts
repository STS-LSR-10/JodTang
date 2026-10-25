import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { PHOTO_ASK_REPLACE_TEXT, PHOTO_ASK_TEXT, PHOTO_LOCKED_TEXT } from "./messages";

let wait: { tx_id: string; expired: boolean } | null = null;
let blocked: { type: string; text: string }[] | null = null;
let existing: { photo_path: string | null } | null = { photo_path: null };

const handlePhotoImage = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => [
  { type: "text", text: "photo ok" },
]);
const handleSlipImage = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => [
  { type: "text", text: "slip ok" },
]);
const startPhotoWait = vi.fn<(...a: unknown[]) => Promise<undefined>>(async () => undefined);

vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  ensureUser: async () => ({
    id: "u1",
    line_user_id: "U1",
    display_name: null,
    plan: "plus",
    plan_expires_at: null,
  }),
  getTransaction: async () => ({ id: "t1", status: "confirmed" }),
}));
vi.mock("@/lib/photo-repo", () => ({
  getLivePhotoWait: async () => wait,
  getPhotoTx: async () => existing,
  startPhotoWait: (...a: unknown[]) => startPhotoWait(...a),
  PHOTO_OFFER_WAIT_MINUTES: 3,
}));
vi.mock("@/lib/photos", () => ({
  photoBlockedReply: async () => blocked,
  handlePhotoImage: (...a: unknown[]) => handlePhotoImage(...a),
}));
vi.mock("@/lib/slips", () => ({
  handleSlipImage: (...a: unknown[]) => handleSlipImage(...a),
}));

const source = { type: "user", userId: "U" + "a".repeat(32) };
const image: LineEvent = {
  type: "message",
  replyToken: "rt",
  source,
  message: { type: "image", id: "img1" },
};
const tap = (data: string): LineEvent => ({
  type: "postback",
  replyToken: "rt",
  source,
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
    slip: {
      fetchImage: async () => ({ bytes: new Uint8Array(1), mimeType: "image/jpeg" }),
      ocr: { name: "t", extract: async () => ({}) } as never,
    },
  };
  return { deps, reply };
}

const firstMessage = (reply: ReturnType<typeof setup>["reply"]) =>
  reply.mock.calls[0]?.[1][0] as {
    text?: string;
    quickReply?: { items: { action: { type: string } }[] };
  };

beforeEach(() => {
  wait = null;
  blocked = null;
  existing = { photo_path: null };
  for (const f of [handlePhotoImage, handleSlipImage, startPhotoWait]) f.mockClear();
});

describe("an image in the chat", () => {
  it("is read as a slip when no photo is being waited for", async () => {
    const { deps, reply } = setup();
    await handleEvent(image, deps);
    expect(handleSlipImage).toHaveBeenCalledTimes(1);
    expect(handlePhotoImage).not.toHaveBeenCalled();
    expect(firstMessage(reply).text).toBe("slip ok");
  });

  it("is attached to the entry after the person tapped แนบรูป", async () => {
    wait = { tx_id: "t1", expired: false };
    const { deps, reply } = setup();
    await handleEvent(image, deps);
    expect(handlePhotoImage).toHaveBeenCalledTimes(1);
    expect((handlePhotoImage.mock.calls[0] as unknown[])[3]).toEqual(wait);
    expect(handleSlipImage).not.toHaveBeenCalled();
    expect(firstMessage(reply).text).toBe("photo ok");
  });
});

describe("the แนบรูป button (a=ph)", () => {
  it("starts waiting and offers camera and album", async () => {
    const { deps, reply } = setup();
    await handleEvent(tap("a=ph&id=t1"), deps);
    expect(startPhotoWait).toHaveBeenCalledTimes(1);
    const m = firstMessage(reply);
    expect(m.text).toBe(PHOTO_ASK_TEXT);
    expect(m.quickReply?.items.map((i) => i.action.type)).toEqual(["camera", "cameraRoll"]);
  });

  it("says the new photo replaces the old one", async () => {
    existing = { photo_path: "u1/photo-t1.jpg" };
    const { deps, reply } = setup();
    await handleEvent(tap("a=ph&id=t1"), deps);
    expect(firstMessage(reply).text).toBe(PHOTO_ASK_REPLACE_TEXT);
  });

  it("is turned away (and starts nothing) when the plan or the cap says no", async () => {
    blocked = [{ type: "text", text: PHOTO_LOCKED_TEXT }];
    const { deps, reply } = setup();
    await handleEvent(tap("a=ph&id=t1"), deps);
    expect(startPhotoWait).not.toHaveBeenCalled();
    expect(firstMessage(reply).text).toBe(PHOTO_LOCKED_TEXT);
  });
});
