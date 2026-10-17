import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categorizeByRules } from "@/lib/categorize/rules";
import { buildSlipCard } from "@/lib/line/slip-flex";
import { extensionFor, ImageError } from "@/lib/line/content";
import {
  ALREADY_RECORDED_TEXT,
  IMAGE_ERROR_TEXT,
  IMAGE_TOO_LARGE_TEXT,
  NOT_A_SLIP_TEXT,
  SLIP_LOCKED_TEXT,
  SLIP_QUOTA_TEXT,
  SLIP_UNREADABLE_TEXT,
  text,
} from "@/lib/line/messages";
import { formatBaht, toSatang } from "@/lib/money";
import type { SlipImage, SlipOcrProvider } from "@/lib/ocr/provider";
import { sanitizeSlip } from "@/lib/ocr/slip-schema";
import { effectivePlan, SLIP_LIMIT, slipsRemaining } from "@/lib/plan";
import { insertTransaction, loadCategories, loadMemoryFor, type UserRow } from "@/lib/repo";
import {
  countSlipsThisMonth,
  findSlipByHash,
  findSlipByRef,
  findTransactionBySlip,
  getUserPlanRow,
  insertSlip,
  SLIP_BUCKET,
} from "@/lib/slip-repo";
import type { LineMessage } from "@/lib/types";

export interface SlipDeps {
  db: SupabaseClient;
  now: () => Date;
  fetchImage: (messageId: string) => Promise<SlipImage>;
  ocr: SlipOcrProvider;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function alreadyRecorded(
  db: SupabaseClient,
  userId: string,
  slipId: string,
): Promise<LineMessage[]> {
  const tx = await findTransactionBySlip(db, userId, slipId);
  if (!tx) return [text(ALREADY_RECORDED_TEXT)];
  return [text(`${ALREADY_RECORDED_TEXT}\n${tx.title} ฿${formatBaht(toSatang(tx.amount))}`)];
}

/**
 * Slip image -> pending transaction + review card.
 * Order matters for cost and privacy: quota -> download -> dedupe by hash (before any AI call)
 * -> upload -> OCR -> sanitize -> dedupe by reference -> record.
 */
export async function handleSlipImage(
  deps: SlipDeps,
  user: UserRow,
  messageId: string,
): Promise<LineMessage[]> {
  const { db } = deps;
  const now = deps.now();

  // 1. quota (failed reads are never inserted, so they never count)
  const planRow = await getUserPlanRow(db, user.id);
  const plan = effectivePlan(planRow.plan, planRow.plan_expires_at, now);
  if (SLIP_LIMIT[plan] === 0) return [text(SLIP_LOCKED_TEXT)];
  const remaining = slipsRemaining(plan, await countSlipsThisMonth(db, user.id, now));
  if (remaining !== null && remaining <= 0) return [text(SLIP_QUOTA_TEXT)];

  // 2. download
  let image: SlipImage;
  try {
    image = await deps.fetchImage(messageId);
  } catch (error) {
    if (error instanceof ImageError) {
      return [text(error.reason === "too_large" ? IMAGE_TOO_LARGE_TEXT : IMAGE_ERROR_TEXT)];
    }
    throw error;
  }

  // 3. same picture sent before?
  const hash = sha256(image.bytes);
  const sameImage = await findSlipByHash(db, user.id, hash);
  if (sameImage) return alreadyRecorded(db, user.id, sameImage.id);

  // 4. private storage (path is scoped by user id)
  const path = `${user.id}/${hash}.${extensionFor(image.mimeType)}`;
  const upload = await db.storage
    .from(SLIP_BUCKET)
    .upload(path, image.bytes, { contentType: image.mimeType, upsert: true });
  if (upload.error) throw new Error(`upload slip: ${upload.error.message}`);

  const discardUpload = async () => {
    await db.storage.from(SLIP_BUCKET).remove([path]);
  };

  // 5. OCR + validation
  let result;
  try {
    result = sanitizeSlip(await deps.ocr.extract(image), now);
  } catch (error) {
    await discardUpload().catch(() => undefined);
    throw error;
  }
  if (!result.ok) {
    await discardUpload().catch(() => undefined);
    return [text(result.reason === "not_slip" ? NOT_A_SLIP_TEXT : SLIP_UNREADABLE_TEXT)];
  }
  const data = result.data;

  // 6. same slip photographed again? (reference numbers are unique per user)
  if (data.reference) {
    const sameRef = await findSlipByRef(db, user.id, data.reference);
    if (sameRef) {
      await discardUpload().catch(() => undefined);
      return alreadyRecorded(db, user.id, sameRef.id);
    }
  }

  // 7. record the slip and a pending transaction
  const slip = await insertSlip(db, { userId: user.id, storagePath: path, sha256: hash, data });
  if (!slip) {
    await discardUpload().catch(() => undefined);
    return [text(ALREADY_RECORDED_TEXT)];
  }

  const title = data.payeeName ?? data.memo ?? "โอนเงิน";
  const [categories, memory] = await Promise.all([
    loadCategories(db, user.id),
    loadMemoryFor(db, user, now),
  ]);
  const { categoryId } = categorizeByRules({
    title: [data.payeeName, data.memo].filter(Boolean).join(" ") || title,
    type: "expense",
    categories,
    memory,
  });

  const occurredAt = data.paidAt ?? now;
  const tx = await insertTransaction(db, {
    userId: user.id,
    type: "expense",
    title,
    amountSatang: data.amountSatang,
    categoryId,
    occurredAt,
    status: "pending_confirm",
    rawText: title,
    source: "slip",
    slipId: slip.id,
  });

  return [
    buildSlipCard({
      txId: tx.id,
      title,
      payeeBank: data.payeeBank,
      payeeAccountLast4: data.payeeAccountLast4,
      amountSatang: data.amountSatang,
      occurredAt,
      dateKnown: data.paidAt !== null,
      categoryName: categories.find((c) => c.id === categoryId)?.name ?? null,
      reference: data.reference,
    }),
  ];
}
