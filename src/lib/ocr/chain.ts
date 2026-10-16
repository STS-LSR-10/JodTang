import type { SlipImage, SlipOcrProvider } from "./provider";
import { rawSlipSchema, sanitizeSlip } from "./slip-schema";

/**
 * A reply is "usable" when it settles the question: either a readable slip, or the reader
 * clearly says the picture is not a slip. A slip with an unreadable amount is not usable,
 * so the next reader gets a chance.
 */
export function isUsableReply(raw: unknown, now: Date = new Date()): boolean {
  const parsed = rawSlipSchema.safeParse(raw);
  if (!parsed.success) return false;
  if (!parsed.data.is_slip) return true;
  return sanitizeSlip(raw, now).ok;
}

export interface ChainOptions {
  /** Called for each reader that failed or gave an unusable reply (status-only text, no payload). */
  onSkip?: (readerName: string, reason: string) => void;
  now?: () => Date;
}

/**
 * Try readers in order and return the first usable reply.
 * Typical order: slip-verification APIs first (exact, anti-fake), then AI vision models.
 *
 * - A reader that throws (outage, quota, no QR, bad key, timeout) is skipped.
 * - If nobody is usable but some reader did answer, the last such answer is returned so the
 *   caller can show "could not read this slip" instead of a system error.
 * - If every reader threw, the last error is rethrown.
 */
export function createSlipReaderChain(
  readers: SlipOcrProvider[],
  options: ChainOptions = {},
): SlipOcrProvider {
  if (readers.length === 0) throw new Error("slip reader chain needs at least one reader");
  const now = options.now ?? (() => new Date());

  return {
    name: readers.map((r) => r.name).join(" > "),
    async extract(image: SlipImage) {
      let lastError: unknown;
      let lastUnusable: { value: unknown } | undefined;

      for (const reader of readers) {
        try {
          const raw = await reader.extract(image);
          if (isUsableReply(raw, now())) return raw;
          lastUnusable = { value: raw };
          options.onSkip?.(reader.name, "unusable reply");
        } catch (error) {
          lastError = error;
          options.onSkip?.(reader.name, error instanceof Error ? error.message : "failed");
        }
      }

      if (lastUnusable) return lastUnusable.value;
      throw lastError instanceof Error ? lastError : new Error("all slip readers failed");
    },
  };
}
