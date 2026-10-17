import { postJson, toBase64, type AiProviderName } from "@/lib/ocr/provider";

export interface AudioClip {
  bytes: Uint8Array;
  mimeType: string;
}

/** Turns a short voice note into text. Swap providers freely. */
export interface Transcriber {
  readonly name: string;
  transcribe(audio: AudioClip): Promise<string>;
}

export const MAX_TRANSCRIPT_CHARS = 300;

/** LINE voice notes are AAC in an MP4 container; providers know that as audio/mp4. */
export function normalizeAudioMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!m || m === "application/octet-stream" || /m4a|mp4|mpeg4/.test(m)) return "audio/mp4";
  return m;
}

export const VOICE_PROMPT = [
  "Transcribe this short Thai voice note exactly as spoken.",
  "It is usually about money: what was bought or received, and how much.",
  "Write every number as digits (สามสิบ -> 30, ห้าร้อย -> 500, หนึ่งพัน -> 1000, สองหมื่น -> 20000,",
  "สิบเอ็ด -> 11, ร้อยยี่สิบ -> 120). Keep the Thai words as they are.",
  "Output ONLY the transcript on one line, without quotes or commentary.",
  "If you hear no speech, output nothing.",
].join(" ");

/** Trim, drop wrapping quotes and line breaks, and cap the length. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“”'`]+|["“”'`]+$/g, "")
    .trim()
    .slice(0, MAX_TRANSCRIPT_CHARS);
}

export interface TranscriberConfig {
  provider: AiProviderName;
  apiKey: string;
  model?: string;
}

/** Models that accept audio. Anthropic's API has no audio input, so it is not offered here. */
export const VOICE_DEFAULT_MODELS = {
  gemini: "gemini-3.5-flash-lite",
  openai: "gpt-4o-mini-transcribe",
} as const;

function geminiTranscriber(cfg: TranscriberConfig, fetchImpl: typeof fetch): Transcriber {
  const model = cfg.model ?? VOICE_DEFAULT_MODELS.gemini;
  return {
    name: `gemini:${model}`,
    async transcribe(audio) {
      const data = (await postJson(
        "gemini-audio",
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": cfg.apiKey },
        {
          contents: [
            {
              parts: [
                { text: VOICE_PROMPT },
                {
                  inline_data: {
                    mime_type: normalizeAudioMime(audio.mimeType),
                    data: toBase64(audio.bytes),
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        },
        fetchImpl,
      )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return cleanTranscript(
        data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
      );
    },
  };
}

function openaiTranscriber(cfg: TranscriberConfig, fetchImpl: typeof fetch): Transcriber {
  const model = cfg.model ?? VOICE_DEFAULT_MODELS.openai;
  return {
    name: `openai:${model}`,
    async transcribe(audio) {
      const form = new FormData();
      form.set("model", model);
      form.set("language", "th");
      form.set("response_format", "json");
      form.set("temperature", "0");
      form.set(
        "file",
        new Blob([audio.bytes as BlobPart], { type: normalizeAudioMime(audio.mimeType) }),
        "voice.m4a",
      );
      const res = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`openai-audio request failed: ${res.status}`);
      const data = (await res.json()) as { text?: string };
      return cleanTranscript(data.text ?? "");
    },
  };
}

export function createTranscriber(
  cfg: TranscriberConfig,
  fetchImpl: typeof fetch = fetch,
): Transcriber | null {
  switch (cfg.provider) {
    case "gemini":
      return geminiTranscriber(cfg, fetchImpl);
    case "openai":
      return openaiTranscriber(cfg, fetchImpl);
    case "anthropic":
      return null;
  }
}

export interface TranscriberEnv {
  AI_PROVIDER: AiProviderName;
  AI_MODEL?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

/**
 * The chosen AI provider when it can hear audio, otherwise the first of Gemini / OpenAI that has
 * a key. Null when nothing can: voice messages then get a polite "not available" answer.
 */
export function buildTranscriber(
  env: TranscriberEnv,
  fetchImpl: typeof fetch = fetch,
): Transcriber | null {
  const order: ("gemini" | "openai")[] =
    env.AI_PROVIDER === "openai" ? ["openai", "gemini"] : ["gemini", "openai"];
  for (const provider of order) {
    const apiKey = provider === "gemini" ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
    if (!apiKey) continue;
    // AI_MODEL belongs to the provider it was set for
    const model = provider === env.AI_PROVIDER ? env.AI_MODEL : undefined;
    return createTranscriber({ provider, apiKey, model }, fetchImpl);
  }
  return null;
}
