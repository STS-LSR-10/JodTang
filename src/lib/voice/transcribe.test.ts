import { describe, expect, it, vi } from "vitest";
import {
  buildTranscriber,
  cleanTranscript,
  createTranscriber,
  MAX_TRANSCRIPT_CHARS,
  normalizeAudioMime,
  VOICE_PROMPT,
} from "./transcribe";

const audio = { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: "audio/x-m4a" };

describe("normalizeAudioMime", () => {
  it("maps LINE's m4a to audio/mp4 and keeps other known types", () => {
    expect(normalizeAudioMime("audio/x-m4a")).toBe("audio/mp4");
    expect(normalizeAudioMime("audio/m4a; codecs=mp4a")).toBe("audio/mp4");
    expect(normalizeAudioMime("")).toBe("audio/mp4");
    expect(normalizeAudioMime("application/octet-stream")).toBe("audio/mp4");
    expect(normalizeAudioMime("audio/wav")).toBe("audio/wav");
  });
});

describe("cleanTranscript", () => {
  it("trims, flattens line breaks, drops wrapping quotes and caps the length", () => {
    expect(cleanTranscript('  "กาแฟ 30\nบาท"  ')).toBe("กาแฟ 30 บาท");
    expect(cleanTranscript("")).toBe("");
    expect(cleanTranscript("ก".repeat(500))).toHaveLength(MAX_TRANSCRIPT_CHARS);
  });
});

describe("Gemini transcriber", () => {
  it("sends the prompt and the audio as inline data and returns the cleaned text", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: ' "ข้าวมันไก่ 50 บาท" ' }] } }] }),
    ) as unknown as typeof fetch;
    const t = createTranscriber({ provider: "gemini", apiKey: "k" }, fetchImpl);
    expect(await t?.transcribe(audio)).toBe("ข้าวมันไก่ 50 บาท");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].text).toBe(VOICE_PROMPT);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("audio/mp4");
    expect(body.contents[0].parts[1].inline_data.data).toBe(
      Buffer.from([1, 2, 3, 4]).toString("base64"),
    );
  });

  it("an error carries the status only", async () => {
    const fetchImpl = (async () =>
      new Response("secret body", { status: 429 })) as unknown as typeof fetch;
    const t = createTranscriber({ provider: "gemini", apiKey: "k" }, fetchImpl);
    await expect(t?.transcribe(audio)).rejects.toThrow("gemini-audio request failed: 429");
  });
});

describe("OpenAI transcriber", () => {
  it("uploads the file with the model, Thai language and a bearer key", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ text: "เงินเดือน 20000" }),
    ) as unknown as typeof fetch;
    const t = createTranscriber({ provider: "openai", apiKey: "sk-x" }, fetchImpl);
    expect(await t?.transcribe(audio)).toBe("เงินเดือน 20000");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-x");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(form.get("language")).toBe("th");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });
});

describe("buildTranscriber", () => {
  it("uses the chosen provider when it has a key and can hear", () => {
    expect(buildTranscriber({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g" })?.name).toMatch(
      /^gemini:/,
    );
    expect(
      buildTranscriber({ AI_PROVIDER: "openai", OPENAI_API_KEY: "o", GEMINI_API_KEY: "g" })?.name,
    ).toMatch(/^openai:/);
  });

  it("falls back to the other audio-capable provider", () => {
    expect(buildTranscriber({ AI_PROVIDER: "anthropic", GEMINI_API_KEY: "g" })?.name).toMatch(
      /^gemini:/,
    );
    expect(buildTranscriber({ AI_PROVIDER: "gemini", OPENAI_API_KEY: "o" })?.name).toMatch(
      /^openai:/,
    );
  });

  it("is null when nothing can hear (Anthropic has no audio input)", () => {
    expect(buildTranscriber({ AI_PROVIDER: "anthropic" })).toBeNull();
    expect(buildTranscriber({ AI_PROVIDER: "gemini" })).toBeNull();
    expect(createTranscriber({ provider: "anthropic", apiKey: "a" })).toBeNull();
  });

  it("AI_MODEL only applies to the provider it was set for", () => {
    expect(
      buildTranscriber({ AI_PROVIDER: "gemini", AI_MODEL: "gemini-x", GEMINI_API_KEY: "g" })?.name,
    ).toBe("gemini:gemini-x");
    expect(
      buildTranscriber({ AI_PROVIDER: "gemini", AI_MODEL: "gemini-x", OPENAI_API_KEY: "o" })?.name,
    ).toBe("openai:gpt-4o-mini-transcribe");
  });
});
