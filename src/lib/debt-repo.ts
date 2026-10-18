import type { SupabaseClient } from "@supabase/supabase-js";
import { satangToString, toSatang } from "@/lib/money";
import { cleanPerson, personKey, type DebtDirection, type DebtDto } from "@/lib/debt";
import { listWallets } from "@/lib/wallet-repo";

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

interface BalanceRow {
  id: string;
  direction: DebtDirection;
  person: string;
  amount: number | string;
  account_id: string | null;
  occurred_at: string;
  due_at: string | null;
  note: string | null;
  paid: number | string;
  remaining: number | string;
}

/** Every debt of the person (open ones first), with the wallet name filled in. */
export async function listDebts(db: SupabaseClient, userId: string): Promise<DebtDto[]> {
  const [{ data, error }, wallets] = await Promise.all([
    db.rpc("debt_balances", { p_user: userId }),
    listWallets(db, userId),
  ]);
  if (error) fail("list debts", error);
  const main = wallets.find((w) => w.isDefault);
  return ((data ?? []) as BalanceRow[]).map((r) => ({
    id: r.id,
    direction: r.direction,
    person: r.person,
    amountSatang: toSatang(r.amount),
    paidSatang: toSatang(r.paid),
    remainingSatang: toSatang(r.remaining),
    accountId: r.account_id,
    accountName:
      (r.account_id ? wallets.find((w) => w.id === r.account_id)?.name : undefined) ??
      main?.name ??
      "เงินสด",
    occurredAt: r.occurred_at,
    dueAt: r.due_at,
    note: r.note,
  }));
}

/** The open debts of one person in one direction, oldest first (the order repayments use). */
export function openDebtsOf(debts: DebtDto[], person: string, direction: DebtDirection): DebtDto[] {
  const key = personKey(person);
  return debts
    .filter(
      (d) => d.direction === direction && personKey(d.person) === key && d.remainingSatang > 0,
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export async function createDebt(
  db: SupabaseClient,
  userId: string,
  input: {
    direction: DebtDirection;
    person: string;
    amountSatang: number;
    accountId: string;
    occurredAt: Date;
    dueAt?: Date | null;
    note?: string | null;
  },
): Promise<string> {
  const { data, error } = await db
    .from("debts")
    .insert({
      user_id: userId,
      direction: input.direction,
      person: cleanPerson(input.person),
      amount: satangToString(input.amountSatang),
      account_id: input.accountId,
      occurred_at: input.occurredAt.toISOString(),
      due_at: input.dueAt?.toISOString() ?? null,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error) fail("create debt", error);
  return (data as { id: string }).id;
}

export interface DebtPatch {
  person?: string;
  amountSatang?: number;
  accountId?: string;
  dueAt?: Date | null;
  note?: string | null;
}

export async function updateDebt(
  db: SupabaseClient,
  userId: string,
  id: string,
  patch: DebtPatch,
): Promise<boolean> {
  const row: Record<string, unknown> = {};
  if (patch.person !== undefined) row.person = cleanPerson(patch.person);
  if (patch.amountSatang !== undefined) row.amount = satangToString(patch.amountSatang);
  if (patch.accountId !== undefined) row.account_id = patch.accountId;
  if (patch.dueAt !== undefined) row.due_at = patch.dueAt?.toISOString() ?? null;
  if (patch.note !== undefined) row.note = patch.note;
  if (Object.keys(row).length === 0) return true;
  const { data, error } = await db
    .from("debts")
    .update(row)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) fail("update debt", error);
  return data !== null;
}

/** Deleting a debt deletes its payments too, so the wallets go back as if it never happened. */
export async function deleteDebt(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data, error } = await db
    .from("debts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) fail("delete debt", error);
  return data !== null;
}

export interface PaymentRow {
  id: string;
  debtId: string;
  accountId: string | null;
  amountSatang: number;
  paidAt: string;
  note: string | null;
}

export async function addPayments(
  db: SupabaseClient,
  userId: string,
  parts: { debtId: string; amountSatang: number }[],
  input: { accountId: string; paidAt: Date; note?: string | null },
): Promise<string[]> {
  const { data, error } = await db
    .from("debt_payments")
    .insert(
      parts.map((p) => ({
        user_id: userId,
        debt_id: p.debtId,
        account_id: input.accountId,
        amount: satangToString(p.amountSatang),
        paid_at: input.paidAt.toISOString(),
        note: input.note ?? null,
      })),
    )
    .select("id");
  if (error) fail("add debt payments", error);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export async function deletePayments(
  db: SupabaseClient,
  userId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await db
    .from("debt_payments")
    .delete()
    .in("id", ids)
    .eq("user_id", userId)
    .select("id");
  if (error) fail("delete debt payments", error);
  return (data ?? []).length;
}

export async function listPayments(
  db: SupabaseClient,
  userId: string,
  debtId: string,
): Promise<PaymentRow[]> {
  const { data, error } = await db
    .from("debt_payments")
    .select("id,debt_id,account_id,amount,paid_at,note")
    .eq("user_id", userId)
    .eq("debt_id", debtId)
    .order("paid_at", { ascending: false });
  if (error) fail("list debt payments", error);
  return (
    (data ?? []) as {
      id: string;
      debt_id: string;
      account_id: string | null;
      amount: number | string;
      paid_at: string;
      note: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    debtId: r.debt_id,
    accountId: r.account_id,
    amountSatang: toSatang(r.amount),
    paidAt: r.paid_at,
    note: r.note,
  }));
}
