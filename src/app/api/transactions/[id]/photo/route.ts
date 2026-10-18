import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { clearPhoto, getPhotoTx } from "@/lib/photo-repo";
import { SLIP_BUCKET } from "@/lib/slip-repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL_TTL_SECONDS = 60;

async function ownPhoto(request: Request, params: Promise<{ id: string }>) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError("ไม่พบรายการนี้", 404);
  const db = getAdminClient();
  // scoped to the session's user: other users' ids match nothing
  const tx = await getPhotoTx(db, auth.userId, id);
  if (!tx?.photo_path) return apiError("ไม่พบรูปของรายการนี้", 404);
  return { db, userId: auth.userId, tx: { id: tx.id, path: tx.photo_path } };
}

/** GET /api/transactions/:id/photo — a short-lived signed URL for the photo attached to an entry. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return guard(async () => {
    const own = await ownPhoto(request, params);
    if (own instanceof Response) return own;
    const signed = await own.db.storage
      .from(SLIP_BUCKET)
      .createSignedUrl(own.tx.path, URL_TTL_SECONDS);
    if (signed.error || !signed.data) throw new Error("sign photo url failed");
    return json({ url: signed.data.signedUrl, expiresIn: URL_TTL_SECONDS });
  });
}

/** DELETE /api/transactions/:id/photo — remove the photo (the file is deleted for good). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return guard(async () => {
    const own = await ownPhoto(request, params);
    if (own instanceof Response) return own;
    const removed = await own.db.storage.from(SLIP_BUCKET).remove([own.tx.path]);
    if (removed.error) throw new Error(`remove photo: ${removed.error.message}`);
    await clearPhoto(own.db, own.userId, own.tx.id);
    return json({ ok: true });
  });
}
