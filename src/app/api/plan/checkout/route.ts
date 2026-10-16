import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getPaymentProvider } from "@/lib/payments";
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

    const { data: user, error } = await db
      .from("users")
      .select("stripe_customer_id,stripe_subscription_id,plan_expires_at")
      .eq("id", auth.userId)
      .single();
    if (error) throw new Error(`load payer: ${error.message}`);

    // A card subscription that is still running renews by itself: change it in the billing portal
    // instead of starting a second one.
    const running =
      user.stripe_subscription_id &&
      user.plan_expires_at &&
      new Date(user.plan_expires_at).getTime() > Date.now();
    if (running && parsed.data.method === "card") {
      return json(
        {
          available: false,
          message:
            "คุณมีแผนแบบต่ออายุอัตโนมัติอยู่แล้ว จัดการหรือยกเลิกได้ที่ปุ่ม “จัดการการชำระเงิน”",
          manage: true,
        },
        409,
      );
    }

    const result = await getPaymentProvider().createCheckout({
      userId: auth.userId,
      ...parsed.data,
      customerId: user.stripe_customer_id,
    });
    if (result.status === "unavailable") return json({ available: false, message: result.message });
    return json({ available: true, url: result.url, reference: result.reference });
  });
}
