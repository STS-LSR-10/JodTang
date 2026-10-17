import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getPaymentProvider } from "@/lib/payments";
import { loadBillingState } from "@/lib/payments/billing-state";
import { planAction } from "@/lib/payments/policy";
import { LIMITS, limitOr429 } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  plan: z.enum(["plus", "ultimate"]).default("plus"),
  period: z.enum(["monthly", "yearly"]).default("monthly"),
  /** card = auto-renewing subscription, promptpay = one prepaid period */
  method: z.enum(["card", "promptpay"]).default("card"),
});

/** POST /api/plan/checkout — starts an upgrade. Answers { available:false } until Stripe is set up. */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const db = getAdminClient();
    const limited = await limitOr429(db, "write", auth.userId, LIMITS.write);
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return apiError("ข้อมูลไม่ถูกต้อง", 400);

    const state = await loadBillingState(db, auth.userId);
    const action = planAction(state, parsed.data);
    if (action.kind === "blocked") {
      return json(
        { available: false, message: action.message, manage: action.manage === true },
        409,
      );
    }
    if (action.kind === "change") {
      // A running card subscription is changed (difference only), never paid for a second time.
      return json(
        { available: false, message: "ใช้ปุ่มอัปเกรดแผนเพื่อเปลี่ยนแผนที่สมัครไว้", change: true },
        409,
      );
    }
    const result = await getPaymentProvider().createCheckout({
      userId: auth.userId,
      ...parsed.data,
      customerId: state.customerId,
    });
    if (result.status === "unavailable") return json({ available: false, message: result.message });
    return json({ available: true, url: result.url, reference: result.reference });
  });
}
