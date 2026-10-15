import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { updateTransaction } from "@/lib/repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/transactions/:id — soft delete (status = deleted). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError("ไม่พบรายการนี้", 404);

    // The update is scoped by user_id, so another user's id simply matches nothing.
    const deleted = await updateTransaction(getAdminClient(), auth.userId, id, {
      status: "deleted",
    });
    if (!deleted) return apiError("ไม่พบรายการนี้", 404);
    return json({ ok: true });
  });
}
