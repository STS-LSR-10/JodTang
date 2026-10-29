import type { SupabaseClient } from "@supabase/supabase-js";
import { bangkokDateKey } from "@/lib/points";
import { toSatang } from "@/lib/money";
import type { TxType } from "@/lib/types";

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

/** The marker the entries of one imported file carry in `raw_text`. */
export const importRawText = (importId: string) => `pdf:${importId}`;

export async function findImport(
  db: SupabaseClient,
  userId: string,
  sha256: string,
): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("pdf_imports")
    .select("id")
    .eq("user_id", userId)
    .eq("sha256", sha256)
    .maybeSingle();
  if (error) fail("find pdf import", error);
  return data ? { id: (data as { id: string }).id } : null;
}

/** Entries of an import that still stand (waiting for the check, or recorded). */
export async function countImportEntries(
  db: SupabaseClient,
  userId: string,
  importId: string,
): Promise<number> {
  const { count, error } = await db
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("raw_text", importRawText(importId))
    .in("status", ["pending_confirm", "confirmed"]);
  if (error) fail("count import entries", error);
  return count ?? 0;
}

export async function deleteImport(db: SupabaseClient, importId: string): Promise<void> {
  const { error } = await db.from("pdf_imports").delete().eq("id", importId);
  if (error) fail("delete pdf import", error);
}

/** Remember a file by its hash. Null when the same file was already remembered (a parallel send). */
export async function createImport(
  db: SupabaseClient,
  userId: string,
  sha256: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("pdf_imports")
    .insert({ user_id: userId, sha256 })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    fail("create pdf import", error);
  }
  return (data as { id: string }).id;
}

const key = (type: TxType, satang: number, day: string) => `${type}|${satang}|${day}`;

/**
 * Keys ("type|satang|Bangkok day") of the recorded entries around the dates being imported, so an
 * entry that is already there (a slip recorded earlier, an older statement) is not recorded twice.
 */
export async function existingKeys(
  db: SupabaseClient,
  userId: string,
  dates: Date[],
): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const times = dates.map((d) => d.getTime());
  const from = new Date(Math.min(...times) - 36 * 3_600_000);
  const to = new Date(Math.max(...times) + 36 * 3_600_000);
  const { data, error } = await db
    .from("transactions")
    .select("type,amount,occurred_at")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("occurred_at", from.toISOString())
    .lte("occurred_at", to.toISOString())
    .limit(2000);
  if (error) fail("load existing entries", error);
  return new Set(
    ((data ?? []) as { type: TxType; amount: string | number; occurred_at: string }[]).map((r) =>
      key(r.type, toSatang(String(r.amount)), bangkokDateKey(new Date(r.occurred_at))),
    ),
  );
}

export const entryKey = (type: TxType, satang: number, at: Date) =>
  key(type, satang, bangkokDateKey(at));

/** Record every waiting entry of the import. Returns how many were recorded. */
export async function confirmImport(
  db: SupabaseClient,
  userId: string,
  importId: string,
): Promise<number> {
  const { data, error } = await db
    .from("transactions")
    .update({ status: "confirmed" })
    .eq("user_id", userId)
    .eq("raw_text", importRawText(importId))
    .eq("status", "pending_confirm")
    .select("id");
  if (error) fail("confirm import", error);
  return (data ?? []).length;
}

/** Drop every waiting entry of the import and forget the file, so it can be sent again. */
export async function cancelImport(
  db: SupabaseClient,
  userId: string,
  importId: string,
): Promise<number> {
  const { data, error } = await db
    .from("transactions")
    .update({ status: "deleted" })
    .eq("user_id", userId)
    .eq("raw_text", importRawText(importId))
    .eq("status", "pending_confirm")
    .select("id");
  if (error) fail("cancel import", error);
  await db.from("pdf_imports").delete().eq("id", importId).eq("user_id", userId);
  return (data ?? []).length;
}
