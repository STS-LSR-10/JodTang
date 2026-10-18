import { categorizeByRules, type CategoryLite, type MemoryLite } from "@/lib/categorize/rules";
import { satangToString, toSatang } from "@/lib/money";
import type { TxType } from "@/lib/types";

/** Fields the web app may change on an existing entry. All optional; at least one is required. */
export interface EditInput {
  title?: string;
  /** Decimal string such as "50.50" (never a float). */
  amount?: string;
  type?: TxType;
  /** undefined = leave as is (or re-guess when the type changes); null = no category. */
  categoryId?: string | null;
  /** ISO 8601 with an offset. */
  occurredAt?: string;
  note?: string | null;
  /** The wallet (already checked to be the person's own); null = the main wallet. */
  accountId?: string | null;
}

export interface ExistingTx {
  type: TxType;
  title: string;
  category_id: string | null;
}

export type EditPlan =
  | {
      ok: true;
      /** Database columns to update. */
      patch: Record<string, unknown>;
      categoryChanged: boolean;
      /** The category the entry ends up with. */
      categoryId: string | null;
    }
  | { ok: false; error: string };

export const MAX_TITLE = 60;
export const MAX_NOTE = 200;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const AMOUNT_RE = /^\d{1,9}(\.\d{1,2})?$/;

const fail = (error: string): EditPlan => ({ ok: false, error });

/**
 * Validate an edit and turn it into a database patch. Pure: the route supplies the user's
 * categories (and learned memory for re-guessing the category when the type flips).
 */
export function planEdit(input: {
  edit: EditInput;
  existing: ExistingTx;
  categories: CategoryLite[];
  memory: MemoryLite[];
  now: Date;
}): EditPlan {
  const { edit, existing, categories, memory, now } = input;
  if (Object.keys(edit).length === 0) return fail("ไม่มีข้อมูลที่ต้องแก้");

  const patch: Record<string, unknown> = {};

  let title = existing.title;
  if (edit.title !== undefined) {
    title = edit.title.trim();
    if (!title || title.length > MAX_TITLE) return fail(`ชื่อรายการต้องมี 1–${MAX_TITLE} ตัวอักษร`);
    patch.title = title;
  }

  if (edit.amount !== undefined) {
    if (!AMOUNT_RE.test(edit.amount)) return fail("จำนวนเงินไม่ถูกต้อง (เช่น 50 หรือ 50.50)");
    const satang = toSatang(edit.amount);
    if (satang <= 0) return fail("จำนวนเงินต้องมากกว่า 0");
    patch.amount = satangToString(satang);
  }

  if (edit.note !== undefined) {
    const note = edit.note === null ? "" : edit.note.trim();
    if (note.length > MAX_NOTE) return fail(`โน้ตยาวเกิน ${MAX_NOTE} ตัวอักษร`);
    patch.note = note === "" ? null : note;
  }

  if (edit.accountId !== undefined) patch.account_id = edit.accountId;

  if (edit.occurredAt !== undefined) {
    const at = new Date(edit.occurredAt);
    if (Number.isNaN(at.getTime())) return fail("วันเวลาไม่ถูกต้อง");
    if (at.getTime() > now.getTime() + MAX_FUTURE_MS) return fail("วันที่อยู่ในอนาคต");
    if (at.getTime() < now.getTime() - MAX_AGE_MS) return fail("วันที่เก่าเกินไป");
    patch.occurred_at = at.toISOString();
  }

  const type = edit.type ?? existing.type;
  if (edit.type !== undefined) patch.type = edit.type;

  // ── category ──
  let categoryId = existing.category_id;
  if (edit.categoryId !== undefined) {
    if (edit.categoryId === null) {
      categoryId = null;
    } else {
      const picked = categories.find((c) => c.id === edit.categoryId && !c.is_hidden);
      if (!picked) return fail("หมวดหมู่ไม่ถูกต้อง");
      if (picked.type !== type) return fail("หมวดนี้ไม่ตรงกับประเภทของรายการ");
      categoryId = picked.id;
    }
  } else if (type !== existing.type) {
    // The old category belongs to the other type: guess a fresh one for the new type.
    categoryId = categorizeByRules({ title, type, categories, memory }).categoryId;
  }

  if (categoryId !== existing.category_id) patch.category_id = categoryId;

  return {
    ok: true,
    patch,
    categoryChanged: categoryId !== existing.category_id,
    categoryId,
  };
}

export const MAX_BULK = 100;

export interface BulkMovePlan {
  moveIds: string[];
  /** Entries whose type does not match the target category. */
  skipped: number;
}

/** Which of the selected entries can go into `category` (same type only). */
export function planBulkMove(
  txs: { id: string; type: TxType }[],
  category: Pick<CategoryLite, "type">,
): BulkMovePlan {
  const moveIds = txs.filter((t) => t.type === category.type).map((t) => t.id);
  return { moveIds, skipped: txs.length - moveIds.length };
}
