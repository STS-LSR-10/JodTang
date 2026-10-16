import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getPaymentProvider } from "@/lib/payments";
import { LIMITS, limitOr429 } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/plan/portal — link to the Stripe billing portal (cancel auto-renew, change card). */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const db = getAdminClient();
    const limited = await limitOr429(db, "write", auth.userId, LIMITS.write);
    if (limited) return limited;

    const { data, error } = await db
      .from("users")
      .select("stripe_customer_id")
      .eq("id", auth.userId)
      .single();
    if (error) throw new Error(`load payer: ${error.message}`);
    if (!data.stripe_customer_id) return apiError("ยังไม่มีประวัติการชำระเงิน", 404);

    const result = await getPaymentProvider().createPortal(data.stripe_customer_id);
    if (result.status === "unavailable") return json({ available: false, message: result.message });
    return json({ available: true, url: result.url });
  });
}
