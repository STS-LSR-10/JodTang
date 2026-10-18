import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env";
import { createLineClient } from "@/lib/line/client";
import { log } from "@/lib/log";
import { RESET_DELAY_HOURS, resetEffectiveAt } from "@/lib/pin";
import { getSecurity, setResetRequested } from "@/lib/pin-repo";
import { LIMITS, limitOr429 } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { formatThaiDate } from "@/lib/thai-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pin/reset — "forgot my PIN". It does not remove the PIN now: it starts a 24 hour wait and
 * tells the owner in the LINE chat (with a button to cancel), so somebody holding the phone cannot
 * simply wipe the lock. After 24 hours the PIN is gone.
 */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request, { allowLocked: true });
    if (auth instanceof Response) return auth;
    const db = getAdminClient();
    const limited = await limitOr429(db, "pin_change", auth.userId, LIMITS.pinChange);
    if (limited) return limited;

    const now = new Date();
    const sec = await getSecurity(db, auth.userId, now);
    if (!sec.hasPin) return json({ ok: true, resetAt: null });
    if (sec.resetRequestedAt) {
      return json({ ok: true, resetAt: resetEffectiveAt(sec.resetRequestedAt).toISOString() });
    }

    await setResetRequested(db, auth.userId, now);
    const resetAt = resetEffectiveAt(now);
    try {
      await createLineClient(getServerEnv().LINE_CHANNEL_ACCESS_TOKEN).push(auth.lineUserId, [
        {
          type: "text",
          text: `มีคำขอลบ PIN ของจดตังค์ (ลืม PIN) จะมีผลใน ${RESET_DELAY_HOURS} ชั่วโมง คือ ${formatThaiDate(resetAt, true)}\nถ้าไม่ใช่คุณที่ขอ กดยกเลิกด้านล่างได้เลย`,
          quickReply: {
            items: [
              {
                type: "action",
                action: {
                  type: "postback",
                  label: "ยกเลิกคำขอ",
                  data: "a=pinx",
                  displayText: "ยกเลิกคำขอลบ PIN",
                },
              },
            ],
          },
        },
      ]);
    } catch (error) {
      // the request stands; the wait protects them only if they can be told, so say so
      log.error("pin_reset_notice_failed", error);
      await setResetRequested(db, auth.userId, null);
      return apiError(
        "ส่งแจ้งเตือนไปที่แชท LINE ไม่สำเร็จ เลยยังไม่ได้เริ่มขั้นตอน ลองใหม่อีกครั้งนะ",
        502,
      );
    }
    return json({ ok: true, resetAt: resetAt.toISOString() });
  });
}

/** DELETE /api/pin/reset — cancel the request. */
export async function DELETE(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request, { allowLocked: true });
    if (auth instanceof Response) return auth;
    await setResetRequested(getAdminClient(), auth.userId, null);
    return json({ ok: true });
  });
}
