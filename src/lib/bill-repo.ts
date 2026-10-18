import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillCadence, BillDto } from "@/lib/bill";
import { satangToString, toSatang } from "@/lib/money";

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

const COLUMNS =
  "id,name,amount,cadence,day_of_month,month_of_year,next_due_on,remind_days,remind_hour,snoozed_on,note,is_active";

interface Row {
  id: string;
  name: string;
  amount: number | string | null;
  cadence: BillCadence;
  day_of_month: number;
  month_of_year: number | null;
  next_due_on: string;
  remind_days: number[];
  remind_hour: number;
  snoozed_on: string | null;
  note: string | null;
  is_active: boolean;
}

const toDto = (r: Row): BillDto => ({
  id: r.id,
  name: r.name,
  amountSatang: r.amount === null ? null : toSatang(r.amount),
  cadence: r.cadence,
  dayOfMonth: r.day_of_month,
  monthOfYear: r.month_of_year,
  nextDueOn: r.next_due_on,
  remindDays: r.remind_days,
  remindHour: r.remind_hour,
  snoozedOn: r.snoozed_on,
  note: r.note,
  isActive: r.is_active,
});

/** The person's live bills, soonest due first. */
export async function listBills(db: SupabaseClient, userId: string): Promise<BillDto[]> {
  const { data, error } = await db
    .from("bills")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("next_due_on", { ascending: true });
  if (error) fail("list bills", error);
  return ((data ?? []) as Row[]).map(toDto);
}

/** Live bills of several people at once (for the reminder job), grouped by user id. */
export async function listBillsForUsers(
  db: SupabaseClient,
  userIds: string[],
): Promise<Map<string, BillDto[]>> {
  const out = new Map<string, BillDto[]>();
  if (userIds.length === 0) return out;
  const { data, error } = await db
    .from("bills")
    .select(`user_id,${COLUMNS}`)
    .in("user_id", userIds)
    .eq("is_active", true);
  if (error) fail("list bills for users", error);
  for (const r of (data ?? []) as (Row & { user_id: string })[]) {
    const list = out.get(r.user_id) ?? [];
    list.push(toDto(r));
    out.set(r.user_id, list);
  }
  return out;
}

export interface BillInput {
  name: string;
  amountSatang: number | null;
  cadence: BillCadence;
  dayOfMonth: number;
  monthOfYear: number | null;
  nextDueOn: string;
  remindDays: number[];
  remindHour: number;
  note?: string | null;
}

/** Returns the new id, or "duplicate" when a live bill already has that name. */
export async function createBill(
  db: SupabaseClient,
  userId: string,
  input: BillInput,
): Promise<string | "duplicate"> {
  const { data, error } = await db
    .from("bills")
    .insert({
      user_id: userId,
      name: input.name,
      amount: input.amountSatang === null ? null : satangToString(input.amountSatang),
      cadence: input.cadence,
      day_of_month: input.dayOfMonth,
      month_of_year: input.monthOfYear,
      next_due_on: input.nextDueOn,
      remind_days: input.remindDays,
      remind_hour: input.remindHour,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return "duplicate";
    fail("create bill", error);
  }
  return (data as { id: string }).id;
}

export type BillPatch = Partial<BillInput> & { isActive?: boolean; snoozedOn?: string | null };

/** "ok", "duplicate" (name taken) or "missing" (not theirs). */
export async function updateBill(
  db: SupabaseClient,
  userId: string,
  id: string,
  patch: BillPatch,
): Promise<"ok" | "duplicate" | "missing"> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.amountSatang !== undefined) {
    row.amount = patch.amountSatang === null ? null : satangToString(patch.amountSatang);
  }
  if (patch.cadence !== undefined) row.cadence = patch.cadence;
  if (patch.dayOfMonth !== undefined) row.day_of_month = patch.dayOfMonth;
  if (patch.monthOfYear !== undefined) row.month_of_year = patch.monthOfYear;
  if (patch.nextDueOn !== undefined) row.next_due_on = patch.nextDueOn;
  if (patch.remindDays !== undefined) row.remind_days = patch.remindDays;
  if (patch.remindHour !== undefined) row.remind_hour = patch.remindHour;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.snoozedOn !== undefined) row.snoozed_on = patch.snoozedOn;
  if (Object.keys(row).length === 0) return "ok";
  const { data, error } = await db
    .from("bills")
    .update(row)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return "duplicate";
    fail("update bill", error);
  }
  return data ? "ok" : "missing";
}

export async function deleteBill(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data, error } = await db
    .from("bills")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) fail("delete bill", error);
  return data !== null;
}

/** Which of these reminders were already sent to the people (keys are per user). */
export async function sentKeysForUsers(
  db: SupabaseClient,
  userIds: string[],
  since: Date,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (userIds.length === 0) return out;
  const { data, error } = await db
    .from("bill_reminders")
    .select("user_id,key")
    .in("user_id", userIds)
    .gte("sent_at", since.toISOString());
  if (error) fail("load sent reminders", error);
  for (const r of (data ?? []) as { user_id: string; key: string }[]) {
    const set = out.get(r.user_id) ?? new Set<string>();
    set.add(r.key);
    out.set(r.user_id, set);
  }
  return out;
}

/** Mark a reminder as sent before sending it. False when it was already marked (nothing to send). */
export async function claimReminder(
  db: SupabaseClient,
  userId: string,
  key: string,
): Promise<boolean> {
  const { error } = await db.from("bill_reminders").insert({ user_id: userId, key });
  if (error) {
    if (error.code === "23505") return false;
    fail("claim reminder", error);
  }
  return true;
}

/** Forget reminders sent a long time ago. */
export async function pruneReminders(db: SupabaseClient, before: Date): Promise<void> {
  const { error } = await db.from("bill_reminders").delete().lt("sent_at", before.toISOString());
  if (error) fail("prune reminders", error);
}

/** One bill of the person, switched off or not (a finished one-off bill can still be looked at). */
export async function getBill(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<BillDto | null> {
  const { data, error } = await db
    .from("bills")
    .select(COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("get bill", error);
  return data ? toDto(data as Row) : null;
}
