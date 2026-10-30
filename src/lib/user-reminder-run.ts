import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";
import { reminderPushText } from "@/lib/line/messages";
import type { LineMessage } from "@/lib/types";
import { claimDueReminders } from "@/lib/user-reminder-repo";
import { REPEAT_LABEL } from "@/lib/user-reminder";

export interface UserReminderRunSummary {
  claimed: number;
  sent: number;
  errors: number;
}

/**
 * Every few minutes: push the reminders that are due. Each is taken first (a one-off is marked done, a
 * repeating one moves to its next time), then pushed, so a failing push (the person blocked the bot)
 * is not retried every run, and two overlapping runs never send the same reminder twice.
 */
export async function runUserReminders(
  db: SupabaseClient,
  push: (lineUserId: string, messages: LineMessage[]) => Promise<void>,
  now: Date,
  liffUrl?: string,
): Promise<UserReminderRunSummary> {
  const summary: UserReminderRunSummary = { claimed: 0, sent: 0, errors: 0 };
  const due = await claimDueReminders(db, now);
  summary.claimed = due.length;
  for (const r of due) {
    try {
      await push(r.lineUserId, [
        {
          type: "text",
          text: reminderPushText(r.body, r.repeat ? REPEAT_LABEL[r.repeat] : null, liffUrl),
        },
      ]);
      summary.sent += 1;
    } catch (error) {
      summary.errors += 1;
      log.warn("user_reminder_push_failed", {
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return summary;
}
