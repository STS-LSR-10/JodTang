import type { SupabaseClient } from "@supabase/supabase-js";
import { satangToString, toSatang } from "@/lib/money";
import { DEFAULT_WALLET_NAME, ownedWallets, type Wallet, type WalletKind } from "@/lib/wallet";

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
  credit_limit: number | string | null;
  statement_day: number | null;
  due_day: number | null;
  debt_in: number | string;
  debt_out: number | string;
  is_shared?: boolean;
  owner_user_id?: string;
  member_count?: number | string;
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
    debtInSatang: toSatang(r.debt_in ?? 0),
    debtOutSatang: toSatang(r.debt_out ?? 0),
    entryCount: Number(r.tx_count),
    creditLimitSatang:
      r.credit_limit === null || r.credit_limit === undefined ? null : toSatang(r.credit_limit),
    statementDay: r.statement_day ?? null,
    dueDay: r.due_day ?? null,
    shared: r.is_shared === true,
    ownerId: r.owner_user_id,
    memberCount: r.member_count === undefined ? 1 : Number(r.member_count),
  }));
}

/**
 * The person's wallets, with the main wallet made on first use: entries with no wallet already
 * belong to it, so nothing has to be moved. Safe to call at any time.
 */
export async function ensureWallets(db: SupabaseClient, userId: string): Promise<Wallet[]> {
  const wallets = await listWallets(db, userId);
  // only the person's own private wallets can be their main wallet (a shared wallet never is)
  const mine = ownedWallets(wallets, userId).filter((w) => !w.shared);
  if (mine.some((w) => w.isDefault)) return wallets;

  if (mine.length > 0) {
    // wallets but no main one (should not happen): the oldest becomes the main wallet
    const first = mine[0];
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

/** Columns for the card fields that were given (so plain wallets keep working before migration 0021). */
function cardColumns(input: WalletPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.creditLimitSatang !== undefined) {
    out.credit_limit =
      input.creditLimitSatang === null ? null : satangToString(input.creditLimitSatang);
  }
  if (input.statementDay !== undefined) out.statement_day = input.statementDay;
  if (input.dueDay !== undefined) out.due_day = input.dueDay;
  return out;
}

export interface WalletInput {
  name: string;
  kind: WalletKind;
  openingSatang: number;
  makeDefault?: boolean;
  /** null clears; undefined leaves as is (card wallets only) */
  creditLimitSatang?: number | null;
  statementDay?: number | null;
  dueDay?: number | null;
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
    for (const [table, column] of [
      ["debts", "account_id"],
      ["debt_payments", "account_id"],
    ] as const) {
      const moved = await db
        .from(table)
        .update({ [column]: oldId })
        .eq("user_id", userId)
        .is(column, null);
      if (moved.error) fail(`pin ${table} to the old main wallet`, moved.error);
    }
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
      ...cardColumns(input),
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
  Object.assign(row, cardColumns(patch));
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
