import { json } from "@/lib/api";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getServerEnv } from "@/lib/env";
import { runDueRules } from "@/lib/recurring-repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily: create the entries of recurring rules that are due (Vercel Cron, GET + Bearer CRON_SECRET). */
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
    console.error("cron recurring failed:", error instanceof Error ? error.message : "unknown");
    return json({ ok: false }, 500);
  }
}
