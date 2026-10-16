import { describe, expect, it, vi } from "vitest";
import { createSlipOcrProvider, extractJson, type SlipImage } from "./provider";

const image: SlipImage = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };
const SLIP = { is_slip: true, amount: 120 };

function fakeFetch(status: number, body: unknown) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const lastCall = (f: unknown) =>
  (f as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

describe("extractJson", () => {
  it("parses plain JSON and fenced JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } });
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("sorry, I cannot")).toThrow();
  });
});

describe("gemini", () => {
  it("sends the image and returns the parsed JSON", async () => {
    const f = fakeFetch(200, {
      candidates: [{ content: { parts: [{ text: JSON.stringify(SLIP) }] } }],
    });
    const p = createSlipOcrProvider({ provider: "gemini", apiKey: "k", model: "m1" }, f);
    expect(await p.extract(image)).toEqual(SLIP);

    const [url, init] = lastCall(f);
    expect(url).toContain("/models/m1:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("image/jpeg");
    expect(body.contents[0].parts[1].inline_data.data).toBe("AQID");
  });
});

describe("anthropic", () => {
  it("uses forced tool output", async () => {
    const f = fakeFetch(200, { content: [{ type: "tool_use", input: SLIP }] });
    const p = createSlipOcrProvider({ provider: "anthropic", apiKey: "k" }, f);
    expect(await p.extract(image)).toEqual(SLIP);

    const [url, init] = lastCall(f);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(init.body));
    expect(body.tool_choice).toEqual({ type: "tool", name: "record_slip" });
    expect(body.messages[0].content[0].type).toBe("image");
  });

  it("falls back to text JSON", async () => {
    const f = fakeFetch(200, { content: [{ type: "text", text: JSON.stringify(SLIP) }] });
    const p = createSlipOcrProvider({ provider: "anthropic", apiKey: "k" }, f);
    expect(await p.extract(image)).toEqual(SLIP);
  });
});

describe("openai", () => {
  it("sends a data URL and parses message content", async () => {
    const f = fakeFetch(200, { choices: [{ message: { content: JSON.stringify(SLIP) } }] });
    const p = createSlipOcrProvider({ provider: "openai", apiKey: "k" }, f);
    expect(await p.extract(image)).toEqual(SLIP);

    const body = JSON.parse(String(lastCall(f)[1].body));
    expect(body.messages[0].content[1].image_url.url).toBe("data:image/jpeg;base64,AQID");
  });
});

describe("errors", () => {
  it("reports the status only, never the response body", async () => {
    const f = fakeFetch(429, { error: { message: "secret detail about the account" } });
    const p = createSlipOcrProvider({ provider: "gemini", apiKey: "k" }, f);
    const err = await p.extract(image).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("gemini request failed: 429");
  });

  it("names the provider and model", () => {
    const p = createSlipOcrProvider(
      { provider: "openai", apiKey: "k", model: "x" },
      fakeFetch(200, {}),
    );
    expect(p.name).toBe("openai:x");
  });
});
