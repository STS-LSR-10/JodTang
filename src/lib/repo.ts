import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryLite, MemoryLite } from "@/lib/categorize/rules";
import { satangToString, toSatang } from "@/lib/money";
import type { BudgetCycle, ConfirmStyle, TxType } from "@/lib/types";

export interface UserRow {
  id: string;
  line_user_id: string;
  display_name: string | null;
}

export interface SettingsRow {
  budget_cycle: BudgetCycle;
  cycle_start_day: number;
  confirm_style: ConfirmStyle;
}

export interface TxRow {
  id: string;
  type: TxType;
  title: string;
  amount: number | string;
  category_id: string | null;
  occurred_at: string;
  status: "confirmed" | "pending_confirm" | "deleted";
}

const DEFAULT_SETTINGS: SettingsRow = {
  budget_cycle: "monthly",
  cycle_start_day: 1,
  confirm_style: "full",
};

const TX_COLUMNS = "id,type,title,amount,category_id,occurred_at,status";

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

export function txAmountSatang(tx: Pick<TxRow, "amount">): number {
  return toSatang(tx.amount);
}

export async function ensureUser(
  db: SupabaseClient,
  lineUserId: string,
  loadProfile: () => Promise<{ displayName?: string; pictureUrl?: string } | null>,
): Promise<UserRow> {
  const select = "id,line_user_id,display_name";
  const found = await db.from("users").select(select).eq("line_user_id", lineUserId).maybeSingle();
  if (found.error) fail("load user", found.error);
  if (found.data) return found.data as UserRow;

  const profile = await loadProfile().catch(() => null);
  const inserted = await db
    .from("users")
    .insert({
      line_user_id: lineUserId,
      display_name: profile?.displayName ?? null,
      picture_url: profile?.pictureUrl ?? null,
    })
    .select(select)
    .single();

  let user = inserted.data as UserRow | null;
  if (inserted.error) {
    // Lost a race with a concurrent event: read the winner's row.
    const retry = await db.from("users").select(select).eq("line_user_id", lineUserId).single();
    if (retry.error) fail("create user", inserted.error);
    user = retry.data as UserRow;
  }
  if (!user) throw new Error("create user: no row returned");

  const settings = await db
    .from("user_settings")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (settings.error) fail("create settings", settings.error);
  return user;
}

export async function getSettings(db: SupabaseClient, userId: string): Promise<SettingsRow> {
  const { data, error } = await db
    .from("user_settings")
    .select("budget_cycle,cycle_start_day,confirm_style")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("load settings", error);
  return (data as SettingsRow | null) ?? DEFAULT_SETTINGS;
}

export async function loadCategories(db: SupabaseClient, userId: string): Promise<CategoryLite[]> {
  const { data, error } = await db
    .from("categories")
    .select("id,user_id,type,name,keywords,sort_order,is_hidden")
    .or(`user_id.is.null,user_id.eq.${userId}`);
  if (error) fail("load categories", error);
  return (data ?? []) as CategoryLite[];
}

export async function loadMemory(db: SupabaseClient, userId: string): Promise<MemoryLite[]> {
  const { data, error } = await db
    .from("merchant_memory")
    .select("match_text,category_id")
    .eq("user_id", userId);
  if (error) fail("load memory", error);
  return (data ?? []) as MemoryLite[];
}

export async function insertTransaction(
  db: SupabaseClient,
  input: {
    userId: string;
    type: TxType;
    title: string;
    amountSatang: number;
    categoryId: string | null;
    occurredAt: Date;
    status: "confirmed" | "pending_confirm";
    rawText: string;
  },
): Promise<TxRow> {
  const { data, error } = await db
    .from("transactions")
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      amount: satangToString(input.amountSatang),
      category_id: input.categoryId,
      occurred_at: input.occurredAt.toISOString(),
      source: "text",
      status: input.status,
      raw_text: input.rawText,
    })
    .select(TX_COLUMNS)
    .single();
  if (error) fail("insert transaction", error);
  return data as TxRow;
}

export async function getTransaction(
  db: SupabaseClient,
  userId: string,
  txId: string,
): Promise<TxRow | null> {
  const { data, error } = await db
    .from("transactions")
    .select(TX_COLUMNS)
    .eq("id", txId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("load transaction", error);
  return (data as TxRow | null) ?? null;
}

export async function getLatestConfirmed(
  db: SupabaseClient,
  userId: string,
): Promise<TxRow | null> {
  const { data, error } = await db
    .from("transactions")
    .select(TX_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("load latest transaction", error);
  return (data as TxRow | null) ?? null;
}

export async function updateTransaction(
  db: SupabaseClient,
  userId: string,
  txId: string,
  patch: Partial<{
    type: TxType;
    amountSatang: number;
    categoryId: string | null;
    status: "confirmed" | "deleted";
  }>,
): Promise<TxRow | null> {
  const row: Record<string, unknown> = {};
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.amountSatang !== undefined) row.amount = satangToString(patch.amountSatang);
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
  if (patch.status !== undefined) row.status = patch.status;

  const { data, error } = await db
    .from("transactions")
    .update(row)
    .eq("id", txId)
    .eq("user_id", userId)
    .neq("status", "deleted")
    .select(TX_COLUMNS)
    .maybeSingle();
  if (error) fail("update transaction", error);
  return (data as TxRow | null) ?? null;
}

export async function categoryTotalSatang(
  db: SupabaseClient,
  input: { userId: string; categoryId: string; type: TxType; from: Date; to: Date },
): Promise<number> {
  const { data, error } = await db
    .from("transactions")
    .select("amount")
    .eq("user_id", input.userId)
    .eq("status", "confirmed")
    .eq("type", input.type)
    .eq("category_id", input.categoryId)
    .gte("occurred_at", input.from.toISOString())
    .lt("occurred_at", input.to.toISOString());
  if (error) fail("sum category", error);
  return (data ?? []).reduce(
    (sum, r) => sum + toSatang((r as { amount: number | string }).amount),
    0,
  );
}

export async function periodSummary(
  db: SupabaseClient,
  input: { userId: string; from: Date; to: Date },
): Promise<{ incomeSatang: number; expenseSatang: number; count: number }> {
  const { data, error } = await db.rpc("summary_by_period", {
    p_user: input.userId,
    p_from: input.from.toISOString(),
    p_to: input.to.toISOString(),
  });
  if (error) fail("summary", error);
  const row = (Array.isArray(data) ? data[0] : data) as
    { income: number | string; expense: number | string; tx_count: number | string } | undefined;
  return {
    incomeSatang: row ? toSatang(row.income) : 0,
    expenseSatang: row ? toSatang(row.expense) : 0,
    count: row ? Number(row.tx_count) : 0,
  };
}

/** Claim a webhook event. Returns false when it was already processed (duplicate/redelivery). */
export async function claimEvent(db: SupabaseClient, eventId: string): Promise<boolean> {
  const { data, error } = await db
    .from("line_events")
    .upsert({ event_id: eventId }, { onConflict: "event_id", ignoreDuplicates: true })
    .select("event_id");
  if (error) fail("claim event", error);
  return (data ?? []).length > 0;
}

/** Release a claim so a LINE redelivery can retry after a processing failure. */
export async function releaseEvent(db: SupabaseClient, eventId: string): Promise<void> {
  await db.from("line_events").delete().eq("event_id", eventId);
}
