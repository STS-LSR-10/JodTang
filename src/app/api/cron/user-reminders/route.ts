import { json } from "@/lib/api";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getServerEnv } from "@/lib/env";
import { createLineClient } from "@/lib/line/client";
import { log } from "@/lib/log";
import { getAdminClient } from "@/lib/supabase/admin";
import { runUserReminders } from "@/lib/user-reminder-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every 5 minutes: push the reminders people set with "เตือน …" that are due.
 * Triggered by GitHub Actions (.github/workflows/cron-reminders.yml);
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
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    const summary = await runUserReminders(
      getAdminClient(),
      line.push,
      new Date(),
      liffId ? `https://liff.line.me/${liffId}/reminders` : undefined,
    );
    return json({ ok: true, ...summary });
  } catch (error) {
    log.error("cron_user_reminders_failed", error);
    return json({ ok: false }, 500);
  }
}
