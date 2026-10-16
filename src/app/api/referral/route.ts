import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { REFERRAL_BONUS_REFEREE, REFERRAL_WINDOW_DAYS } from "@/lib/config";
import { applyReferralCode, type ReferralOutcome } from "@/lib/points";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().trim().min(4).max(16) });

const REFERRAL_MESSAGES: Record<Exclude<ReferralOutcome, "ok">, string> = {
  invalid: "ไม่พบรหัสชวนเพื่อนนี้ ตรวจตัวอักษรอีกครั้งนะ",
  self: "ใช้รหัสของตัวเองไม่ได้นะ",
  already: "คุณใช้รหัสชวนเพื่อนไปแล้ว",
  expired: `ใช้รหัสได้ภายใน ${REFERRAL_WINDOW_DAYS} วันแรกหลังเริ่มใช้งานเท่านั้นนะ`,
};

/** POST /api/referral { code } — attach a referrer. Bonuses are paid at the first entry. */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("กรอกรหัสชวนเพื่อนให้ถูกต้องนะ", 400);

    const outcome = await applyReferralCode(getAdminClient(), auth.userId, parsed.data.code);
    if (outcome !== "ok") return apiError(REFERRAL_MESSAGES[outcome], 400);
    return json({
      ok: true,
      message: `ใช้รหัสแล้ว! พอจดรายการแรกจะได้โบนัส ${REFERRAL_BONUS_REFEREE} แต้มทั้งสองฝ่าย`,
    });
  });
}
