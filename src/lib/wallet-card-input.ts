import type { SupabaseClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/api";
import { requireFeature } from "@/lib/plan-server";
import { parseCreditLimit, type WalletKind } from "@/lib/wallet";

export interface CardInput {
  creditLimit?: string | number | null;
  statementDay?: number | null;
  dueDay?: number | null;
}

export interface CardFields {
  creditLimitSatang?: number | null;
  statementDay?: number | null;
  dueDay?: number | null;
}

/**
 * The card fields of a wallet request, checked: only a card wallet can have them, and setting them
 * (clearing is always allowed) is for Professional and above. Returns the error response to send
 * instead when something is wrong.
 */
export async function cardFieldsOr400(
  db: SupabaseClient,
  userId: string,
  input: CardInput,
  kind: WalletKind,
): Promise<CardFields | Response> {
  const out: CardFields = {};
  if (input.creditLimit !== undefined) {
    const limit = parseCreditLimit(input.creditLimit);
    if (limit === undefined) return apiError("วงเงินไม่ถูกต้อง (เช่น 50000)", 400);
    out.creditLimitSatang = limit;
  }
  if (input.statementDay !== undefined) out.statementDay = input.statementDay;
  if (input.dueDay !== undefined) out.dueDay = input.dueDay;

  const sets = Object.values(out).some((v) => v !== null && v !== undefined);
  if (!sets) return out;
  if (kind !== "card") return apiError("ตั้งวงเงินและวันตัดรอบได้เฉพาะกระเป๋าบัตรเครดิต", 400);
  return (await requireFeature(db, userId, "creditCard")) ?? out;
}
