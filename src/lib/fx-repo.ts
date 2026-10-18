import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRate, type FxRate } from "@/lib/fx";
import { log } from "@/lib/log";

export interface ResolvedRate extends FxRate {
  /** True when the source did not answer and an older cached rate was used. */
  stale: boolean;
}

const MAX_STALE_DAYS = 7;

const addDays = (day: string, delta: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

/**
 * The baht price of one unit of `currency` for `day` (a Bangkok date, YYYY-MM-DD):
 * the cached rate if there is one, else the source's (cached for next time). A day that is today or
 * later asks for the latest rate. When the source is down, the newest cached rate of the last 7 days
 * is used and marked stale; with none, null.
 */
export async function getRate(
  db: SupabaseClient,
  currency: string,
  day: string,
  today: string,
  fetchFn: typeof fetch = fetch,
): Promise<ResolvedRate | null> {
  const cached = await db
    .from("fx_rates")
    .select("rate,source_day")
    .eq("day", day)
    .eq("currency", currency)
    .maybeSingle();
  if (cached.error) log.error("fx_cache_read_failed", cached.error);
  const hit = cached.data as { rate: number | string; source_day: string } | null;
  if (hit) return { rate: Number(hit.rate), sourceDay: hit.source_day, stale: false };

  const fresh = await fetchRate(currency, day >= today ? "latest" : day, fetchFn);
  if (fresh) {
    const saved = await db.from("fx_rates").upsert({
      day,
      currency,
      rate: fresh.rate,
      source_day: fresh.sourceDay,
    });
    if (saved.error) log.error("fx_cache_write_failed", saved.error);
    return { ...fresh, stale: false };
  }

  const older = await db
    .from("fx_rates")
    .select("rate,source_day")
    .eq("currency", currency)
    .lte("day", day)
    .gte("day", addDays(day, -MAX_STALE_DAYS))
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = older.data as { rate: number | string; source_day: string } | null;
  return row ? { rate: Number(row.rate), sourceDay: row.source_day, stale: true } : null;
}
