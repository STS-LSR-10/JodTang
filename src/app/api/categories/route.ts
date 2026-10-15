import { guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { loadCategories } from "@/lib/repo";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Visible categories (system defaults + the user's own), ordered for display. */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const all = await loadCategories(getAdminClient(), auth.userId);
    const items = all
      .filter((c) => !c.is_hidden)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, type: c.type, name: c.name, own: c.user_id !== null }));
    return json({ items });
  });
}
