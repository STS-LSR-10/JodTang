import { json } from "@/lib/api";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getServerEnv } from "@/lib/env";
import { runDueRules } from "@/lib/recurring-repo";
import { getAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Create the entries of recurring rules that are due (called hourly by GitHub Actions, GET + Bearer
 * CRON_SECRET). Safe to call as often as you like: a rule is claimed once per due date, and a missed
 * run is caught up on the next one.
 */
export async function GET(request: Request): Promise<Response> {
  let secret: string;
  try {
    secret = getServerEnv().CRON_SECRET;
  } catch {
    return new Response("server misconfigured", { status: 500 });
  }
  if (!isCronAuthorized(request.headers.get("authorization"), secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const summary = await runDueRules(getAdminClient(), new Date());
    return json({ ok: true, ...summary });
  } catch (error) {
    log.error("cron_recurring_failed", error);
    return json({ ok: false }, 500);
  }
}
