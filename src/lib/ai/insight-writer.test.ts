import { describe, expect, it, vi } from "vitest";
import { buildInsightFacts } from "@/lib/insight";
import {
  buildInsightWriter,
  createInsightWriter,
  factsForPrompt,
  generateInsight,
  insightPrompt,
  type InsightWriter,
} from "./insight-writer";

const b = (n: number) => n * 100;
const facts = buildInsightFacts({
  periodLabel: "1 ต.ค. – 31 ต.ค.",
  previousLabel: "เดือนก่อน",
  expenseSatang: b(10_000),
  previousExpenseSatang: b(8000),
  incomeSatang: b(30_000),
  categories: [
    {
      name: "อาหาร",
      currentSatang: b(4200),
      previousSatang: b(3000),
      changePercent: 40,
      kind: "up",
    },
  ],
  titles: [
    {
      name: "ชานม",
      currentSatang: b(420),
      previousSatang: b(300),
      currentCount: 6,
      previousCount: 4,
      changePercent: 40,
    },
  ],
});
const good = {
  insights: ["ชานมใช้ไป ฿420 (6 ครั้ง) เพิ่มขึ้น 40% จากเดือนก่อน", "หมวดอาหารเพิ่มขึ้น 40%"],
  tip: null,
};

describe("factsForPrompt", () => {
  it("holds amounts in baht, percents, counts and names, and nothing that identifies a person", () => {
    const f = factsForPrompt(facts);
    expect(f.expenseBaht).toBe(10_000);
    expect(f.categories[0]).toMatchObject({
      name: "อาหาร",
      baht: 4200,
      previousBaht: 3000,
      changePercent: 40,
    });
    expect(f.items[0]).toMatchObject({ name: "ชานม", baht: 420, times: 6 });
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/user|line|uuid|@/i);
  });
});

describe("insightPrompt", () => {
  it("states the rules: only the given numbers, neutral, no investment advice", () => {
    const p = insightPrompt(facts);
    expect(p).toContain("ONLY numbers that appear in the facts");
    expect(p).toContain("investment");
    expect(p).toContain("ชานม");
  });
});

const fakeFetch = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("createInsightWriter", () => {
  it("gemini returns the parsed JSON", async () => {
    const f = fakeFetch({ candidates: [{ content: { parts: [{ text: JSON.stringify(good) }] } }] });
    const w = createInsightWriter({ provider: "gemini", apiKey: "k" }, f);
    expect(await w.write(facts)).toEqual(good);
    expect(w.name).toContain("gemini:");
  });

  it("anthropic uses the forced tool and a cheap model by default", async () => {
    const f = fakeFetch({ content: [{ type: "tool_use", input: good }] });
    const w = createInsightWriter({ provider: "anthropic", apiKey: "k" }, f);
    expect(await w.write(facts)).toEqual(good);
    const body = JSON.parse(
      String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1].body),
    );
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.tool_choice).toEqual({ type: "tool", name: "record_insight" });
  });

  it("openai asks for a JSON object", async () => {
    const f = fakeFetch({ choices: [{ message: { content: JSON.stringify(good) } }] });
    const w = createInsightWriter({ provider: "openai", apiKey: "k" }, f);
    expect(await w.write(facts)).toEqual(good);
  });

  it("an error carries the status only", async () => {
    const f = vi.fn(async () => new Response("secret", { status: 500 })) as unknown as typeof fetch;
    const w = createInsightWriter({ provider: "gemini", apiKey: "k" }, f);
    await expect(w.write(facts)).rejects.toThrow("gemini-text request failed: 500");
  });
});

describe("buildInsightWriter", () => {
  it("picks the chosen provider, then any with a key, else null", () => {
    expect(buildInsightWriter({ AI_PROVIDER: "openai", OPENAI_API_KEY: "a" })?.name).toMatch(
      /^openai:/,
    );
    expect(buildInsightWriter({ AI_PROVIDER: "openai", GEMINI_API_KEY: "b" })?.name).toMatch(
      /^gemini:/,
    );
    expect(buildInsightWriter({ AI_PROVIDER: "gemini" })).toBeNull();
  });
});

describe("generateInsight", () => {
  const writer = (write: InsightWriter["write"]): InsightWriter => ({ name: "t", write });

  it("uses the AI's words when they pass the checks", async () => {
    const r = await generateInsight(
      writer(async () => good),
      facts,
    );
    expect(r.source).toBe("ai");
  });

  it("falls back to plain code when there is no writer, it fails, or its numbers are invented", async () => {
    expect((await generateInsight(null, facts)).source).toBe("rules");
    expect((await generateInsight(undefined, facts)).source).toBe("rules");
    const failing = writer(async () => {
      throw new Error("down");
    });
    expect((await generateInsight(failing, facts)).source).toBe("rules");
    const lying = writer(async () => ({ insights: ["ชานมเพิ่ม 91%", "อาหารเพิ่ม 92%"] }));
    expect((await generateInsight(lying, facts)).source).toBe("rules");
  });
});
