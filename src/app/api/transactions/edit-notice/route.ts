import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env";
import { createLineClient } from "@/lib/line/client";
import { editedCardFor } from "@/lib/line/handlers";
import { log } from "@/lib/log";
import { LIMITS, limitOr429 } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transactions/edit-notice — push the "แก้ไขรายการสำเร็จ" card for the entry just edited.
 * The editor page calls it only when it could not send "แก้ไขเสร็จแล้ว" into the chat itself.
 */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const db = getAdminClient();
    const limited = await limitOr429(db, "write", auth.userId, LIMITS.write);
    if (limited) return limited;

    const card = await editedCardFor(
      {
        id: auth.userId,
        line_user_id: auth.lineUserId,
        display_name: null,
        plan: "free",
        plan_expires_at: null,
      },
      {
        db,
        reply: async () => undefined,
        getProfile: async () => null,
        now: () => new Date(),
      },
    );
    if (!card) return apiError("ไม่พบรายการที่เพิ่งแก้ไข", 404);

    try {
      await createLineClient(getServerEnv().LINE_CHANNEL_ACCESS_TOKEN).push(auth.lineUserId, [
        card,
      ]);
    } catch (error) {
      log.error("edit_notice_push_failed", error);
      return apiError("ส่งการ์ดเข้าแชทไม่สำเร็จ", 502);
    }
    return json({ ok: true });
  });
}
