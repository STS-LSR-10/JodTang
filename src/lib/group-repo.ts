import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupEntryRow, GroupRow } from "@/lib/group";
import { satangToString, toSatang } from "@/lib/money";

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

interface GroupDb {
  id: string;
  line_group_id: string;
  owner_user_id: string;
  is_active: boolean;
}
const toGroup = (r: GroupDb): GroupRow => ({
  id: r.id,
  lineGroupId: r.line_group_id,
  ownerUserId: r.owner_user_id,
  isActive: r.is_active,
});

/** The ledger of a LINE group (open or closed), or null if it was never opened. */
export async function getGroup(db: SupabaseClient, lineGroupId: string): Promise<GroupRow | null> {
  const { data, error } = await db
    .from("bot_groups")
    .select("id,line_group_id,owner_user_id,is_active")
    .eq("line_group_id", lineGroupId)
    .maybeSingle();
  if (error) fail("get group", error);
  return data ? toGroup(data as GroupDb) : null;
}

/** How many open ledgers this person owns. */
export async function countOwnedGroups(db: SupabaseClient, ownerUserId: string): Promise<number> {
  const { count, error } = await db
    .from("bot_groups")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerUserId)
    .eq("is_active", true);
  if (error) fail("count owned groups", error);
  return count ?? 0;
}

/** Open a ledger for the group, or reopen a closed one under a (new) owner. */
export async function openGroup(
  db: SupabaseClient,
  lineGroupId: string,
  ownerUserId: string,
): Promise<GroupRow> {
  const { data, error } = await db
    .from("bot_groups")
    .upsert(
      { line_group_id: lineGroupId, owner_user_id: ownerUserId, is_active: true, closed_at: null },
      { onConflict: "line_group_id" },
    )
    .select("id,line_group_id,owner_user_id,is_active")
    .single();
  if (error) fail("open group", error);
  return toGroup(data as GroupDb);
}

/** Close the ledger (the data stays). Used when the owner says so or the bot leaves the group. */
export async function closeGroup(db: SupabaseClient, lineGroupId: string): Promise<void> {
  const { error } = await db
    .from("bot_groups")
    .update({ is_active: false, closed_at: new Date().toISOString() })
    .eq("line_group_id", lineGroupId);
  if (error) fail("close group", error);
}

export async function upsertMember(
  db: SupabaseClient,
  groupId: string,
  lineUserId: string,
  displayName: string,
): Promise<void> {
  const { error } = await db.from("group_members").upsert(
    {
      group_id: groupId,
      line_user_id: lineUserId,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "group_id,line_user_id" },
  );
  if (error) fail("save member", error);
}

/** Known members of the group: LINE user id -> the name shown. */
export async function memberNames(
  db: SupabaseClient,
  groupId: string,
): Promise<Map<string, { name: string; updatedAt: string }>> {
  const { data, error } = await db
    .from("group_members")
    .select("line_user_id,display_name,updated_at")
    .eq("group_id", groupId);
  if (error) fail("load members", error);
  return new Map(
    ((data ?? []) as { line_user_id: string; display_name: string; updated_at: string }[]).map(
      (r) => [r.line_user_id, { name: r.display_name, updatedAt: r.updated_at }],
    ),
  );
}

export async function addEntries(
  db: SupabaseClient,
  groupId: string,
  payerLineUserId: string,
  entries: { title: string; amountSatang: number; occurredAt: Date; raw: string }[],
): Promise<GroupEntryRow[]> {
  const { data, error } = await db
    .from("group_entries")
    .insert(
      entries.map((e) => ({
        group_id: groupId,
        payer_line_user_id: payerLineUserId,
        title: e.title,
        amount: satangToString(e.amountSatang),
        occurred_at: e.occurredAt.toISOString(),
        raw_text: e.raw,
      })),
    )
    .select("id,payer_line_user_id,title,amount,occurred_at");
  if (error) fail("add group entries", error);
  return ((data ?? []) as EntryDb[]).map(toEntry);
}

interface EntryDb {
  id: string;
  payer_line_user_id: string;
  title: string;
  amount: number | string;
  occurred_at: string;
}
const toEntry = (r: EntryDb): GroupEntryRow => ({
  id: r.id,
  payerLineUserId: r.payer_line_user_id,
  title: r.title,
  amountSatang: toSatang(r.amount),
  occurredAt: r.occurred_at,
});

/** The newest entries (not deleted) first; `payer` limits it to one member. */
export async function recentEntries(
  db: SupabaseClient,
  groupId: string,
  limit: number,
  payer?: string,
): Promise<GroupEntryRow[]> {
  let query = db
    .from("group_entries")
    .select("id,payer_line_user_id,title,amount,occurred_at")
    .eq("group_id", groupId)
    .eq("status", "confirmed");
  if (payer) query = query.eq("payer_line_user_id", payer);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) fail("recent group entries", error);
  return ((data ?? []) as EntryDb[]).map(toEntry);
}

export async function getEntry(
  db: SupabaseClient,
  groupId: string,
  id: string,
): Promise<GroupEntryRow | null> {
  const { data, error } = await db
    .from("group_entries")
    .select("id,payer_line_user_id,title,amount,occurred_at")
    .eq("group_id", groupId)
    .eq("id", id)
    .eq("status", "confirmed")
    .maybeSingle();
  if (error) fail("get group entry", error);
  return data ? toEntry(data as EntryDb) : null;
}

export async function deleteEntry(
  db: SupabaseClient,
  groupId: string,
  id: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("group_entries")
    .update({ status: "deleted" })
    .eq("group_id", groupId)
    .eq("id", id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();
  if (error) fail("delete group entry", error);
  return data !== null;
}

/** What each member paid between two moments, biggest first. */
export async function payerTotals(
  db: SupabaseClient,
  groupId: string,
  from: Date,
  to: Date,
): Promise<{ lineUserId: string; totalSatang: number; entries: number }[]> {
  const { data, error } = await db.rpc("group_payer_totals", {
    p_group: groupId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) fail("group payer totals", error);
  return (
    (data ?? []) as {
      payer_line_user_id: string;
      total: number | string;
      entries: number | string;
    }[]
  ).map((r) => ({
    lineUserId: r.payer_line_user_id,
    totalSatang: toSatang(r.total),
    entries: Number(r.entries),
  }));
}

/** Entries written to the group since `since` (for the daily cap). */
export async function countEntriesSince(
  db: SupabaseClient,
  groupId: string,
  since: Date,
): Promise<number> {
  const { count, error } = await db
    .from("group_entries")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .gte("created_at", since.toISOString());
  if (error) fail("count group entries", error);
  return count ?? 0;
}

/** The owner of a ledger: their LINE id (to know who is asking) and plan (the ledger needs Ultimate). */
export async function getOwner(
  db: SupabaseClient,
  ownerUserId: string,
): Promise<{ lineUserId: string; plan: string; planExpiresAt: string | null } | null> {
  const { data, error } = await db
    .from("users")
    .select("line_user_id,plan,plan_expires_at")
    .eq("id", ownerUserId)
    .maybeSingle();
  if (error) fail("load group owner", error);
  const r = data as { line_user_id: string; plan: string; plan_expires_at: string | null } | null;
  return r ? { lineUserId: r.line_user_id, plan: r.plan, planExpiresAt: r.plan_expires_at } : null;
}
