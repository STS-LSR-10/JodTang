import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import {
  PDF_ALREADY_DONE_TEXT,
  PDF_CANCELLED_TEXT,
  PDF_UNAVAILABLE_TEXT,
  pdfRecordedText,
} from "./messages";

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

let confirmed = 3;
let cancelled = 3;
const confirmImport = vi.fn(async () => confirmed);
const cancelImport = vi.fn(async () => cancelled);
vi.mock("@/lib/pdf-repo", async (original) => ({
  ...(await original<typeof import("@/lib/pdf-repo")>()),
  confirmImport: (...a: unknown[]) =>
    (confirmImport as unknown as (...x: unknown[]) => unknown)(...a),
  cancelImport: (...a: unknown[]) =>
    (cancelImport as unknown as (...x: unknown[]) => unknown)(...a),
}));

const pdfCalls: unknown[][] = [];
const handlePdfMessage = vi.fn(async (...args: unknown[]) => {
  pdfCalls.push(args);
  return [{ type: "text", text: "from pdf handler" }];
});
vi.mock("./pdf", () => ({
  handlePdfMessage: (...a: unknown[]) =>
    (handlePdfMessage as unknown as (...x: unknown[]) => unknown)(...a),
}));

const USER_ID = "U" + "a".repeat(32);
const ID = "11111111-1111-1111-1111-111111111111";
const file: LineEvent = {
  type: "message",
  replyToken: "rt",
  source: { type: "user", userId: USER_ID },
  message: { type: "file", id: "m1", fileName: "a.pdf", fileSize: 1000 },
};
const tap = (data: string): LineEvent => ({
  type: "postback",
  replyToken: "rt",
  source: { type: "user", userId: USER_ID },
  postback: { data },
});

function setup(withPdf: boolean) {
  const reply = vi.fn(async () => undefined);
  const limiter = vi.fn(async (bucket: string) => ({ allowed: bucket !== "", hits: 1, limit: 3 }));
  const deps: HandlerDeps = {
    db: {} as SupabaseClient,
    reply,
    getProfile: async () => null,
    now: () => new Date("2026-10-28T08:00:00Z"),
    limit: limiter,
    ...(withPdf
      ? {
          pdf: {
            fetchPdf: async () => new Uint8Array(1),
            reader: { name: "t", read: async () => ({ entries: [] }) },
          },
        }
      : {}),
  };
  return { deps, reply, limiter };
}
const texts = (reply: ReturnType<typeof vi.fn>) =>
  ((reply.mock.calls[0] as unknown as [string, { text?: string }[]])[1] ?? []).map((m) => m.text);

beforeEach(() => {
  confirmed = 3;
  cancelled = 3;
  confirmImport.mockClear();
  cancelImport.mockClear();
  handlePdfMessage.mockClear();
  pdfCalls.length = 0;
});

describe("PDF files in handleEvent", () => {
  it("are rate limited in their own bucket and handed to the PDF handler with name and size", async () => {
    const { deps, limiter } = setup(true);
    await handleEvent(file, deps);
    expect(limiter.mock.calls[0]?.[0]).toBe("chat_pdf");
    expect(handlePdfMessage).toHaveBeenCalledTimes(1);
    expect(pdfCalls[0]?.[2]).toEqual({
      id: "m1",
      fileName: "a.pdf",
      fileSize: 1000,
    });
  });

  it("get a polite no when no AI key can read them", async () => {
    const { deps, reply } = setup(false);
    await handleEvent(file, deps);
    expect(texts(reply)[0]).toBe(PDF_UNAVAILABLE_TEXT);
    expect(handlePdfMessage).not.toHaveBeenCalled();
  });
});

describe("the check card buttons", () => {
  it("จดทั้งหมด records the whole file", async () => {
    const { deps, reply } = setup(true);
    await handleEvent(tap(`a=pdfok&i=${ID}`), deps);
    expect(confirmImport).toHaveBeenCalledWith(deps.db, "u1", ID);
    expect(texts(reply)[0]).toBe(pdfRecordedText(3));
  });

  it("a second tap (nothing left waiting) is told it is already done", async () => {
    confirmed = 0;
    const { deps, reply } = setup(true);
    await handleEvent(tap(`a=pdfok&i=${ID}`), deps);
    expect(texts(reply)[0]).toBe(PDF_ALREADY_DONE_TEXT);
  });

  it("ยกเลิก drops the whole file", async () => {
    const { deps, reply } = setup(true);
    await handleEvent(tap(`a=pdfx&i=${ID}`), deps);
    expect(cancelImport).toHaveBeenCalledWith(deps.db, "u1", ID);
    expect(texts(reply)[0]).toBe(PDF_CANCELLED_TEXT);
  });

  it("a made-up id is refused before touching the database", async () => {
    const { deps } = setup(true);
    await handleEvent(tap("a=pdfok&i=../etc"), deps);
    expect(confirmImport).not.toHaveBeenCalled();
  });
});
