import type { SupabaseClient } from "@supabase/supabase-js";
import { nextDueAfter, todayKey, type BillDto } from "@/lib/bill";
import { updateBill } from "@/lib/bill-repo";
import { categorizeByRules } from "@/lib/categorize/rules";
import {
  insertTransaction,
  loadCategories,
  loadMemoryFor,
  type TxRow,
  type UserRow,
} from "@/lib/repo";

/**
 * A bill was paid (or its round skipped): move it to its next due date, or switch it off when it
 * was a one-off. Any "remind me again" is cleared. Returns the new due date, null when finished.
 */
export async function settleBill(
  db: SupabaseClient,
  userId: string,
  bill: BillDto,
  now: Date,
): Promise<{ nextDueOn: string | null }> {
  const next = nextDueAfter(bill, bill.nextDueOn, todayKey(now));
  await updateBill(
    db,
    userId,
    bill.id,
    next === null ? { isActive: false, snoozedOn: null } : { nextDueOn: next, snoozedOn: null },
  );
  return { nextDueOn: next };
}

/** Record the bill as an expense with its usual amount (or the one given), titled with its name. */
export async function recordBillExpense(
  db: SupabaseClient,
  user: UserRow,
  bill: BillDto,
  amountSatang: number,
  now: Date,
): Promise<{ tx: TxRow; categoryId: string | null }> {
  const [categories, memory] = await Promise.all([
    loadCategories(db, user.id),
    loadMemoryFor(db, user, now),
  ]);
  const { categoryId } = categorizeByRules({
    title: bill.name,
    type: "expense",
    categories,
    memory,
  });
  const tx = await insertTransaction(db, {
    userId: user.id,
    type: "expense",
    title: bill.name,
    amountSatang,
    categoryId,
    occurredAt: now,
    status: "confirmed",
    rawText: `จ่ายบิล ${bill.name}`,
    source: "manual",
  });
  return { tx, categoryId };
}
