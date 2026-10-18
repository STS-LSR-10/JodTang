import type { SupabaseClient } from "@supabase/supabase-js";
import { convertToSatang, formatForeign, formatRate } from "@/lib/fx";
import { getRate } from "@/lib/fx-repo";
import type { ParsedEntry } from "@/lib/parse/text-parser";
import { bangkokDateKey } from "@/lib/points";
import { FX_FAILED_TEXT, FX_TOO_SMALL_TEXT, fxUnsupportedText } from "./messages";

/**
 * Turn each foreign-currency entry into baht at the rate of its day. Returns the reason (text for the
 * user) when one cannot be converted: nothing is saved then.
 */
export async function convertForeignEntries(
  entries: ParsedEntry[],
  deps: { db: SupabaseClient; now: () => Date },
): Promise<ParsedEntry[] | string> {
  const today = bangkokDateKey(deps.now());
  const rates = new Map<string, Awaited<ReturnType<typeof getRate>>>();
  const out: ParsedEntry[] = [];
  for (const entry of entries) {
    const f = entry.foreign;
    if (!f) {
      out.push(entry);
      continue;
    }
    if (!f.supported) return fxUnsupportedText(f.currency);
    const day = bangkokDateKey(entry.occurredAt);
    const key = `${f.currency}:${day}`;
    if (!rates.has(key)) rates.set(key, await getRate(deps.db, f.currency, day, today));
    const resolved = rates.get(key);
    if (!resolved) return FX_FAILED_TEXT;
    const amountSatang = convertToSatang(f.minor, resolved.rate);
    if (amountSatang <= 0) return FX_TOO_SMALL_TEXT;
    out.push({
      ...entry,
      amountSatang,
      fx: {
        currency: f.currency,
        minor: f.minor,
        rate: resolved.rate,
        sourceDay: resolved.sourceDay,
        stale: resolved.stale,
      },
    });
  }
  return out;
}

/** "1,500 JPY @ 0.2335" (with a note when an older rate had to be used). */
export function fxNoteOf(fx: NonNullable<ParsedEntry["fx"]>): string {
  const base = `${formatForeign(fx.minor, fx.currency)} @ ${formatRate(fx.rate)}`;
  if (!fx.stale) return base;
  const [, month, day] = fx.sourceDay.split("-");
  return `${base} (อัตราของวันที่ ${Number(day)}/${Number(month)} เพราะแหล่งอัตราไม่ตอบ)`;
}
