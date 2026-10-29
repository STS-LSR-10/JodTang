import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizePdfEntries, type PdfReader } from "@/lib/ai/pdf-reader";
import { categorizeByRules } from "@/lib/categorize/rules";
import { ImageError, inspectPdf, MAX_PDF_BYTES } from "@/lib/line/content";
import { log, safeMessage } from "@/lib/log";
import { effectivePlan, PDF_LIMIT } from "@/lib/plan";
import {
  countImportEntries,
  createImport,
  deleteImport,
  entryKey,
  existingKeys,
  findImport,
  importRawText,
} from "@/lib/pdf-repo";
import { bangkokDateKey } from "@/lib/points";
import { LIMITS, type LimitRule, type RateLimitResult } from "@/lib/rate-limit";
import { insertTransaction, loadCategories, loadMemoryFor, type UserRow } from "@/lib/repo";
import type { LineMessage } from "@/lib/types";
import { monthKey, refundUsage, takeUsage } from "@/lib/usage";
import {
  PDF_ALL_DUPLICATE_TEXT,
  PDF_ALREADY_TEXT,
  PDF_DAY_LIMIT_TEXT,
  PDF_FAILED_TEXT,
  PDF_LOCKED_TEXT,
  PDF_NO_ENTRIES_TEXT,
  PDF_NOT_PDF_TEXT,
  PDF_ONLY_TEXT,
  PDF_PASSWORD_TEXT,
  PDF_TOO_LARGE_TEXT,
  PDF_TOO_MANY_PAGES_TEXT,
  pdfQuotaText,
  text,
} from "./messages";
import { buildPdfCard } from "./pdf-flex";
import { upsellReply } from "./upsell-reply";

export interface PdfDeps {
  db: SupabaseClient;
  now: () => Date;
  fetchPdf: (messageId: string) => Promise<Uint8Array>;
  reader: PdfReader;
  limit?: (bucket: string, subject: string, rule: LimitRule) => Promise<RateLimitResult>;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * PDF file -> pending entries + one "check the whole file" card.
 * Order matters for cost: file name and size -> plan -> daily cap -> download -> look at the bytes ->
 * same file before? -> monthly quota -> AI. Nothing is recorded as confirmed: every entry waits for
 * the person's tap. The file itself is never stored (only its hash, to spot a second send), and a
 * reading that records nothing gives the quota back.
 */
export async function handlePdfMessage(
  deps: PdfDeps,
  user: UserRow,
  message: { id: string; fileName?: string; fileSize?: number },
  lineUserId: string,
): Promise<LineMessage[]> {
  const { db } = deps;
  const now = deps.now();

  // 1. cheap checks LINE already tells us about
  if (message.fileName && !/\.pdf$/i.test(message.fileName.trim())) return [text(PDF_ONLY_TEXT)];
  if (typeof message.fileSize === "number" && message.fileSize > MAX_PDF_BYTES) {
    return [text(PDF_TOO_LARGE_TEXT)];
  }

  // 2. plan: Free has none (the upgrade pitch)
  const plan = effectivePlan(user.plan, user.plan_expires_at, now);
  const limit = PDF_LIMIT[plan];
  if (limit === 0) return upsellReply(db, user.id, now, "pdf", PDF_LOCKED_TEXT);

  // 3. daily ceiling per person
  if (deps.limit) {
    const day = await deps.limit("pdf_day", lineUserId, LIMITS.pdfDay);
    if (!day.allowed) return [text(PDF_DAY_LIMIT_TEXT)];
  }

  // 4. download and look at the bytes (no paid call yet)
  let pdf: Uint8Array;
  try {
    pdf = await deps.fetchPdf(message.id);
  } catch (error) {
    if (error instanceof ImageError && error.reason === "too_large") {
      return [text(PDF_TOO_LARGE_TEXT)];
    }
    log.warn("pdf_download_failed", { reason: safeMessage(error) });
    return [text(PDF_FAILED_TEXT)];
  }
  const problem = inspectPdf(pdf);
  if (problem === "not_pdf") return [text(PDF_NOT_PDF_TEXT)];
  if (problem === "locked") return [text(PDF_PASSWORD_TEXT)];
  if (problem === "too_many_pages") return [text(PDF_TOO_MANY_PAGES_TEXT)];

  // 5. same file before? (a file whose entries were cancelled or erased may be sent again)
  const hash = sha256(pdf);
  const before = await findImport(db, user.id, hash);
  if (before) {
    if ((await countImportEntries(db, user.id, before.id)) > 0) return [text(PDF_ALREADY_TEXT)];
    await deleteImport(db, before.id);
  }

  // 6. monthly quota (given back below when nothing gets recorded)
  const month = monthKey(now);
  let allowed = false;
  try {
    allowed = await takeUsage(db, user.id, "pdf", limit, month);
  } catch (error) {
    log.error("pdf_quota_failed", error);
    return [text(PDF_FAILED_TEXT)];
  }
  if (!allowed) return [text(pdfQuotaText(plan === "ultimate" ? "ultimate" : "plus", limit))];

  let spent = false;
  try {
    return await readAndRecord();
  } finally {
    if (!spent) {
      await refundUsage(db, user.id, "pdf", month).catch((e) => log.error("pdf_refund_failed", e));
    }
  }

  async function readAndRecord(): Promise<LineMessage[]> {
    const [categories, memory] = await Promise.all([
      loadCategories(db, user.id),
      loadMemoryFor(db, user, now),
    ]);
    const hints = categories
      .filter((c) => !c.is_hidden)
      .map((c) => ({ name: c.name, type: c.type }));

    // 7. AI reads the whole file
    let raw: unknown;
    try {
      raw = await deps.reader.read({ pdf, today: bangkokDateKey(now), categories: hints });
    } catch (error) {
      log.warn("pdf_read_failed", { reader: deps.reader.name, reason: safeMessage(error) });
      return [text(PDF_FAILED_TEXT)];
    }
    const read = sanitizePdfEntries(raw, { now, categories: hints });
    if (read.entries.length === 0) return [text(PDF_NO_ENTRIES_TEXT)];

    // 8. leave out what the book already has
    const have = await existingKeys(
      db,
      user.id,
      read.entries.map((e) => e.occurredAt),
    );
    const fresh = read.entries.filter(
      (e) => !have.has(entryKey(e.type, e.amountSatang, e.occurredAt)),
    );
    const skipped = read.entries.length - fresh.length;
    if (fresh.length === 0) return [text(PDF_ALL_DUPLICATE_TEXT)];

    // 9. remember the file and keep every entry as pending
    const importId = await createImport(db, user.id, hash);
    if (!importId) return [text(PDF_ALREADY_TEXT)];
    try {
      for (const entry of fresh) {
        const named = entry.categoryName
          ? categories.find(
              (c) => c.type === entry.type && c.name === entry.categoryName && !c.is_hidden,
            )
          : undefined;
        const categoryId =
          named?.id ??
          categorizeByRules({
            title: entry.title,
            type: entry.type,
            categories,
            memory,
          }).categoryId;
        await insertTransaction(db, {
          userId: user.id,
          type: entry.type,
          title: entry.title,
          amountSatang: entry.amountSatang,
          categoryId,
          occurredAt: entry.occurredAt,
          status: "pending_confirm",
          rawText: importRawText(importId),
          source: "pdf",
        });
      }
    } catch (error) {
      // part of the file got in: take it back so the person can simply send the file again
      await db
        .from("transactions")
        .update({ status: "deleted" })
        .eq("user_id", user.id)
        .eq("raw_text", importRawText(importId))
        .eq("status", "pending_confirm");
      await deleteImport(db, importId).catch(() => undefined);
      throw error;
    }
    spent = true;
    return [
      buildPdfCard({
        importId,
        entries: fresh,
        skippedDuplicates: skipped,
        undated: read.undated,
        truncated: read.truncated,
      }),
    ];
  }
}
