import type { SupabaseClient } from "@supabase/supabase-js";
import { toSatang } from "@/lib/money";
import type { SummaryTx } from "@/lib/summary-report";

const MAX_ROWS = 10_000;

/** Confirmed entries in [from, to) with their category names, for `summarize`. */
export async function loadSummaryTransactions(
  db: SupabaseClient,
  userId: string,
  from: Date,
  to: Date,
): Promise<SummaryTx[]> {
  const { data, error } = await db
    .from("transactions")
    .select("occurred_at,type,amount,categories(name)")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("occurred_at", from.toISOString())
    .lt("occurred_at", to.toISOString())
    .limit(MAX_ROWS);
  if (error) throw new Error(`load summary rows: ${error.message}`);
  return (data ?? []).map((r) => {
    const cat = Array.isArray(r.categories) ? r.categories[0] : r.categories;
    return {
      occurredAt: new Date(r.occurred_at as string),
      type: r.type as "income" | "expense",
      amountSatang: toSatang(r.amount as string | number),
      categoryName: (cat as { name?: string } | null)?.name ?? null,
    };
  });
}
