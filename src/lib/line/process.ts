import { getServerEnv } from "@/lib/env";
import { createSlipOcrProvider } from "@/lib/ocr/provider";
import { claimEvent, releaseEvent } from "@/lib/repo";
import { getAdminClient } from "@/lib/supabase/admin";
import { createLineClient } from "./client";
import { fetchLineImage } from "./content";
import { handleEvent, type HandlerDeps, type LineEvent } from "./handlers";
import { ERROR_TEXT, text } from "./messages";

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
    console.error("line setup failed:", error instanceof Error ? error.message : "unknown error");
    for (const raw of rawEvents) {
      if (isLineEvent(raw) && raw.replyToken) {
        await line.reply(raw.replyToken, [text(ERROR_TEXT)]).catch(() => undefined);
      }
    }
    return;
  }

  const apiKey = {
    gemini: env.GEMINI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
  }[env.AI_PROVIDER];

  const deps: HandlerDeps = {
    db,
    reply: line.reply,
    getProfile: line.getProfile,
    now: () => new Date(),
    // getServerEnv() already guarantees the selected provider's key exists.
    slip: apiKey
      ? {
          fetchImage: (messageId) => fetchLineImage(env.LINE_CHANNEL_ACCESS_TOKEN, messageId),
          ocr: createSlipOcrProvider({
            provider: env.AI_PROVIDER,
            model: env.AI_MODEL,
            apiKey,
          }),
        }
      : undefined,
  };

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
      console.error("line event failed:", error instanceof Error ? error.message : "unknown error");
      if (raw.replyToken) {
        await line.reply(raw.replyToken, [text(ERROR_TEXT)]).catch(() => undefined);
      }
    }
  }
}
