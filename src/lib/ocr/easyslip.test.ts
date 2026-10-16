import { describe, expect, it, vi } from "vitest";
import { createEasySlipProvider } from "./easyslip";
import { sanitizeSlip } from "./slip-schema";

const image = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };
const NOW = new Date("2026-10-15T08:00:00Z");

const okBody = {
  success: true,
  data: {
    isDuplicate: false,
    rawSlip: {
      payload: "0041000600000101030140225",
      transRef: "2026101409300012345",
      date: "2026-10-14T09:30:00+07:00",
      amount: { amount: 1500, local: { amount: 0, currency: "" } },
      sender: {
        bank: { id: "004", name: "ธนาคารกสิกรไทย", short: "KBANK" },
        account: { name: { th: "นาย ก" } },
      },
      receiver: {
        bank: { id: "014", name: "ธนาคารไทยพาณิชย์", short: "SCB" },
        account: { name: { th: "น.ส. สมหญิง ใจดี" } },
      },
    },
  },
  message: "Bank slip verified successfully",
};

function fakeFetch(status: number, body: unknown) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("easyslip", () => {
  it("posts the image as multipart with a bearer token", async () => {
    const f = fakeFetch(200, okBody);
    await createEasySlipProvider({ apiKey: "k" }, f).extract(image);

    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.easyslip.com/v2/verify/bank");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("image")).toBeInstanceOf(Blob);
  });

  it("maps the verified slip into the common shape (and through sanitizeSlip)", async () => {
    const raw = await createEasySlipProvider({ apiKey: "k" }, fakeFetch(200, okBody)).extract(
      image,
    );
    const r = sanitizeSlip(raw, NOW);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.amountSatang).toBe(150_000);
    expect(r.data.payeeName).toBe("น.ส. สมหญิง ใจดี");
    expect(r.data.payeeBank).toBe("ธนาคารไทยพาณิชย์");
    expect(r.data.payerBank).toBe("ธนาคารกสิกรไทย");
    expect(r.data.reference).toBe("2026101409300012345");
    expect(r.data.paidAt?.toISOString()).toBe("2026-10-14T02:30:00.000Z");
    expect(r.data.payeeAccountLast4).toBeNull();
  });

  it("accepts a plain numeric amount", async () => {
    const body = structuredClone(okBody);
    (body.data.rawSlip as { amount: unknown }).amount = 45.5;
    const raw = await createEasySlipProvider({ apiKey: "k" }, fakeFetch(200, body)).extract(image);
    expect((raw as { amount: number }).amount).toBe(45.5);
  });

  it.each([
    [404, "SLIP_NOT_FOUND"],
    [403, "QUOTA_EXCEEDED"],
    [401, "INVALID_API_KEY"],
  ])("throws status and code only on %i %s", async (status, code) => {
    const f = fakeFetch(status, { success: false, error: { code, message: "private detail 123" } });
    const err = await createEasySlipProvider({ apiKey: "k" }, f)
      .extract(image)
      .catch((e: Error) => e);
    expect((err as Error).message).toBe(`easyslip failed: ${status} ${code}`);
  });

  it("throws on a non-JSON reply", async () => {
    const f = vi.fn(async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
    await expect(createEasySlipProvider({ apiKey: "k" }, f).extract(image)).rejects.toThrow(
      /easyslip failed: 502/,
    );
  });

  it("skips images over 4MB without calling the API", async () => {
    const f = fakeFetch(200, okBody);
    const big = { bytes: new Uint8Array(4 * 1024 * 1024 + 1), mimeType: "image/png" };
    await expect(createEasySlipProvider({ apiKey: "k" }, f).extract(big)).rejects.toThrow(/4MB/);
    expect(f).not.toHaveBeenCalled();
  });
});
