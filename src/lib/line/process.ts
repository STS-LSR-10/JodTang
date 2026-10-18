import { getServerEnv } from "@/lib/env";
import { buildSlipReader } from "@/lib/ocr/factory";
import { rateLimit } from "@/lib/rate-limit";
import { buildInsightWriter } from "@/lib/ai/insight-writer";
import { buildTextStructurer } from "@/lib/ai/text-structurer";
import { buildTranscriber } from "@/lib/voice/transcribe";
import { claimEvent, releaseEvent } from "@/lib/repo";
import { getAdminClient } from "@/lib/supabase/admin";
import { createLineClient } from "./client";
import { fetchLineAudio, fetchLineImage } from "./content";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { ERROR_TEXT, text } from "./messages";
import { log } from "@/lib/log";

function isLineEvent(value: unknown): value is LineEvent {
  return (
    typeof value === "object" && value !== null && typeof (value as LineEvent).type === "string"
  );
}

/**
 * Process webhook events sequentially. Each event is claimed first (dedupe on
 * webhookEventId); if handling fails the claim is released so a LINE redelivery can retry.
 * Never logs message text or user ids.
 */
export async function processEvents(rawEvents: unknown[]): Promise<void> {
  const env = getServerEnv();
  const line = createLineClient(env.LINE_CHANNEL_ACCESS_TOKEN);

  let db: ReturnType<typeof getAdminClient>;
  try {
    db = getAdminClient();
  } catch (error) {
    // Config problem: still tell the user something went wrong instead of staying silent.
    log.error("line_setup_failed", error);
    for (const raw of rawEvents) {
      if (isLineEvent(raw) && raw.replyToken) {
        await line.reply(raw.replyToken, [text(ERROR_TEXT)]).catch(() => undefined);
      }
    }
    return;
  }

  // Slip readers: EasySlip first (when configured), then the AI models in order.
  // Skips are logged with the reader name and a status-only reason (never the payload).
  const deps: HandlerDeps = {
    db,
    reply: line.reply,
    getProfile: line.getProfile,
    getGroupMemberProfile: line.getGroupMemberProfile,
    now: () => new Date(),
    limit: (bucket, subject, rule) => rateLimit(db, bucket, subject, rule),
    slip: {
      fetchImage: (messageId) => fetchLineImage(env.LINE_CHANNEL_ACCESS_TOKEN, messageId),
      ocr: buildSlipReader(env, {
        onSkip: (name, reason) => log.warn("slip_reader_skipped", { reader: name, reason }),
      }).reader,
    },
  };

  // Long typed or spoken sentences (Ultimate) are read by the same AI provider; without a key the rules do it all.
  const structurer = buildTextStructurer(env);
  if (structurer) deps.structurer = structurer;
  const insightWriter = buildInsightWriter(env);
  if (insightWriter) deps.insightWriter = insightWriter;

  // Voice messages need an AI that can hear (Gemini or OpenAI key); without one they get a polite no.
  const transcriber = buildTranscriber(env);
  if (transcriber) {
    deps.voice = {
      fetchAudio: (messageId) => fetchLineAudio(env.LINE_CHANNEL_ACCESS_TOKEN, messageId),
      transcriber,
    };
  }

  for (const raw of rawEvents) {
    if (!isLineEvent(raw)) continue;
    const eventId = raw.webhookEventId;
    try {
      if (eventId && !(await claimEvent(db, eventId))) continue; // duplicate / redelivery
      try {
        await handleEvent(raw, deps);
      } catch (error) {
        if (eventId) await releaseEvent(db, eventId).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      log.error("line_event_failed", error);
      if (raw.replyToken) {
        await line.reply(raw.replyToken, [text(ERROR_TEXT)]).catch(() => undefined);
      }
    }
  }
}
