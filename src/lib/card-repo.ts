import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cardStatus,
  isCardWallet,
  previousStatementCycle,
  statementCycle,
  type CardStatus,
} from "@/lib/card";
import { toSatang } from "@/lib/money";
import type { Wallet } from "@/lib/wallet";

async function spent(db: SupabaseClient, userId: string, walletId: string, from: Date, to: Date) {
  const { data, error } = await db.rpc("wallet_expense_between", {
    p_user: userId,
    p_account: walletId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(`card cycle total: ${error.message}`);
  return toSatang((data ?? 0) as number | string);
}

/**
 * The status of every card wallet that has a limit or a statement day, keyed by wallet id.
 * Cards with neither have nothing to show beyond their balance.
 */
export async function loadCardStatuses(
  db: SupabaseClient,
  userId: string,
  wallets: Wallet[],
  now: Date,
): Promise<Map<string, CardStatus>> {
  const out = new Map<string, CardStatus>();
  const cards = wallets.filter(
    (w) =>
      isCardWallet(w) &&
      (w.creditLimitSatang !== null || w.statementDay !== null || w.dueDay !== null),
  );
  await Promise.all(
    cards.map(async (w) => {
      let cycle = 0;
      let previous = 0;
      if (w.statementDay) {
        const current = statementCycle(now, w.statementDay);
        const before = previousStatementCycle(now, w.statementDay);
        [cycle, previous] = await Promise.all([
          spent(db, userId, w.id, current.from, current.to),
          spent(db, userId, w.id, before.from, before.to),
        ]);
      }
      out.set(w.id, cardStatus(w, { cycle, previous }, now));
    }),
  );
  return out;
}
