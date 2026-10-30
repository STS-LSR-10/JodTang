import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminClient } from "@/lib/supabase/admin";
import { cancelReminder } from "@/lib/user-reminder-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/reminders/:id — cancel a reminder. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return apiError("ไม่พบเตือนนี้", 404);
    return (await cancelReminder(getAdminClient(), auth.userId, id))
      ? json({ ok: true })
      : apiError("ไม่พบเตือนนี้", 404);
  });
}
