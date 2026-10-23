import { guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { addFriendUrl } from "@/lib/config";
import { getServerEnv } from "@/lib/env";
import { createLineClient } from "@/lib/line/client";
import { log } from "@/lib/log";
import { can } from "@/lib/plan";
import { getPlanInfo } from "@/lib/plan-server";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/group-open — can this person open a group ledger? The "เปิดสมุดกลุ่ม" button of the welcome
 * card opens a page that asks this first: opening needs the person to be a friend of the bot (otherwise
 * LINE gives the bot no name for them) and an Ultimate member. `friend` is null when LINE could not tell.
 */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const { plan } = await getPlanInfo(getAdminClient(), auth.userId, new Date());
    let friend: boolean | null = null;
    try {
      const line = createLineClient(getServerEnv().LINE_CHANNEL_ACCESS_TOKEN);
      // LINE answers a profile only for people who are friends of the bot (and have not blocked it)
      friend = (await line.getProfile(auth.lineUserId)) !== null;
    } catch (error) {
      log.warn("group_open_friend_check_failed", {
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
    return json({ friend, plan, canOpen: can(plan, "groupLedger"), addFriendUrl: addFriendUrl() });
  });
}
