import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getTransaction } from "@/lib/repo";
import { getSlip, SLIP_BUCKET } from "@/lib/slip-repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL_TTL_SECONDS = 60;

/** GET /api/transactions/:id/slip — a short-lived signed URL for the attached slip image. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError("ไม่พบรายการนี้", 404);

    const db = getAdminClient();
    // Both lookups are scoped to the session's user, so other users' ids match nothing.
    const tx = await getTransaction(db, auth.userId, id);
    if (!tx || tx.status === "deleted" || !tx.slip_id)
      return apiError("ไม่พบสลิปของรายการนี้", 404);
    const slip = await getSlip(db, auth.userId, tx.slip_id);
    if (!slip) return apiError("ไม่พบสลิปของรายการนี้", 404);

    const signed = await db.storage
      .from(SLIP_BUCKET)
      .createSignedUrl(slip.storage_path, URL_TTL_SECONDS);
    if (signed.error || !signed.data) throw new Error("sign slip url failed");
    return json({ url: signed.data.signedUrl, expiresIn: URL_TTL_SECONDS });
  });
}
