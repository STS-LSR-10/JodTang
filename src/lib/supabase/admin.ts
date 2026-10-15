import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. SERVER ONLY (webhook, cron, API routes) — it bypasses RLS,
 * so every query must be scoped by a user id taken from a verified source.
 */
export function getAdminClient(): SupabaseClient {
  if (!cached) {
    const env = getSupabaseAdminEnv();
    cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
