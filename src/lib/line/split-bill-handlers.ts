import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupRow } from "@/lib/group";
import { memberNames } from "@/lib/group-repo";
import { formatBaht } from "@/lib/money";
import { resolveNames } from "@/lib/trip";
import { billShares, totalOwed, unpaid, type BillCommand, type BillRow } from "@/lib/split-bill";
import {
  billMembers,
  cancelBill,
  closeBill,
  createBill,
  getBill,
  getPaymentByLine,
  joinBill,
  latestBillBy,
  listBills,
  markPaid,
} from "@/lib/split-bill-repo";
import type { LineMessage } from "@/lib/types";
import {
  buildBillCollectingCard,
  buildBillJoiningCard,
  buildBillQrCard,
  buildChaseCard,
} from "./split-bill-flex";
import { text } from "./messages";

type Reply = (messages: LineMessage[]) => Promise<void>;

export interface BillContext {
  db: SupabaseClient;
  group: GroupRow;
  /** The person who typed or tapped (absent when LINE did not say who). */
  userId: string | undefined;
  /** The ledger's owner is still on Ultimate (read-only otherwise). */
  writable: boolean;
  isOwner: boolean;
  /** The name to show for a member, fetching it from LINE when it is not known yet. */
  knownName: (userId: string) => Promise<string>;
  appUrl: string | undefined;
  reply: Reply;
}

const NAME_FALLBACK = "สมาชิกกลุ่ม";

export const BILL_USAGE_TEXT =
  'คนที่จ่ายก่อนพิมพ์ เช่น "หารบิล หมูกระทะ 1200" (ใส่ชื่อคนที่หารต่อท้ายได้ เช่น "หารบิล หมูกระทะ 1200 แอน บ๊อบ") เพื่อนที่ไปด้วยกดปุ่ม "ร่วมหาร" แล้วคนจ่ายกด "ปิดรายชื่อ" บอทจะหารเท่ากันให้';
const NO_USER_TEXT =
  "บอทยังไม่รู้ว่าใครพิมพ์ ให้เพิ่มบอทเป็นเพื่อน (และยอมรับข้อกำหนดของ LINE OA) ก่อน แล้วลองใหม่นะ";
const PAUSED_TEXT =
  "สมุดกลุ่มนี้หยุดจดชั่วคราว เพราะแผน Ultimate ของเจ้าของสมุดหมดอายุ ดูยอดค้างได้ตามปกติ";
const TOO_MANY_TEXT = "มีบิลที่ยังไม่เสร็จครบ 10 บิลแล้ว ปิดหรือยกเลิกบิลเก่าก่อนนะ";
const NO_BILL_TEXT = "ไม่เจอบิลของคุณที่รออยู่ ลองพิมพ์ “หารบิล ชื่อ ยอด” เพื่อเริ่มบิลใหม่นะ";
const NOT_PAYER_TEXT = "เฉพาะคนที่จ่ายบิลนี้ (หรือเจ้าของสมุด) ทำได้นะ";
const BILL_GONE_TEXT = "ไม่พบบิลนี้แล้ว";
const NONE_OWED_TEXT = "ตอนนี้ไม่มียอดค้างเลย 🎉";
const ALONE_TEXT = "ยังไม่มีใครร่วมหารนอกจากคนจ่าย ให้เพื่อนกด “ร่วมหาร” ก่อนนะ";

const joinedText = (who: string, title: string, count: number) =>
  `${who} ร่วมหาร "${title}" แล้ว (ตอนนี้ ${count} คน)`;

async function names(db: SupabaseClient, groupId: string) {
  const map = await memberNames(db, groupId);
  return (id: string) => map.get(id)?.name ?? NAME_FALLBACK;
}

/** Everyone may open a bill; only who paid it (or the owner of the ledger) closes, cancels or ticks it. */
const mayManage = (ctx: BillContext, bill: BillRow) =>
  ctx.isOwner || (ctx.userId !== undefined && ctx.userId === bill.payerLineUserId);

async function collectingCard(ctx: BillContext, bill: BillRow): Promise<LineMessage> {
  const [members, nameOf] = await Promise.all([
    billMembers(ctx.db, bill.id),
    names(ctx.db, ctx.group.id),
  ]);
  return buildBillCollectingCard({
    bill,
    payerName: nameOf(bill.payerLineUserId),
    members,
    nameOf,
    appUrl: ctx.appUrl,
  });
}

async function closeFlow(ctx: BillContext, bill: BillRow): Promise<void> {
  if (!ctx.writable) return ctx.reply([text(PAUSED_TEXT)]);
  if (!mayManage(ctx, bill)) return ctx.reply([text(NOT_PAYER_TEXT)]);
  if (bill.status !== "joining") return ctx.reply([text("บิลนี้ปิดรายชื่อไปแล้วนะ")]);
  const members = await billMembers(ctx.db, bill.id);
  if (members.length < 2) return ctx.reply([text(ALONE_TEXT)]);
  const shares = billShares(
    bill.amountSatang,
    members.map((m) => m.lineUserId),
    bill.payerLineUserId,
  );
  const closed = await closeBill(ctx.db, bill.id, shares);
  if (!closed) return ctx.reply([text("บิลนี้ปิดรายชื่อไปแล้วนะ")]);
  const fresh = (await getBill(ctx.db, ctx.group.id, bill.id)) ?? bill;
  const messages: LineMessage[] = [await collectingCard(ctx, fresh)];
  const payment = await getPaymentByLine(ctx.db, bill.payerLineUserId);
  if (!payment || (!payment.promptpayId && !payment.bankAccount)) {
    const payerName = (await names(ctx.db, ctx.group.id))(bill.payerLineUserId);
    messages.push(
      text(
        `${payerName} ยังไม่ได้ตั้งพร้อมเพย์ ถ้าอยากให้เพื่อนสแกนจ่ายได้เลย พิมพ์ “พร้อมเพย์ 0812345678” ในแชทส่วนตัวกับบอทนะ`,
      ),
    );
  }
  return ctx.reply(messages);
}

async function cancelFlow(ctx: BillContext, bill: BillRow): Promise<void> {
  if (!ctx.writable) return ctx.reply([text(PAUSED_TEXT)]);
  if (!mayManage(ctx, bill)) return ctx.reply([text(NOT_PAYER_TEXT)]);
  const done = await cancelBill(ctx.db, bill.id);
  return ctx.reply([
    text(done ? `ยกเลิกบิล "${bill.title}" แล้ว` : "บิลนี้เสร็จหรือถูกยกเลิกไปแล้วนะ"),
  ]);
}

async function paidFlow(ctx: BillContext, bill: BillRow, targets: string[]): Promise<void> {
  if (!ctx.writable) return ctx.reply([text(PAUSED_TEXT)]);
  if (!mayManage(ctx, bill)) return ctx.reply([text(NOT_PAYER_TEXT)]);
  const nameOf = await names(ctx.db, ctx.group.id);
  const lines: string[] = [];
  for (const id of targets) {
    const result = await markPaid(ctx.db, bill.id, id);
    lines.push(
      result === "ok"
        ? `✅ รับเงินจาก ${nameOf(id)} แล้ว`
        : result === "already"
          ? `${nameOf(id)} จ่ายแล้วก่อนหน้านี้`
          : `${nameOf(id)} ไม่ได้อยู่ในบิลนี้ หรือบิลยังไม่ปิดรายชื่อ`,
    );
  }
  const fresh = (await getBill(ctx.db, ctx.group.id, bill.id)) ?? bill;
  return ctx.reply([text(lines.join("\n")), await collectingCard(ctx, fresh)]);
}

/** "💸 จ่ายส่วนของฉัน": this person's QR with their own amount inside. */
async function qrFlow(ctx: BillContext, bill: BillRow): Promise<void> {
  if (!ctx.userId) return ctx.reply([text(NO_USER_TEXT)]);
  if (bill.status === "joining")
    return ctx.reply([text("ยังไม่ปิดรายชื่อ รอให้คนจ่ายกด “ปิดรายชื่อ” ก่อนนะ")]);
  if (bill.status === "cancelled") return ctx.reply([text("บิลนี้ถูกยกเลิกแล้ว")]);
  const members = await billMembers(ctx.db, bill.id);
  const mine = members.find((m) => m.lineUserId === ctx.userId);
  if (!mine || mine.shareSatang === null) {
    return ctx.reply([text("คุณไม่ได้อยู่ในรายชื่อหารของบิลนี้นะ")]);
  }
  if (mine.paid) return ctx.reply([text("ส่วนของคุณจ่ายเรียบร้อยแล้ว ขอบคุณค่ะ 🙏")]);
  const nameOf = await names(ctx.db, ctx.group.id);
  const payment = await getPaymentByLine(ctx.db, bill.payerLineUserId);
  const qrUrl =
    payment?.promptpayId && ctx.appUrl?.startsWith("https://")
      ? `${ctx.appUrl}/api/split-bill/qr/${mine.qrToken}.png`
      : undefined;
  return ctx.reply([
    buildBillQrCard({
      title: bill.title,
      who: await ctx.knownName(ctx.userId),
      payerName: nameOf(bill.payerLineUserId),
      shareSatang: mine.shareSatang,
      payment,
      qrUrl,
    }),
  ]);
}

async function chaseFlow(ctx: BillContext): Promise<void> {
  const bills = await listBills(ctx.db, ctx.group.id, ["collecting"], 6);
  if (bills.length === 0) return ctx.reply([text(NONE_OWED_TEXT)]);
  const nameOf = await names(ctx.db, ctx.group.id);
  const withMembers = await Promise.all(
    bills.map(async (bill) => ({
      bill,
      members: await billMembers(ctx.db, bill.id),
      payerName: nameOf(bill.payerLineUserId),
    })),
  );
  const owing = withMembers.filter((b) => unpaid(b.members, b.bill.payerLineUserId).length > 0);
  if (owing.length === 0) return ctx.reply([text(NONE_OWED_TEXT)]);
  return ctx.reply([buildChaseCard({ bills: owing, nameOf, appUrl: ctx.appUrl })]);
}

async function openListFlow(ctx: BillContext): Promise<void> {
  const bills = await listBills(ctx.db, ctx.group.id, ["joining", "collecting"], 10);
  if (bills.length === 0) return ctx.reply([text("ตอนนี้ไม่มีบิลที่ค้างอยู่ 🎉")]);
  const nameOf = await names(ctx.db, ctx.group.id);
  const lines = await Promise.all(
    bills.map(async (b) => {
      const members = await billMembers(ctx.db, b.id);
      const state =
        b.status === "joining"
          ? `รอปิดรายชื่อ (${members.length} คน)`
          : `ค้าง ${unpaid(members, b.payerLineUserId).length} คน ฿${formatBaht(totalOwed(members, b.payerLineUserId))}`;
      return `• ${b.title} ฿${formatBaht(b.amountSatang)} · จ่ายโดย ${nameOf(b.payerLineUserId)} · ${state}`;
    }),
  );
  return ctx.reply([
    text(["บิลที่ยังไม่เสร็จ", ...lines, 'พิมพ์ "ตามเงิน" ดูว่าใครยังค้าง'].join("\n")),
  ]);
}

/** The typed commands about bills. */
export async function runBillCommand(command: BillCommand, ctx: BillContext): Promise<void> {
  const { db, group, userId } = ctx;
  switch (command.kind) {
    case "bill-usage":
      return ctx.reply([text(BILL_USAGE_TEXT)]);

    case "bill-chase":
      return chaseFlow(ctx);

    case "bill-open":
      return openListFlow(ctx);

    case "bill-new": {
      if (!userId) return ctx.reply([text(NO_USER_TEXT)]);
      if (!ctx.writable) return ctx.reply([text(PAUSED_TEXT)]);
      const known = await memberNames(db, group.id);
      const payerName = await ctx.knownName(userId);
      known.set(userId, { name: payerName, updatedAt: new Date().toISOString() });

      // people typed after the amount are in straight away; the payer always is
      let named: string[] = [];
      if (command.names.length > 0) {
        const people = [...known].map(([id, v]) => ({ id, name: v.name }));
        const found = resolveNames(command.names, people);
        if (!found.ok) {
          const bad = found.unknown.length > 0 ? found.unknown : found.ambiguous;
          return ctx.reply([
            text(
              found.unknown.length > 0
                ? `ไม่รู้จัก ${bad.join(", ")} ในกลุ่มนี้ ให้เขาพิมพ์อะไรสักอย่างในกลุ่มก่อน (หรือพิมพ์ชื่อให้ตรงกับชื่อใน LINE) เลยยังไม่ได้เปิดบิล`
                : `${bad.join(", ")} ตรงกับหลายคน พิมพ์ชื่อให้ชัดขึ้นอีกนิดนะ เลยยังไม่ได้เปิดบิล`,
            ),
          ]);
        }
        named = found.ids;
      }

      const bill = await createBill(db, {
        groupId: group.id,
        payerLineUserId: userId,
        title: command.title,
        amountSatang: command.amountSatang,
      });
      if (bill === "too_many") return ctx.reply([text(TOO_MANY_TEXT)]);
      await joinBill(db, bill.id, userId);
      for (const id of named) if (id !== userId) await joinBill(db, bill.id, id);
      const members = await billMembers(db, bill.id);
      const nameOf = (id: string) => known.get(id)?.name ?? NAME_FALLBACK;
      return ctx.reply([
        buildBillJoiningCard({
          bill,
          payerName,
          names: members.map((m) => nameOf(m.lineUserId)),
          appUrl: ctx.appUrl,
        }),
      ]);
    }

    case "bill-close": {
      if (!userId) return ctx.reply([text(NO_USER_TEXT)]);
      const bill = await latestBillBy(db, group.id, userId, ["joining"]);
      if (!bill) return ctx.reply([text(NO_BILL_TEXT)]);
      return closeFlow(ctx, bill);
    }

    case "bill-cancel": {
      if (!userId) return ctx.reply([text(NO_USER_TEXT)]);
      const bill = await latestBillBy(db, group.id, userId, ["joining", "collecting"]);
      if (!bill) return ctx.reply([text(NO_BILL_TEXT)]);
      return cancelFlow(ctx, bill);
    }

    case "bill-paid": {
      if (!userId) return ctx.reply([text(NO_USER_TEXT)]);
      const bill = await latestBillBy(db, group.id, userId, ["collecting"]);
      if (!bill) return ctx.reply([text("ไม่เจอบิลของคุณที่กำลังเก็บเงินอยู่")]);
      const known = await memberNames(db, group.id);
      const members = await billMembers(db, bill.id);
      const people = members.map((m) => ({
        id: m.lineUserId,
        name: known.get(m.lineUserId)?.name ?? NAME_FALLBACK,
      }));
      const found = resolveNames(command.names, people);
      if (!found.ok) {
        const bad = found.unknown.length > 0 ? found.unknown : found.ambiguous;
        return ctx.reply([
          text(`ไม่เจอ ${bad.join(", ")} ในบิล "${bill.title}" พิมพ์ชื่อให้ตรงกับชื่อใน LINE นะ`),
        ]);
      }
      return paidFlow(ctx, bill, found.ids);
    }
  }
}

/** The buttons on the bill cards (a=gbj / gbc / gbx / gbq / gbp). */
export async function handleBillPostback(
  action: string,
  params: URLSearchParams,
  ctx: BillContext,
): Promise<void> {
  const bill = await getBill(ctx.db, ctx.group.id, params.get("b") ?? "");
  if (!bill) return ctx.reply([text(BILL_GONE_TEXT)]);

  switch (action) {
    case "gbj": {
      if (!ctx.userId) return ctx.reply([text(NO_USER_TEXT)]);
      if (!ctx.writable) return ctx.reply([text(PAUSED_TEXT)]);
      const who = await ctx.knownName(ctx.userId);
      const result = await joinBill(ctx.db, bill.id, ctx.userId);
      if (result === "closed")
        return ctx.reply([text("บิลนี้ปิดรายชื่อแล้ว ถามคนจ่ายถ้าอยากร่วมหารนะ")]);
      if (result === "full") return ctx.reply([text("บิลนี้มีคนร่วมครบ 30 คนแล้ว")]);
      const count = (await billMembers(ctx.db, bill.id)).length;
      return ctx.reply([text(joinedText(who, bill.title, count))]);
    }
    case "gbc":
      return closeFlow(ctx, bill);
    case "gbx":
      return cancelFlow(ctx, bill);
    case "gbq":
      return qrFlow(ctx, bill);
    case "gbp": {
      const target = params.get("u") ?? "";
      return paidFlow(ctx, bill, target ? [target] : []);
    }
    default:
      return;
  }
}

export const BILL_POSTBACKS = new Set(["gbj", "gbc", "gbx", "gbq", "gbp"]);
