import type { SupabaseClient } from "@supabase/supabase-js";
import { goalProgress, type GoalDto } from "@/lib/goal";
import { satangToString, toSatang } from "@/lib/money";

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

interface BalanceRow {
  id: string;
  name: string;
  emoji: string | null;
  target_amount: number | string;
  due_on: string | null;
  archived_at: string | null;
  saved: number | string;
}

/** The person's goals (live ones first) with progress worked out as of `now`. */
export async function listGoals(db: SupabaseClient, userId: string, now: Date): Promise<GoalDto[]> {
  const { data, error } = await db.rpc("goal_balances", { p_user: userId });
  if (error) fail("list goals", error);
  return ((data ?? []) as BalanceRow[]).map((r) => {
    const base = {
      targetSatang: toSatang(r.target_amount),
      savedSatang: toSatang(r.saved),
      dueOn: r.due_on,
    };
    return {
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      archived: r.archived_at !== null,
      ...base,
      ...goalProgress(base, now),
    };
  });
}

export interface GoalInput {
  name: string;
  emoji?: string | null;
  targetSatang: number;
  dueOn?: string | null;
}

/** Returns the new id, or "duplicate" when a live goal already has that name. */
export async function createGoal(
  db: SupabaseClient,
  userId: string,
  input: GoalInput,
): Promise<string | "duplicate"> {
  const { data, error } = await db
    .from("savings_goals")
    .insert({
      user_id: userId,
      name: input.name,
      emoji: input.emoji ?? null,
      target_amount: satangToString(input.targetSatang),
      due_on: input.dueOn ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return "duplicate";
    fail("create goal", error);
  }
  return (data as { id: string }).id;
}

export type GoalPatch = Partial<GoalInput>;

/** "ok", "duplicate" (name taken) or "missing" (not theirs). */
export async function updateGoal(
  db: SupabaseClient,
  userId: string,
  id: string,
  patch: GoalPatch,
): Promise<"ok" | "duplicate" | "missing"> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.emoji !== undefined) row.emoji = patch.emoji;
  if (patch.targetSatang !== undefined) row.target_amount = satangToString(patch.targetSatang);
  if (patch.dueOn !== undefined) row.due_on = patch.dueOn;
  if (Object.keys(row).length === 0) return "ok";
  const { data, error } = await db
    .from("savings_goals")
    .update(row)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return "duplicate";
    fail("update goal", error);
  }
  return data ? "ok" : "missing";
}

export async function deleteGoal(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data, error } = await db
    .from("savings_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) fail("delete goal", error);
  return data !== null;
}

export interface DepositRow {
  id: string;
  amountSatang: number;
  occurredAt: string;
  note: string | null;
}

/** Put money in (positive) or take it out (negative). Returns the new id. */
export async function addDeposit(
  db: SupabaseClient,
  userId: string,
  goalId: string,
  input: { amountSatang: number; occurredAt: Date; note?: string | null },
): Promise<string> {
  const { data, error } = await db
    .from("savings_deposits")
    .insert({
      user_id: userId,
      goal_id: goalId,
      amount: satangToString(input.amountSatang),
      occurred_at: input.occurredAt.toISOString(),
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error) fail("add deposit", error);
  return (data as { id: string }).id;
}

export async function listDeposits(
  db: SupabaseClient,
  userId: string,
  goalId: string,
  limit = 100,
): Promise<DepositRow[]> {
  const { data, error } = await db
    .from("savings_deposits")
    .select("id,amount,occurred_at,note")
    .eq("user_id", userId)
    .eq("goal_id", goalId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) fail("list deposits", error);
  return (
    (data ?? []) as {
      id: string;
      amount: number | string;
      occurred_at: string;
      note: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    amountSatang: toSatang(r.amount),
    occurredAt: r.occurred_at,
    note: r.note,
  }));
}

export async function deleteDeposit(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("savings_deposits")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) fail("delete deposit", error);
  return data !== null;
}

/**
 * Undo one deposit or withdrawal. Refused ("blocked") when that would leave less than zero saved,
 * i.e. a later withdrawal depends on it; "missing" when it is not theirs.
 */
export async function undoDeposit(
  db: SupabaseClient,
  userId: string,
  goalId: string,
  depositId: string,
): Promise<"ok" | "missing" | "blocked"> {
  const goal = (await listGoals(db, userId, new Date())).find((g) => g.id === goalId);
  const deposit = (await listDeposits(db, userId, goalId, 1000)).find((d) => d.id === depositId);
  if (!goal || !deposit) return "missing";
  if (goal.savedSatang - deposit.amountSatang < 0) return "blocked";
  return (await deleteDeposit(db, userId, depositId)) ? "ok" : "missing";
}
