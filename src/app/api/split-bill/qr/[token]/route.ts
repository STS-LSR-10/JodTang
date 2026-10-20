import { qrPng } from "@/lib/qr";
import { promptPayPayload } from "@/lib/promptpay";
import { getPaymentByLine, shareByToken } from "@/lib/split-bill-repo";
import { getAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/split-bill/qr/<token>.png — the PromptPay QR of ONE person's share of a bill (the amount is
 * inside the code). No sign-in: LINE fetches the picture for the chat. The only key is the random token
 * of that share, which nobody can guess; it names no phone number, and an unknown or cancelled token
 * is just a 404.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token: raw } = await context.params;
  const token = raw.replace(/\.png$/i, "");
  if (!UUID.test(token)) return new Response("not found", { status: 404 });
  try {
    const db = getAdminClient();
    const share = await shareByToken(db, token);
    if (!share || share.status === "cancelled" || share.status === "joining") {
      return new Response("not found", { status: 404 });
    }
    const payment = await getPaymentByLine(db, share.payerLineUserId);
    if (!payment?.promptpayId) return new Response("not found", { status: 404 });
    const png = qrPng(
      promptPayPayload({ id: payment.promptpayId, amountSatang: share.shareSatang }),
    );
    return new Response(png as BodyInit, {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=600" },
    });
  } catch (error) {
    log.error("split_bill_qr_failed", error);
    return new Response("error", { status: 500 });
  }
}
