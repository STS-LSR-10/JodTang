import type { SupabaseClient } from "@supabase/supabase-js";
import { satangToString, toSatang } from "@/lib/money";
import { DEFAULT_WALLET_NAME, type Wallet, type WalletKind } from "@/lib/wallet";

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

interface BalanceRow {
  id: string;
  name: string;
  kind: WalletKind;
  is_default: boolean;
  opening_balance: number | string;
  income: number | string;
  expense: number | string;
  tx_count: number | string;
  transfer_in: number | string;
  transfer_out: number | string;
}

/** Every wallet of the person with its totals (the main wallet first). Empty if none was made yet. */
export async function listWallets(db: SupabaseClient, userId: string): Promise<Wallet[]> {
  const { data, error } = await db.rpc("wallet_balances", { p_user: userId });
  if (error) fail("list wallets", error);
  return ((data ?? []) as BalanceRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    isDefault: r.is_default,
    openingSatang: toSatang(r.opening_balance),
    incomeSatang: toSatang(r.income),
    expenseSatang: toSatang(r.expense),
    transferInSatang: toSatang(r.transfer_in ?? 0),
    transferOutSatang: toSatang(r.transfer_out ?? 0),
    entryCount: Number(r.tx_count),
  }));
}

/**
 * The person's wallets, with the main wallet made on first use: entries with no wallet already
 * belong to it, so nothing has to be moved. Safe to call at any time.
 */
export async function ensureWallets(db: SupabaseClient, userId: string): Promise<Wallet[]> {
  const wallets = await listWallets(db, userId);
  if (wallets.some((w) => w.isDefault)) return wallets;

  if (wallets.length > 0) {
    // wallets but no main one (should not happen): the oldest becomes the main wallet
    const first = wallets[0];
    if (first) {
      const { error } = await db
        .from("accounts")
        .update({ is_default: true })
        .eq("id", first.id)
        .eq("user_id", userId);
      if (error) fail("promote main wallet", error);
    }
    return listWallets(db, userId);
  }

  const { error } = await db
    .from("accounts")
    .insert({ user_id: userId, name: DEFAULT_WALLET_NAME, kind: "cash", is_default: true });
  // a concurrent request may have made it first: the unique indexes turn that into a harmless error
  if (error && error.code !== "23505") fail("create main wallet", error);
  return listWallets(db, userId);
}

export interface WalletInput {
  name: string;
  kind: WalletKind;
  openingSatang: number;
  makeDefault?: boolean;
}

/**
 * Another wallet is about to become the main one. Entries with no wallet follow the main wallet,
 * so they are first pinned to the one that is main now; otherwise changing the main wallet would
 * quietly move everyone's old entries (and balances) with it.
 */
async function clearDefault(db: SupabaseClient, userId: string): Promise<void> {
  const current = await db
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (current.error) fail("find main wallet", current.error);
  const oldId = (current.data as { id: string } | null)?.id;
  if (oldId) {
    const pinned = await db
      .from("transactions")
      .update({ account_id: oldId })
      .eq("user_id", userId)
      .is("account_id", null);
    if (pinned.error) fail("pin entries to the old main wallet", pinned.error);
    // transfers left pointing at "no wallet" (a deleted wallet) follow the main wallet the same way
    for (const column of ["from_account", "to_account"]) {
      const moved = await db
        .from("transfers")
        .update({ [column]: oldId })
        .eq("user_id", userId)
        .is(column, null);
      if (moved.error) fail("pin transfers to the old main wallet", moved.error);
    }
  }
  const { error } = await db
    .from("accounts")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);
  if (error) fail("clear main wallet", error);
}

/** Returns the new id, or "duplicate" when the name is already used. */
export async function createWallet(
  db: SupabaseClient,
  userId: string,
  input: WalletInput,
): Promise<string | "duplicate"> {
  if (input.makeDefault) await clearDefault(db, userId);
  const { data, error } = await db
    .from("accounts")
    .insert({
      user_id: userId,
      name: input.name,
      kind: input.kind,
      opening_balance: satangToString(input.openingSatang),
      is_default: input.makeDefault === true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return "duplicate";
    fail("create wallet", error);
  }
  return (data as { id: string }).id;
}

export type WalletPatch = Partial<WalletInput>;

/** Returns "duplicate" when the new name is taken, otherwise "ok". */
export async function updateWallet(
  db: SupabaseClient,
  userId: string,
  id: string,
  patch: WalletPatch,
): Promise<"ok" | "duplicate"> {
  if (patch.makeDefault) await clearDefault(db, userId);
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.openingSatang !== undefined) row.opening_balance = satangToString(patch.openingSatang);
  if (patch.makeDefault) row.is_default = true;
  if (Object.keys(row).length === 0) return "ok";
  const { error } = await db.from("accounts").update(row).eq("id", id).eq("user_id", userId);
  if (error) {
    if (error.code === "23505") return "duplicate";
    fail("update wallet", error);
  }
  return "ok";
}

/** Entries of the wallet stay (they fall back to the main wallet through the foreign key). */
export async function deleteWallet(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from("accounts").delete().eq("id", id).eq("user_id", userId);
  if (error) fail("delete wallet", error);
}

/** Point an entry at a wallet (or at none = the main wallet). Returns false if it is not theirs. */
export async function setEntryWallet(
  db: SupabaseClient,
  userId: string,
  txId: string,
  walletId: string | null,
): Promise<boolean> {
  const { data, error } = await db
    .from("transactions")
    .update({ account_id: walletId })
    .eq("id", txId)
    .eq("user_id", userId)
    .neq("status", "deleted")
    .select("id")
    .maybeSingle();
  if (error) fail("move entry to wallet", error);
  return data !== null;
}
