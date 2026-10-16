import { SLIP_JSON_SCHEMA } from "./slip-schema";

export interface SlipImage {
  bytes: Uint8Array;
  mimeType: string;
}

/** Reads a slip image and returns the (untrusted) structured fields. Swap providers freely. */
export interface SlipOcrProvider {
  readonly name: string;
  extract(image: SlipImage): Promise<unknown>;
}

export type AiProviderName = "gemini" | "anthropic" | "openai";

export interface AiConfig {
  provider: AiProviderName;
  model?: string;
  apiKey: string;
}

export const DEFAULT_MODELS: Record<AiProviderName, string> = {
  gemini: "gemini-2.5-flash",
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-4o-mini",
};

const TIMEOUT_MS = 30_000;

export const SLIP_PROMPT = [
  "You read Thai bank transfer slips, PromptPay/e-wallet slips and shop receipts.",
  "Return ONLY a JSON object that matches this JSON Schema, with no extra text:",
  JSON.stringify(SLIP_JSON_SCHEMA),
  "Rules:",
  "- is_slip=false if the image is not a payment slip or receipt (then other fields may be null).",
  "- amount is the money actually paid, in THB, as a number (no currency symbol).",
  "- paid_at must be ISO 8601 with +07:00 and a Gregorian year. Thai slips often use the Buddhist",
  "  era (2569 = 2026) and Thai month names; convert them. Use null if the date is unreadable.",
  "- payee_* describe the RECIPIENT (the person or shop that received the money), not the sender.",
  "- Never invent values. Use null for anything you cannot read.",
].join("\n");

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Pull the first JSON object out of a model reply (tolerates ``` fences and chatter). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model reply");
  return JSON.parse(text.slice(start, end + 1));
}

/** POST JSON and return the parsed body. Errors carry the status only (never the payload). */
export async function postJson(
  label: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${label} request failed: ${res.status}`);
  return res.json();
}

function geminiProvider(cfg: AiConfig, fetchImpl: typeof fetch): SlipOcrProvider {
  const model = cfg.model ?? DEFAULT_MODELS.gemini;
  return {
    name: `gemini:${model}`,
    async extract(image) {
      const data = (await postJson(
        "gemini",
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": cfg.apiKey },
        {
          contents: [
            {
              parts: [
                { text: SLIP_PROMPT },
                { inline_data: { mime_type: image.mimeType, data: toBase64(image.bytes) } },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        },
        fetchImpl,
      )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return extractJson(text);
    },
  };
}

function anthropicProvider(cfg: AiConfig, fetchImpl: typeof fetch): SlipOcrProvider {
  const model = cfg.model ?? DEFAULT_MODELS.anthropic;
  return {
    name: `anthropic:${model}`,
    async extract(image) {
      const data = (await postJson(
        "anthropic",
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
        {
          model,
          max_tokens: 1024,
          temperature: 0,
          // Forcing a tool call gives schema-shaped structured output.
          tools: [
            {
              name: "record_slip",
              description: "Record the fields read from the payment slip",
              input_schema: SLIP_JSON_SCHEMA,
            },
          ],
          tool_choice: { type: "tool", name: "record_slip" },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.mimeType,
                    data: toBase64(image.bytes),
                  },
                },
                { type: "text", text: SLIP_PROMPT },
              ],
            },
          ],
        },
        fetchImpl,
      )) as { content?: { type: string; input?: unknown; text?: string }[] };
      const tool = data.content?.find((b) => b.type === "tool_use");
      if (tool?.input) return tool.input;
      const text = data.content?.find((b) => b.type === "text")?.text ?? "";
      return extractJson(text);
    },
  };
}

function openaiProvider(cfg: AiConfig, fetchImpl: typeof fetch): SlipOcrProvider {
  const model = cfg.model ?? DEFAULT_MODELS.openai;
  return {
    name: `openai:${model}`,
    async extract(image) {
      const data = (await postJson(
        "openai",
        "https://api.openai.com/v1/chat/completions",
        { Authorization: `Bearer ${cfg.apiKey}` },
        {
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: SLIP_PROMPT },
                {
                  type: "image_url",
                  image_url: { url: `data:${image.mimeType};base64,${toBase64(image.bytes)}` },
                },
              ],
            },
          ],
        },
        fetchImpl,
      )) as { choices?: { message?: { content?: string } }[] };
      return extractJson(data.choices?.[0]?.message?.content ?? "");
    },
  };
}

export function createSlipOcrProvider(
  cfg: AiConfig,
  fetchImpl: typeof fetch = fetch,
): SlipOcrProvider {
  switch (cfg.provider) {
    case "gemini":
      return geminiProvider(cfg, fetchImpl);
    case "anthropic":
      return anthropicProvider(cfg, fetchImpl);
    case "openai":
      return openaiProvider(cfg, fetchImpl);
  }
}
