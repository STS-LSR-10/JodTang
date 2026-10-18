import type { SupabaseClient } from "@supabase/supabase-js";
import { categorizeByRules } from "@/lib/categorize/rules";
import { log, safeMessage } from "@/lib/log";
import { MAX_AUDIO_MS, ImageError } from "@/lib/line/content";
import { can, effectivePlan } from "@/lib/plan";
import { parseMessage } from "@/lib/parse/text-parser";
import { LIMITS, type LimitRule, type RateLimitResult } from "@/lib/rate-limit";
import { insertTransaction, loadCategories, loadMemoryFor, type UserRow } from "@/lib/repo";
import { needsSmartParse, runSmartParse } from "@/lib/ai/smart-parse";
import type { TextStructurer } from "@/lib/ai/text-structurer";
import type { Transcriber } from "@/lib/voice/transcribe";
import { recordSmartEntries } from "./smart-entries";
import type { LineMessage } from "@/lib/types";
import {
  text,
  VOICE_DAY_LIMIT_TEXT,
  VOICE_EMPTY_TEXT,
  VOICE_FAILED_TEXT,
  VOICE_LOCKED_TEXT,
  VOICE_TOO_LONG_TEXT,
  voiceHeardText,
  voiceNoAmountText,
} from "./messages";
import { buildVoiceCard } from "./voice-flex";

export interface VoiceDeps {
  db: SupabaseClient;
  now: () => Date;
  fetchAudio: (messageId: string) => Promise<{ bytes: Uint8Array; mimeType: string }>;
  transcriber: Transcriber;
  /** Reads long or unclear sentences (voice is Ultimate, so it is allowed here). */
  structurer?: TextStructurer;
  limit?: (bucket: string, subject: string, rule: LimitRule) => Promise<RateLimitResult>;
}

const MAX_ENTRIES = 3;

/**
 * Voice message -> transcript -> pending entries + "did I hear you right?" cards.
 * Order matters for cost: plan -> length -> daily cap -> download -> transcribe. Nothing is saved
 * as confirmed: every voice entry waits for the person's tap. The audio itself is never stored.
 */
export async function handleVoiceMessage(
  deps: VoiceDeps,
  user: UserRow,
  message: { id: string; duration?: number },
  lineUserId: string,
): Promise<LineMessage[]> {
  const now = deps.now();

  // 1. plan (the upsell is the only thing a Free user gets)
  if (!can(effectivePlan(user.plan, user.plan_expires_at, now), "voiceLog")) {
    return [text(VOICE_LOCKED_TEXT)];
  }

  // 2. length: LINE tells us before we download anything
  if (typeof message.duration === "number" && message.duration > MAX_AUDIO_MS) {
    return [text(VOICE_TOO_LONG_TEXT)];
  }

  // 3. daily ceiling per person
  if (deps.limit) {
    const day = await deps.limit("voice_day", lineUserId, LIMITS.voiceDay);
    if (!day.allowed) return [text(VOICE_DAY_LIMIT_TEXT)];
  }

  // 4. download
  let audio: { bytes: Uint8Array; mimeType: string };
  try {
    audio = await deps.fetchAudio(message.id);
  } catch (error) {
    if (error instanceof ImageError && error.reason === "too_large") {
      return [text(VOICE_TOO_LONG_TEXT)];
    }
    log.warn("voice_download_failed", { reason: safeMessage(error) });
    return [text(VOICE_FAILED_TEXT)];
  }

  // 5. transcribe
  let heard: string;
  try {
    heard = await deps.transcriber.transcribe(audio);
  } catch (error) {
    log.warn("voice_transcribe_failed", {
      provider: deps.transcriber.name,
      reason: safeMessage(error),
    });
    return [text(VOICE_FAILED_TEXT)];
  }
  if (!heard) return [text(VOICE_EMPTY_TEXT)];

  // 6. understand it like typed text, but never save without a tap
  const parsed = parseMessage(heard, now);
  const { entries } = parsed;

  const [categories, memory] = await Promise.all([
    loadCategories(deps.db, user.id),
    loadMemoryFor(deps.db, user, now),
  ]);

  // a long or unclear sentence: let the AI read it first, the rules stay as the fallback
  if (deps.structurer && needsSmartParse(heard, parsed)) {
    const smart = await runSmartParse(
      { structurer: deps.structurer, limit: deps.limit, now: deps.now },
      {
        text: heard,
        subject: lineUserId,
        categories: categories
          .filter((c) => !c.is_hidden)
          .map((c) => ({ name: c.name, type: c.type })),
      },
    );
    if (smart) {
      const cards = await recordSmartEntries({
        db: deps.db,
        user,
        entries: smart,
        categories,
        memory,
        rawText: heard,
        source: "voice",
      });
      return [text(voiceHeardText(heard)), ...cards];
    }
  }

  if (entries.length === 0) return [text(voiceNoAmountText(heard))];
  const cards: LineMessage[] = [];
  for (const entry of entries.slice(0, MAX_ENTRIES)) {
    const { categoryId } = categorizeByRules({
      title: entry.title,
      type: entry.type,
      categories,
      memory,
    });
    const tx = await insertTransaction(deps.db, {
      userId: user.id,
      type: entry.type,
      title: entry.title,
      amountSatang: entry.amountSatang,
      categoryId,
      occurredAt: entry.occurredAt,
      status: "pending_confirm",
      rawText: heard,
      source: "voice",
    });
    cards.push(
      buildVoiceCard({
        txId: tx.id,
        type: entry.type,
        title: entry.title,
        amountSatang: entry.amountSatang,
        categoryName: categories.find((c) => c.id === categoryId)?.name ?? null,
        occurredAt: entry.occurredAt,
      }),
    );
  }
  return [text(voiceHeardText(heard)), ...cards];
}
