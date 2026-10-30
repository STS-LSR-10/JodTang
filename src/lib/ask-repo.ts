import type { SupabaseClient } from "@supabase/supabase-js";
import { log, safeMessage } from "@/lib/log";

/** How long the "ask พี่ฮูก" mode stays open after the last question (or the start). */
export const ASK_WAIT_MINUTES = 5;

/** Open (or extend) the mode: what the person types next is a question. */
export async function startAskWait(
  db: SupabaseClient,
  userId: string,
  now: Date,
  minutes = ASK_WAIT_MINUTES,
): Promise<void> {
  const { error } = await db
    .from("ask_waits")
    .upsert(
      { user_id: userId, expires_at: new Date(now.getTime() + minutes * 60_000).toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`start ask wait: ${error.message}`);
}

/**
 * Is the mode open? Never throws: if the table is missing (migration not run) or the read fails,
 * messages simply keep being read as entries, as before.
 */
export async function isAskWaitLive(
  db: SupabaseClient,
  userId: string,
  now: Date,
): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("ask_waits")
      .select("expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data) && new Date((data as { expires_at: string }).expires_at) > now;
  } catch (error) {
    log.warn("ask_wait_unavailable", { reason: safeMessage(error) });
    return false;
  }
}

export async function clearAskWait(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db.from("ask_waits").delete().eq("user_id", userId);
  if (error) log.warn("ask_wait_clear_failed", { reason: safeMessage(error) });
}
