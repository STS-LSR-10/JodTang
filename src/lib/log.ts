/**
 * Structured logging that cannot leak personal data by construction:
 * - events are short fixed names (never user text),
 * - extra fields are small primitives and sensitive-looking keys are dropped,
 * - error messages are passed through `redact` (LINE ids, UUIDs, tokens, long digit runs...).
 * Never log message text, titles, amounts, account numbers, tokens or user ids.
 */

const REDACTIONS: [RegExp, string][] = [
  [/\bU[0-9a-f]{32}\b/gi, "[line-id]"], // LINE user id
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[token]"], // JWT
  [/\bBearer\s+[\w.~+/=-]+/gi, "Bearer [token]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[uuid]"],
  [/\b[0-9a-f]{32,}\b/gi, "[hex]"], // long hashes / keys
  [/\d[\d\s-]{7,}\d/g, "[digits]"], // phone / account / card style number runs
];

const MAX_LENGTH = 300;

/** Strip anything that looks like personal data or a secret from free text. */
export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  out = out.replace(/\s+/g, " ").trim();
  return out.length > MAX_LENGTH ? `${out.slice(0, MAX_LENGTH)}…` : out;
}

const SENSITIVE_KEYS =
  /(text|title|note|memo|name|payee|amount|token|secret|authorization|password|key|user|line|email|phone|account|body|message)/i;

type Fields = Record<string, string | number | boolean | null | undefined>;

/** Keep only small primitive fields whose key is not sensitive-looking; redact string values. */
export function safeFields(fields: Fields = {}): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || SENSITIVE_KEYS.test(key)) continue;
    out[key] = typeof value === "string" ? redact(value).slice(0, 80) : value;
  }
  return out;
}

/** The text of an error with personal data removed. */
export function safeMessage(error: unknown): string {
  return redact(error instanceof Error ? error.message : "unknown error");
}

type Level = "info" | "warn" | "error";

function emit(level: Level, event: string, extra: Record<string, unknown>) {
  const line = JSON.stringify({ level, event, ...extra });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info(event: string, fields?: Fields) {
    emit("info", event, safeFields(fields));
  },
  warn(event: string, fields?: Fields) {
    emit("warn", event, safeFields(fields));
  },
  error(event: string, error?: unknown, fields?: Fields) {
    emit("error", event, {
      ...safeFields(fields),
      ...(error === undefined ? {} : { message: safeMessage(error) }),
    });
  },
};
