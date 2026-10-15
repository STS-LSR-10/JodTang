import { guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const { data, error } = await getAdminClient()
      .from("users")
      .select("display_name,picture_url,plan,plan_expires_at,points,referral_code")
      .eq("id", auth.userId)
      .single();
    if (error) throw new Error(`load me: ${error.message}`);

    return json({
      displayName: data.display_name,
      pictureUrl: data.picture_url,
      plan: data.plan,
      planExpiresAt: data.plan_expires_at,
      points: data.points,
      referralCode: data.referral_code,
    });
  });
}
