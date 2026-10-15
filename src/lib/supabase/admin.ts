import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. SERVER ONLY (webhook, cron, API routes) — it bypasses RLS,
 * so every query must be scoped by a user id taken from a verified source.
 */
export function getAdminClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      getPublicEnv().NEXT_PUBLIC_SUPABASE_URL,
      getServerEnv().SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cached;
}
