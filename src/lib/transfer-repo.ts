import type { SupabaseClient } from "@supabase/supabase-js";
import { satangToString, toSatang } from "@/lib/money";
import type { TransferDto } from "@/lib/transfer";
import { listWallets } from "@/lib/wallet-repo";

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

interface TransferRow {
  id: string;
  from_account: string | null;
  to_account: string | null;
  amount: number | string;
  occurred_at: string;
  note: string | null;
}

export async function createTransfer(
  db: SupabaseClient,
  userId: string,
  input: {
    fromId: string;
    toId: string;
    amountSatang: number;
    occurredAt: Date;
    note?: string | null;
  },
): Promise<string> {
  const { data, error } = await db
    .from("transfers")
    .insert({
      user_id: userId,
      from_account: input.fromId,
      to_account: input.toId,
      amount: satangToString(input.amountSatang),
      occurred_at: input.occurredAt.toISOString(),
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error) fail("create transfer", error);
  return (data as { id: string }).id;
}

/** The newest transfers first, with the wallet names filled in ("no wallet" = the main wallet). */
export async function listTransfers(
  db: SupabaseClient,
  userId: string,
  limit = 20,
): Promise<TransferDto[]> {
  const [{ data, error }, wallets] = await Promise.all([
    db
      .from("transfers")
      .select("id,from_account,to_account,amount,occurred_at,note")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(limit),
    listWallets(db, userId),
  ]);
  if (error) fail("list transfers", error);
  const main = wallets.find((w) => w.isDefault);
  const nameOf = (id: string | null) =>
    (id ? wallets.find((w) => w.id === id)?.name : undefined) ?? main?.name ?? "เงินสด";
  return ((data ?? []) as TransferRow[]).map((r) => ({
    id: r.id,
    fromId: r.from_account,
    fromName: nameOf(r.from_account),
    toId: r.to_account,
    toName: nameOf(r.to_account),
    amountSatang: toSatang(r.amount),
    occurredAt: r.occurred_at,
    note: r.note,
  }));
}

/** Returns false if the transfer is not theirs (or already gone). */
export async function deleteTransfer(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("transfers")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) fail("delete transfer", error);
  return data !== null;
}

export async function getTransfer(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<TransferRow | null> {
  const { data, error } = await db
    .from("transfers")
    .select("id,from_account,to_account,amount,occurred_at,note")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("get transfer", error);
  return (data as TransferRow | null) ?? null;
}
