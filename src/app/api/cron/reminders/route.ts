import { json } from "@/lib/api";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getServerEnv } from "@/lib/env";
import { createLineClient } from "@/lib/line/client";
import { runReminders } from "@/lib/reminder-run";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly: push the daily "you have not recorded today" nudge (Plus).
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
    const summary = await runReminders(getAdminClient(), line.push, new Date());
    return json({ ok: true, ...summary });
  } catch (error) {
    console.error("cron reminders failed:", error instanceof Error ? error.message : "unknown");
    return json({ ok: false }, 500);
  }
}
