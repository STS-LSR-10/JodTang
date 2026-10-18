import { describe, expect, it, vi } from "vitest";
import {
  buildTextStructurer,
  createTextStructurer,
  MAX_SMART_ENTRIES,
  sanitizeStructured,
  structurePrompt,
  type CategoryHint,
} from "./text-structurer";

const NOW = new Date("2026-10-17T08:00:00Z"); // 15:00 on 2026-10-17 in Bangkok
const categories: CategoryHint[] = [
  { name: "อาหาร", type: "expense" },
  { name: "เดินทาง", type: "expense" },
  { name: "เงินเดือน", type: "income" },
];
const SENTENCE = "ไปกินข้าวกับแฟนมา จ่ายไป 850 บาท เอาออกจากกระเป๋าเงินสดนะ";

const clean = (raw: unknown, text = SENTENCE) =>
  sanitizeStructured(raw, { text, now: NOW, categories });

describe("sanitizeStructured", () => {
  it("accepts a good reply and resolves the category name", () => {
    const out = clean({
      entries: [{ type: "expense", title: "กินข้าวกับแฟน", amount: 850, category: "อาหาร" }],
    });
    expect(out).toEqual([
      {
        type: "expense",
        title: "กินข้าวกับแฟน",
        amountSatang: 85_000,
        categoryName: "อาหาร",
        occurredAt: NOW,
      },
    ]);
  });

  it("drops an amount that is not in the message (the model made it up)", () => {
    expect(clean({ entries: [{ type: "expense", title: "x", amount: 900 }] })).toEqual([]);
  });

  it("allows units written in the message: พัน, หมื่น, k", () => {
    const ok = (text: string, amount: number) =>
      clean({ entries: [{ type: "expense", title: "x", amount }] }, text).length === 1;
    expect(ok("จ่ายค่าเช่า 5 พัน", 5000)).toBe(true);
    expect(ok("เงินเดือนเข้า 2 หมื่น", 20_000)).toBe(true);
    expect(ok("ซื้อของ 3k", 3000)).toBe(true);
    expect(ok("ซื้อของ 3k", 30)).toBe(false);
  });

  it("reads Thai digits and thousands separators in the message", () => {
    const out = clean(
      { entries: [{ type: "expense", title: "x", amount: "1200" }] },
      "จ่ายค่าไฟไป ๑,๒๐๐ บาท",
    );
    expect(out[0]?.amountSatang).toBe(120_000);
  });

  it("accepts any amount when the message has no digits (spelled in words); the card is the check", () => {
    expect(
      clean({ entries: [{ type: "expense", title: "กาแฟ", amount: 50 }] }, "กาแฟห้าสิบบาท"),
    ).toHaveLength(1);
  });

  it("ignores a category that is not one of the person's, or has the wrong type", () => {
    const one = (category: string, type: "expense" | "income" = "expense") =>
      clean({ entries: [{ type, title: "x", amount: 850, category }] })[0]?.categoryName ?? null;
    expect(one("อาหาร")).toBe("อาหาร");
    expect(one("ของที่ไม่มี")).toBeNull();
    expect(one("อาหาร", "income")).toBeNull();
  });

  it("resolves a named past day, but not a future or far-past one", () => {
    const at = (date: string) =>
      clean({ entries: [{ type: "expense", title: "x", amount: 850, date }] })[0]?.occurredAt;
    expect(at("2026-10-16")?.toISOString()).toBe("2026-10-16T05:00:00.000Z");
    expect(at("2026-10-17")).toEqual(NOW);
    expect(at("2026-10-20")).toEqual(NOW); // future -> today
    expect(at("2020-01-01")).toEqual(NOW); // too old -> today
    expect(at("yesterday")).toEqual(NOW);
  });

  it("drops entries without a title or a usable amount, and caps the count", () => {
    expect(
      clean({
        entries: [
          { type: "expense", title: "", amount: 850 },
          { type: "expense", title: "x", amount: -5 },
          { type: "expense", title: "x", amount: "abc" },
          { type: "bad", title: "x", amount: 850 },
        ],
      }),
    ).toEqual([]);
    const many = Array.from({ length: 8 }, (_, i) => ({
      type: "expense",
      title: `รายการ${i}`,
      amount: 850,
    }));
    expect(clean({ entries: many })).toHaveLength(MAX_SMART_ENTRIES);
  });

  it("returns nothing for garbage", () => {
    expect(clean("hello")).toEqual([]);
    expect(clean(null)).toEqual([]);
    expect(clean({ entries: "x" })).toEqual([]);
    expect(clean({})).toEqual([]);
  });

  it("trims long titles", () => {
    const out = clean({ entries: [{ type: "expense", title: "ก".repeat(200), amount: 850 }] });
    expect(out[0]?.title).toHaveLength(60);
  });
});

describe("structurePrompt", () => {
  it("carries today, the category names by type, and the message", () => {
    const prompt = structurePrompt({ text: SENTENCE, today: "2026-10-17", categories });
    expect(prompt).toContain("2026-10-17");
    expect(prompt).toContain("Expense: อาหาร, เดินทาง");
    expect(prompt).toContain("Income: เงินเดือน");
    expect(prompt).toContain(JSON.stringify(SENTENCE));
  });
});

const reply = { entries: [{ type: "expense", title: "กินข้าว", amount: 850 }] };
const req = { text: SENTENCE, today: "2026-10-17", categories };
const fakeFetch = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
const lastBody = (f: unknown) =>
  JSON.parse(
    String(((f as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body),
  );

describe("providers", () => {
  it("gemini sends the prompt as text and parses the JSON", async () => {
    const f = fakeFetch({
      candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }],
    });
    const s = createTextStructurer({ provider: "gemini", apiKey: "k" }, f);
    expect(await s.structure(req)).toEqual(reply);
    expect(lastBody(f).contents[0].parts[0].text).toContain(JSON.stringify(SENTENCE));
  });

  it("anthropic uses forced tool output and the cheap default model", async () => {
    const f = fakeFetch({ content: [{ type: "tool_use", input: reply }] });
    const s = createTextStructurer({ provider: "anthropic", apiKey: "k" }, f);
    expect(await s.structure(req)).toEqual(reply);
    expect(lastBody(f).model).toBe("claude-haiku-5-5");
    expect(lastBody(f).tool_choice).toEqual({ type: "tool", name: "record_entries" });
  });

  it("openai asks for a JSON object", async () => {
    const f = fakeFetch({ choices: [{ message: { content: JSON.stringify(reply) } }] });
    const s = createTextStructurer({ provider: "openai", apiKey: "k", model: "m1" }, f);
    expect(await s.structure(req)).toEqual(reply);
    expect(lastBody(f).response_format).toEqual({ type: "json_object" });
    expect(lastBody(f).model).toBe("m1");
  });

  it("an error carries the status only", async () => {
    const f = vi.fn(async () => new Response("secret", { status: 429 })) as unknown as typeof fetch;
    const s = createTextStructurer({ provider: "gemini", apiKey: "k" }, f);
    await expect(s.structure(req)).rejects.toThrow("gemini-text request failed: 429");
  });
});

describe("buildTextStructurer", () => {
  it("prefers the chosen provider, then any other with a key, else null", () => {
    expect(
      buildTextStructurer({ AI_PROVIDER: "openai", OPENAI_API_KEY: "a", GEMINI_API_KEY: "b" })
        ?.name,
    ).toMatch(/^openai:/);
    expect(buildTextStructurer({ AI_PROVIDER: "openai", GEMINI_API_KEY: "b" })?.name).toMatch(
      /^gemini:/,
    );
    expect(buildTextStructurer({ AI_PROVIDER: "gemini" })).toBeNull();
  });

  it("AI_MODEL only applies to the provider it was set for", () => {
    const s = buildTextStructurer({
      AI_PROVIDER: "openai",
      AI_MODEL: "gpt-x",
      GEMINI_API_KEY: "b",
    });
    expect(s?.name).toBe("gemini:gemini-3.5-flash-lite");
  });
});
