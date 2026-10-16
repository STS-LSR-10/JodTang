import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { TOO_MANY_MESSAGES_TEXT } from "./messages";

/** A database that fails loudly if the handler touches it: the limiter must stop things first. */
const untouchableDb = new Proxy(
  {},
  {
    get() {
      throw new Error("database must not be used when rate limited");
    },
  },
) as unknown as SupabaseClient;

function setup(hits: number, limit = 30) {
  const reply = vi.fn(async () => undefined);
  const limiter = vi.fn(async (bucket: string, subject: string) => {
    void bucket;
    void subject;
    return { allowed: false, hits, limit };
  });
  const deps: HandlerDeps = {
    db: untouchableDb,
    reply,
    getProfile: async () => null,
    now: () => new Date("2026-10-16T08:00:00Z"),
    limit: limiter,
  };
  return { deps, reply, limiter };
}

const text = (t: string): LineEvent => ({
  type: "message",
  replyToken: "rt",
  source: { type: "user", userId: "U" + "a".repeat(32) },
  message: { type: "text", id: "1", text: t },
});

describe("handleEvent rate limiting", () => {
  it("answers once on the first excess hit, without touching the database", async () => {
    const { deps, reply } = setup(31);
    await handleEvent(text("กาแฟ 30"), deps);
    expect(reply).toHaveBeenCalledTimes(1);
    expect((reply.mock.calls[0] as unknown as [string, { text: string }[]])[1][0]?.text).toBe(
      TOO_MANY_MESSAGES_TEXT,
    );
  });

  it("stays silent on later excess hits", async () => {
    const { deps, reply } = setup(40);
    await handleEvent(text("กาแฟ 30"), deps);
    expect(reply).not.toHaveBeenCalled();
  });

  it("uses a stricter bucket for images and a separate one for button taps", async () => {
    const image = setup(99);
    await handleEvent({ ...text(""), message: { type: "image", id: "9" } }, image.deps);
    expect(image.limiter.mock.calls[0]?.[0]).toBe("chat_image");

    const tap = setup(99);
    await handleEvent(
      {
        type: "postback",
        replyToken: "rt",
        source: { type: "user", userId: "U1" },
        postback: { data: "a=del&id=x" },
      },
      tap.deps,
    );
    expect(tap.limiter.mock.calls[0]?.[0]).toBe("postback");
  });

  it("text messages use the chat bucket", async () => {
    const { deps, limiter } = setup(99);
    await handleEvent(text("x"), deps);
    expect(limiter.mock.calls[0]?.[0]).toBe("chat");
  });

  it("ignores group chats before limiting", async () => {
    const { deps, limiter, reply } = setup(99);
    await handleEvent({ ...text("hi"), source: { type: "group", userId: "U1" } }, deps);
    expect(limiter).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });
});
