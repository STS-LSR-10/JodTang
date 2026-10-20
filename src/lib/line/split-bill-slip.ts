import { createHash } from "node:crypto";
import { FAIR_USE } from "@/lib/plan";
import { log } from "@/lib/log";
import { formatBaht } from "@/lib/money";
import { sanitizeSlip } from "@/lib/ocr/slip-schema";
import { LIMITS } from "@/lib/rate-limit";
import { evaluateSlip, type PayeeDigits } from "@/lib/split-bill";
import { getPaymentByLine, openSharesOf, payBySlip, slipUsed } from "@/lib/split-bill-repo";
import { monthKey, refundUsage, takeUsage } from "@/lib/usage";
import type { LineMessage } from "@/lib/types";
import type { HandlerDeps } from "./handlers";
import { text } from "./messages";
import { collectingCardFor, type BillContext } from "./split-bill-handlers";

const baht = (satang: number) => `฿${formatBaht(satang)}`;

/** A text with a "take it back" button, for when the receiver on the slip could not be checked. */
const withUndo = (message: string, billId: string, who: string, userId: string): LineMessage => ({
  type: "text",
  text: message,
  quickReply: {
    items: [
      {
        type: "action",
        action: {
          type: "postback",
          label: `↩ ยังไม่ได้รับ ${who}`.slice(0, 20),
          data: `a=gbu&b=${billId}&u=${userId}`,
          displayText: `ยังไม่ได้รับจาก ${who}`,
        },
      },
    ],
  },
});

/**
 * A picture sent into the group by someone who still owes on a bill: if it is a transfer slip for at
 * least their share, sent to the payer's account (when the slip shows enough to tell) and made after
 * the bill was opened, the share is marked paid. Pictures from anyone else, and pictures that are not
 * slips, get no answer at all. The slip is never stored: only its hash and the bank's reference stay,
 * so one slip cannot pay twice. The reading is paid per use, so it is counted on the ledger owner's
 * monthly fair-use ceiling.
 */
export async function checkGroupSlip(
  ctx: BillContext,
  deps: HandlerDeps,
  messageId: string,
): Promise<void> {
  const { db, group, userId } = ctx;
  if (!userId || !deps.slip || !ctx.writable) return;

  // free to answer: does this person owe anything here? Nobody else's pictures cost a thing.
  const open = await openSharesOf(db, group.id, userId);
  if (open.length === 0) return;

  if (deps.limit) {
    const result = await deps.limit("group_slip", userId, LIMITS.groupSlip);
    if (!result.allowed) return;
  }

  const now = deps.now();
  const month = monthKey(now);
  let counted = false;
  try {
    counted = await takeUsage(db, group.ownerUserId, "group_slip", FAIR_USE.slips, month);
  } catch (error) {
    log.error("group_slip_quota_failed", error);
    return;
  }
  const nameOf = async (id: string) => ctx.knownName(id);
  if (!counted) {
    return ctx.reply([
      text("เดือนนี้บอทตรวจสลิปในกลุ่มครบเกณฑ์แล้ว กด “📨 โอนแล้ว” ให้คนจ่ายตรวจเองนะ"),
    ]);
  }
  const giveBack = () =>
    refundUsage(db, group.ownerUserId, "group_slip", month).catch((e) =>
      log.error("group_slip_refund_failed", e),
    );

  let image;
  try {
    image = await deps.slip.fetchImage(messageId);
  } catch {
    await giveBack();
    return ctx.reply([text("โหลดรูปไม่สำเร็จ ลองส่งใหม่อีกครั้งนะ")]);
  }
  const sha256 = createHash("sha256").update(image.bytes).digest("hex");
  if (await slipUsed(db, sha256, null)) {
    await giveBack();
    return ctx.reply([text("สลิปนี้เคยใช้จ่ายไปแล้วนะ")]);
  }

  let result;
  try {
    result = sanitizeSlip(await deps.slip.ocr.extract(image, { items: false }), now);
  } catch (error) {
    log.warn("group_slip_read_failed", { reason: error instanceof Error ? error.message : "?" });
    await giveBack();
    return ctx.reply([text("อ่านสลิปไม่สำเร็จ ลองส่งใหม่ หรือกด “📨 โอนแล้ว” ให้คนจ่ายตรวจเองนะ")]);
  }
  if (!result.ok) {
    await giveBack();
    // a photo that is not a slip (a picture of the food) is none of our business
    if (result.reason === "not_slip") return;
    return ctx.reply([
      text("อ่านสลิปไม่ชัด ลองถ่ายใหม่ให้เห็นยอดกับผู้รับ หรือกด “📨 โอนแล้ว” ให้คนจ่ายตรวจเองนะ"),
    ]);
  }
  const slip = result.data;
  if (slip.kind === "receipt") {
    await giveBack();
    return;
  }
  if (slip.reference && (await slipUsed(db, null, slip.reference))) {
    return ctx.reply([text("สลิปนี้เคยใช้จ่ายไปแล้วนะ")]);
  }

  // the payers' accounts, for the bills this person might be paying
  const payees = new Map<string, PayeeDigits | null>();
  for (const share of open) {
    const payer = share.bill.payerLineUserId;
    if (!payees.has(payer)) payees.set(payer, await getPaymentByLine(db, payer));
  }
  const verdict = evaluateSlip({
    open,
    amountSatang: slip.amountSatang,
    paidAt: slip.paidAt,
    receiverLast4: slip.payeeAccountLast4,
    payeeOf: (payer) => payees.get(payer) ?? null,
  });
  if (!verdict) return;
  const who = await nameOf(userId);

  if (verdict.kind === "too_little") {
    return ctx.reply([
      text(
        `${who} โอน ${baht(verdict.amountSatang)} แต่ส่วนที่ค้างอยู่ ${baht(verdict.smallestShareSatang)} ขึ้นไป ยอดยังไม่ครบ เลยยังไม่ขึ้นว่าจ่ายแล้ว ถ้าโอนเพิ่มแล้วส่งสลิปใบใหม่ได้เลย`,
      ),
    ]);
  }
  const payerName = await nameOf(verdict.share.bill.payerLineUserId);
  if (verdict.kind === "receiver_mismatch") {
    return ctx.reply([
      text(`สลิปนี้โอนไปบัญชีที่ไม่ตรงกับของ ${payerName} ตรวจอีกทีนะ เลยยังไม่ขึ้นว่าจ่ายแล้ว`),
    ]);
  }
  if (verdict.kind === "before_bill") {
    return ctx.reply([
      text(
        `สลิปนี้ทำก่อนเปิดบิล "${verdict.share.bill.title}" ใช้จ่ายบิลนี้ไม่ได้ ถ้าเพิ่งโอนจริง กด “📨 โอนแล้ว” ให้ ${payerName} ตรวจเองนะ`,
      ),
    ]);
  }

  const paid = await payBySlip(db, {
    billId: verdict.share.bill.id,
    lineUserId: userId,
    sha256,
    reference: slip.reference,
    amountSatang: slip.amountSatang,
    receiverVerified: verdict.receiver === "verified",
  });
  if (paid === "duplicate") return ctx.reply([text("สลิปนี้เคยใช้จ่ายไปแล้วนะ")]);
  if (paid !== "ok") return; // paid in the meantime, or the bill closed

  const bill = verdict.share.bill;
  const over =
    verdict.overSatang >= 100
      ? ` (โอนเกินมา ${baht(verdict.overSatang)} ให้ ${payerName} ทอนหรือเก็บไว้)`
      : "";
  const card = await collectingCardFor(ctx, bill);
  if (verdict.receiver === "verified") {
    return ctx.reply([
      text(
        `✅ ${who} จ่ายส่วนของ "${bill.title}" ${baht(verdict.share.shareSatang)} แล้ว (ตรวจสลิปแล้ว)${over}`,
      ),
      card,
    ]);
  }
  return ctx.reply([
    withUndo(
      `✅ ${who} จ่ายส่วนของ "${bill.title}" ${baht(verdict.share.shareSatang)} แล้ว ยอดครบ แต่อ่านผู้รับในสลิปไม่ได้ ${payerName} ช่วยดูด้วยนะ ถ้าไม่ได้รับเงินจริง กด “↩ ยังไม่ได้รับ”${over}`,
      bill.id,
      who,
      userId,
    ),
    card,
  ]);
}
