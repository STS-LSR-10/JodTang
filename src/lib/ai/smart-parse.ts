import { log, safeMessage } from "@/lib/log";
import { CONFIRM_THRESHOLD, SPLIT_RE, type ParseResult } from "@/lib/parse/text-parser";
import { bangkokParts } from "@/lib/thai-date";
import { LIMITS, type LimitRule, type RateLimitResult } from "@/lib/rate-limit";
import {
  sanitizeStructured,
  type CategoryHint,
  type SmartEntry,
  type TextStructurer,
} from "./text-structurer";

/** A segment longer than this is probably a sentence, not "กาแฟ 30". */
export const LONG_SEGMENT_CHARS = 40;

/**
 * Should the AI have a look? Only when the ordinary rules did not settle it: nothing was
 * understood, some part had no amount, a part is a long sentence, or the rules were unsure.
 * Short, clear messages never reach the AI, so they cost nothing and stay instant.
 */
export function needsSmartParse(input: string, result: ParseResult): boolean {
  if (result.entries.length === 0) return true;
  if (result.unparsed.length > 0) return true;
  if (result.entries.some((e) => e.confidence < CONFIRM_THRESHOLD)) return true;
  return input.split(SPLIT_RE).some((segment) => segment.trim().length > LONG_SEGMENT_CHARS);
}

export interface SmartDeps {
  structurer?: TextStructurer;
  limit?: (bucket: string, subject: string, rule: LimitRule) => Promise<RateLimitResult>;
  now: () => Date;
}

/**
 * Ask the AI to read `input`. Null means "use the ordinary rules instead": no AI configured, the
 * daily ceiling is reached, the call failed, or the reply held nothing usable. Never throws.
 */
export async function runSmartParse(
  deps: SmartDeps,
  input: { text: string; subject: string; categories: CategoryHint[] },
): Promise<SmartEntry[] | null> {
  const { structurer } = deps;
  if (!structurer) return null;
  try {
    if (deps.limit) {
      const day = await deps.limit("smart_day", input.subject, LIMITS.smartDay);
      if (!day.allowed) return null;
    }
    const now = deps.now();
    const p = bangkokParts(now);
    const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    const raw = await structurer.structure({
      text: input.text,
      today,
      categories: input.categories,
    });
    const entries = sanitizeStructured(raw, {
      text: input.text,
      now,
      categories: input.categories,
    });
    return entries.length > 0 ? entries : null;
  } catch (error) {
    log.warn("smart_parse_failed", { provider: structurer.name, reason: safeMessage(error) });
    return null;
  }
}
