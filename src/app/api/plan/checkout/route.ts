import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { PERIOD_MONTHS } from "@/lib/pricing";
import { getPaymentProvider } from "@/lib/payments/stub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  plan: z.enum(["plus", "ultimate"]).default("plus"),
  period: z.enum(["monthly", "yearly"]).default("monthly"),
});

/** POST /api/plan/checkout — starts an upgrade. Payments are a stub: always "unavailable". */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return apiError("ข้อมูลไม่ถูกต้อง", 400);

    const result = await getPaymentProvider().createCheckout({
      userId: auth.userId,
      plan: parsed.data.plan,
      months: PERIOD_MONTHS[parsed.data.period],
    });
    if (result.status === "unavailable") return json({ available: false, message: result.message });
    return json({ available: true, url: result.url, reference: result.reference });
  });
}
