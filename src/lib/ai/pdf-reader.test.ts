import { describe, expect, it, vi } from "vitest";
import {
  buildPdfReader,
  createPdfReader,
  MAX_PDF_ENTRIES,
  pdfPrompt,
  sanitizePdfEntries,
} from "./pdf-reader";

const now = new Date("2026-10-28T05:00:00Z");
const categories = [
  { name: "อาหาร", type: "expense" as const },
  { name: "เงินเดือน", type: "income" as const },
];

describe("sanitizePdfEntries", () => {
  it("keeps valid entries with type, satang, date and one of the person's categories", () => {
    const out = sanitizePdfEntries(
      {
        entries: [
          {
            type: "expense",
            title: "ข้าวมันไก่",
            amount: 65,
            category: "อาหาร",
            date: "2026-10-20",
          },
          {
            type: "income",
            title: "เงินเดือน",
            amount: "25,000.50",
            category: "เงินเดือน",
            date: "2026-10-25",
          },
        ],
      },
      { now, categories },
    );
    expect(out.truncated).toBe(false);
    expect(out.undated).toBe(0);
    expect(out.entries.map((e) => [e.type, e.title, e.amountSatang, e.categoryName])).toEqual([
      ["expense", "ข้าวมันไก่", 6500, "อาหาร"],
      ["income", "เงินเดือน", 2_500_050, "เงินเดือน"],
    ]);
  });

  it("drops entries with no usable amount or title, and categories that are not the person's", () => {
    const out = sanitizePdfEntries(
      {
        entries: [
          { type: "expense", title: "ศูนย์", amount: 0 },
          { type: "expense", title: "ติดลบ", amount: -5 },
          { type: "expense", title: "ไม่มีเลข", amount: "abc" },
          { type: "expense", title: "   ", amount: 10 },
          { type: "expense", title: "ผิดประเภทหมวด", amount: 10, category: "เงินเดือน" },
          { type: "transfer", title: "ประเภทแปลก", amount: 10 },
        ],
      },
      { now, categories },
    );
    expect(out.entries.map((e) => e.title)).toEqual(["ผิดประเภทหมวด"]);
    expect(out.entries[0]?.categoryName).toBeNull();
  });

  it("dates an entry today when its date is missing, in the future or from the Buddhist era slip", () => {
    const out = sanitizePdfEntries(
      {
        entries: [
          { type: "expense", title: "ไม่มีวัน", amount: 10, date: null },
          { type: "expense", title: "อนาคต", amount: 10, date: "2026-12-01" },
          { type: "expense", title: "พ.ศ.", amount: 10, date: "2569-10-01" },
        ],
      },
      { now, categories },
    );
    expect(out.undated).toBe(2);
    expect(out.entries[0]?.occurredAt).toEqual(now);
    expect(out.entries[1]?.occurredAt).toEqual(now);
    expect(out.entries[2]?.occurredAt.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("keeps at most 30 and says so", () => {
    const entries = Array.from({ length: MAX_PDF_ENTRIES + 5 }, (_, i) => ({
      type: "expense",
      title: `รายการ ${i}`,
      amount: 10 + i,
      date: "2026-10-01",
    }));
    const out = sanitizePdfEntries({ entries }, { now, categories });
    expect(out.entries).toHaveLength(MAX_PDF_ENTRIES);
    expect(out.truncated).toBe(true);
  });

  it("treats a malformed reply as no entries", () => {
    expect(sanitizePdfEntries("hello", { now, categories })).toEqual({
      entries: [],
      truncated: false,
      undated: 0,
    });
    expect(sanitizePdfEntries({ entries: "x" }, { now, categories }).entries).toEqual([]);
  });
});

describe("pdfPrompt", () => {
  it("names the person's categories and treats the document as untrusted", () => {
    const p = pdfPrompt({ today: "2026-10-28", categories });
    expect(p).toContain("Expense: อาหาร");
    expect(p).toContain("Income: เงินเดือน");
    expect(p).toContain("2026-10-28");
    expect(p).toContain("untrusted");
  });
});

function fakeFetch(body: unknown) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
const request = { pdf: new Uint8Array([37, 80, 68, 70]), today: "2026-10-28", categories };
const sentBody = (f: ReturnType<typeof fakeFetch>) =>
  JSON.parse(
    String(
      (f.mock.calls[0] as unknown[])[1] &&
        ((f.mock.calls[0] as [string, RequestInit])[1].body as string),
    ),
  );

describe("createPdfReader", () => {
  it("sends the PDF to Gemini as inline data and parses the JSON reply", async () => {
    const f = fakeFetch({
      candidates: [
        {
          content: { parts: [{ text: '{"entries":[{"type":"expense","title":"x","amount":1}]}' }] },
        },
      ],
    });
    const out = await createPdfReader({ provider: "gemini", apiKey: "k" }, f).read(request);
    expect(out).toEqual({ entries: [{ type: "expense", title: "x", amount: 1 }] });
    const parts = sentBody(f).contents[0].parts;
    expect(parts[1].inline_data.mime_type).toBe("application/pdf");
    expect(parts[1].inline_data.data).toBe(Buffer.from(request.pdf).toString("base64"));
  });

  it("sends the PDF to Claude as a document and takes the tool call", async () => {
    const f = fakeFetch({ content: [{ type: "tool_use", input: { entries: [] } }] });
    const out = await createPdfReader({ provider: "anthropic", apiKey: "k" }, f).read(request);
    expect(out).toEqual({ entries: [] });
    const content = sentBody(f).messages[0].content;
    expect(content[0].type).toBe("document");
    expect(content[0].source.media_type).toBe("application/pdf");
    expect(sentBody(f).tool_choice).toEqual({ type: "tool", name: "record_entries" });
  });

  it("sends the PDF to OpenAI as a file", async () => {
    const f = fakeFetch({ choices: [{ message: { content: '{"entries":[]}' } }] });
    const out = await createPdfReader({ provider: "openai", apiKey: "k" }, f).read(request);
    expect(out).toEqual({ entries: [] });
    const part = sentBody(f).messages[0].content[1];
    expect(part.type).toBe("file");
    expect(part.file.file_data).toMatch(/^data:application\/pdf;base64,/);
  });

  it("reports the provider status only when the call fails", async () => {
    const f = vi.fn(
      async () => new Response("secret body", { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      createPdfReader({ provider: "gemini", apiKey: "k" }, f).read(request),
    ).rejects.toThrow("gemini-pdf request failed: 500");
  });
});

describe("buildPdfReader", () => {
  it("uses the chosen provider, else the first one with a key, else nothing", () => {
    expect(buildPdfReader({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k" })?.name).toMatch(
      /^gemini:/,
    );
    expect(buildPdfReader({ AI_PROVIDER: "gemini", OPENAI_API_KEY: "k" })?.name).toMatch(
      /^openai:/,
    );
    expect(buildPdfReader({ AI_PROVIDER: "gemini" })).toBeNull();
  });
});
