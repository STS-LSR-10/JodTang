import { json } from "@/lib/api";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getServerEnv } from "@/lib/env";
import { createLineClient } from "@/lib/line/client";
import { runReminders } from "@/lib/reminder-run";
import { runSummaries } from "@/lib/summary-run";
import { getAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly: push the daily "you have not recorded today" nudge and the weekly / monthly summaries
 * (Professional and above).
 * Triggered by GitHub Actions (or Vercel Cron on a plan that allows hourly schedules);
 * GET + Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: Request): Promise<Response> {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return new Response("server misconfigured", { status: 500 });
  }
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const line = createLineClient(env.LINE_CHANNEL_ACCESS_TOKEN);
    const db = getAdminClient();
    const now = new Date();
    const summary = await runReminders(db, line.push, now);
    // A failing summary run must not hide the reminder result (and vice versa).
    const summaries = await runSummaries(db, line.push, now, process.env.APP_BASE_URL).catch(
      (error: unknown) => {
        log.error("cron_summaries_failed", error);
        return null;
      },
    );
    return json({ ok: true, ...summary, summaries });
  } catch (error) {
    log.error("cron_reminders_failed", error);
    return json({ ok: false }, 500);
  }
}
