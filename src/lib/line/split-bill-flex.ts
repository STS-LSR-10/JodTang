import { formatBaht } from "@/lib/money";
import { maskPromptPayId } from "@/lib/promptpay";
import {
  MAX_PAID_BUTTONS,
  totalOwed,
  unpaid,
  type BillMemberRow,
  type BillRow,
} from "@/lib/split-bill";
import type { PaymentAccount } from "@/lib/split-bill-repo";
import type { LineMessage } from "@/lib/types";
import { COLOR } from "./flex";
import { topicBubble } from "./help-flex";

const PAID_BG = "#E8F8EF";
const OWED_BG = "#FFF1E5";

const baht = (satang: number) => `฿${formatBaht(satang)}`;

const postback = (label: string, data: string, displayText: string) => ({
  type: "postback",
  label: label.slice(0, 20),
  data,
  displayText,
});

const button = (style: "primary" | "secondary" | "link", action: unknown) => ({
  type: "button",
  style,
  height: "sm",
  ...(style === "primary" ? { color: COLOR.primary } : {}),
  action,
});

const tile = (bg: string, left: string, right: string, sub?: string) => ({
  type: "box",
  layout: "horizontal",
  alignItems: "center",
  spacing: "md",
  margin: "sm",
  paddingAll: "10px",
  cornerRadius: "12px",
  backgroundColor: bg,
  contents: [
    {
      type: "box",
      layout: "vertical",
      flex: 1,
      spacing: "xs",
      contents: [
        { type: "text", text: left, size: "sm", weight: "bold", color: "#14352E", wrap: true },
        ...(sub ? [{ type: "text", text: sub, size: "xs", color: COLOR.muted, wrap: true }] : []),
      ],
    },
    {
      type: "text",
      text: right,
      size: "sm",
      weight: "bold",
      color: "#14352E",
      flex: 0,
      align: "end",
    },
  ],
});

/** The card that opens a bill: who paid, how much, who is in, and the buttons to join / close. */
export function buildBillJoiningCard(input: {
  bill: BillRow;
  payerName: string;
  names: string[];
  appUrl?: string;
}): LineMessage {
  const { bill } = input;
  return {
    type: "flex",
    altText: `หารบิล ${bill.title} ${baht(bill.amountSatang)} · กด "ร่วมหาร"`,
    contents: topicBubble({
      icon: "🍽️",
      title: bill.title,
      subtitle: `${baht(bill.amountSatang)} · จ่ายโดย ${input.payerName}`,
      appUrl: input.appUrl,
      body: [
        {
          type: "text",
          text: `ร่วมหารแล้ว ${input.names.length} คน`,
          size: "xs",
          weight: "bold",
          color: COLOR.muted,
          margin: "sm",
        },
        {
          type: "text",
          text: input.names.join(" · "),
          size: "sm",
          color: "#14352E",
          wrap: true,
          margin: "sm",
        },
        {
          type: "text",
          text: "ไปกินด้วยกัน กด “ร่วมหาร” เมื่อครบแล้วคนจ่ายกด “ปิดรายชื่อ” บอทจะหารเท่ากันให้",
          size: "xs",
          color: COLOR.muted,
          wrap: true,
          margin: "lg",
        },
      ],
      footer: [
        button("primary", postback("🙋 ร่วมหาร", `a=gbj&b=${bill.id}`, "ร่วมหาร")),
        button("secondary", postback("✅ ปิดรายชื่อ", `a=gbc&b=${bill.id}`, "ปิดรายชื่อ")),
        button("link", postback("✖ ยกเลิกบิล", `a=gbx&b=${bill.id}`, "ยกเลิกบิล")),
      ],
    }),
  };
}

/** The bill after the list is closed: everyone's share and whether it is paid, with the pay buttons. */
export function buildBillCollectingCard(input: {
  bill: BillRow;
  payerName: string;
  members: BillMemberRow[];
  nameOf: (lineUserId: string) => string;
  appUrl?: string;
}): LineMessage {
  const { bill, members } = input;
  const left = unpaid(members, bill.payerLineUserId);
  const settled = left.length === 0;
  const tiles = members.map((m) =>
    tile(
      m.paid ? PAID_BG : OWED_BG,
      input.nameOf(m.lineUserId),
      baht(m.shareSatang ?? 0),
      m.lineUserId === bill.payerLineUserId ? "คนจ่าย" : m.paid ? "✅ จ่ายแล้ว" : "⏳ ยังไม่จ่าย",
    ),
  );
  return {
    type: "flex",
    altText: settled
      ? `${bill.title}: เก็บครบแล้ว 🎉`
      : `${bill.title}: ค้าง ${left.length} คน ${baht(totalOwed(members, bill.payerLineUserId))}`,
    contents: topicBubble({
      icon: settled ? "🎉" : "💸",
      title: settled ? `${bill.title} เก็บครบแล้ว` : bill.title,
      subtitle: `${baht(bill.amountSatang)} · หาร ${members.length} คน · จ่ายโดย ${input.payerName}`,
      appUrl: input.appUrl,
      body: [
        ...tiles,
        ...(settled
          ? []
          : [
              {
                type: "text",
                text: `ยังค้าง ${left.length} คน รวม ${baht(totalOwed(members, bill.payerLineUserId))}`,
                size: "xs",
                color: COLOR.muted,
                margin: "lg",
                wrap: true,
              },
            ]),
      ],
      footer: settled
        ? [
            {
              type: "text",
              text: "ทุกคนจ่ายครบแล้ว ขอบคุณที่ช่วยกันนะ",
              size: "xs",
              color: COLOR.muted,
              wrap: true,
            },
          ]
        : [
            button(
              "primary",
              postback("💸 จ่ายส่วนของฉัน", `a=gbq&b=${bill.id}`, "จ่ายส่วนของฉัน"),
            ),
            ...left
              .slice(0, MAX_PAID_BUTTONS)
              .map((m) =>
                button(
                  "secondary",
                  postback(
                    `✅ ได้รับจาก ${input.nameOf(m.lineUserId)}`,
                    `a=gbp&b=${bill.id}&u=${m.lineUserId}`,
                    `ได้รับเงินจาก ${input.nameOf(m.lineUserId)}`,
                  ),
                ),
              ),
            {
              type: "text",
              text:
                "คนจ่ายกดปุ่ม ✅ เมื่อเงินเข้า" +
                (left.length > MAX_PAID_BUTTONS ? " (คนที่เหลือพิมพ์ ได้รับแล้ว ชื่อ)" : ""),
              size: "xxs",
              color: COLOR.muted,
              wrap: true,
              margin: "sm",
            },
          ],
    }),
  };
}

/** One person's QR: the amount is inside the code, so the banking app fills it in. */
export function buildBillQrCard(input: {
  title: string;
  who: string;
  payerName: string;
  shareSatang: number;
  payment: PaymentAccount | null;
  qrUrl?: string;
}): LineMessage {
  const { payment } = input;
  const hasPromptPay = Boolean(payment?.promptpayId) && Boolean(input.qrUrl);
  const hasBank = Boolean(payment?.bankAccount);
  const lines: unknown[] = [];
  if (payment?.promptpayId) {
    lines.push({
      type: "text",
      text: `พร้อมเพย์ ${maskPromptPayId(payment.promptpayId)}`,
      size: "sm",
      color: "#14352E",
      align: "center",
    });
  }
  if (hasBank && payment) {
    lines.push({
      type: "text",
      text: `${payment.bankName ?? "ธนาคาร"} ${payment.bankAccount}`,
      size: "md",
      weight: "bold",
      color: "#14352E",
      align: "center",
      wrap: true,
      margin: "sm",
    });
    if (payment.accountName) {
      lines.push({
        type: "text",
        text: payment.accountName,
        size: "xs",
        color: COLOR.muted,
        align: "center",
        wrap: true,
      });
    }
    lines.push({
      type: "text",
      text: "กดค้างที่เลขบัญชีเพื่อคัดลอก",
      size: "xxs",
      color: COLOR.muted,
      align: "center",
    });
  }
  const missing = !hasPromptPay && !hasBank;
  return {
    type: "flex",
    altText: `${input.who} โอน ${baht(input.shareSatang)} ให้ ${input.payerName} (${input.title})`,
    contents: topicBubble({
      icon: "💸",
      title: `ส่วนของ ${input.who}`,
      subtitle: `${input.title} · โอนให้ ${input.payerName}`,
      tagline: "สแกนในแอปธนาคาร ยอดเงินจะขึ้นให้เอง",
      body: [
        {
          type: "text",
          text: baht(input.shareSatang),
          size: "3xl",
          weight: "bold",
          color: COLOR.primary,
          align: "center",
          margin: "md",
        },
        ...(hasPromptPay && input.qrUrl
          ? [
              {
                type: "image",
                url: input.qrUrl,
                size: "full",
                aspectMode: "fit",
                aspectRatio: "1:1",
                margin: "md",
              },
            ]
          : []),
        ...lines,
        ...(missing
          ? [
              {
                type: "text",
                text: `${input.payerName} ยังไม่ได้ตั้งพร้อมเพย์หรือบัญชี ให้พิมพ์ “พร้อมเพย์ 0812345678” ในแชทส่วนตัวกับบอทก่อน แล้วกด “จ่ายส่วนของฉัน” อีกครั้ง`,
                size: "xs",
                color: COLOR.muted,
                wrap: true,
                margin: "md",
              },
            ]
          : []),
        ...(hasPromptPay
          ? [
              {
                type: "text",
                text: "กดรูป QR ค้างเพื่อบันทึก แล้วในแอปธนาคารเลือก “สแกนจากรูป/อัลบั้ม”",
                size: "xxs",
                color: COLOR.muted,
                wrap: true,
                align: "center",
                margin: "md",
              },
            ]
          : []),
      ],
      ...(hasPromptPay && input.qrUrl
        ? {
            footer: [
              button("secondary", {
                type: "uri",
                label: "🔍 เปิดรูป QR ขนาดใหญ่",
                uri: input.qrUrl,
              }),
            ],
          }
        : {}),
    }),
  };
}

/** "ตามเงิน": who still owes, bill by bill. */
export function buildChaseCard(input: {
  bills: { bill: BillRow; members: BillMemberRow[]; payerName: string }[];
  nameOf: (lineUserId: string) => string;
  appUrl?: string;
}): LineMessage {
  const total = input.bills.reduce((s, b) => s + totalOwed(b.members, b.bill.payerLineUserId), 0);
  const blocks = input.bills.slice(0, 6).flatMap(({ bill, members, payerName }) => {
    const left = unpaid(members, bill.payerLineUserId);
    return [
      {
        type: "text",
        text: `🍽️ ${bill.title} · จ่ายโดย ${payerName}`,
        size: "xs",
        weight: "bold",
        color: COLOR.muted,
        wrap: true,
        margin: "lg",
      },
      ...left
        .slice(0, 12)
        .map((m) => tile(OWED_BG, input.nameOf(m.lineUserId), baht(m.shareSatang ?? 0))),
      ...(left.length > 12
        ? [{ type: "text", text: `…และอีก ${left.length - 12} คน`, size: "xs", color: COLOR.muted }]
        : []),
    ];
  });
  return {
    type: "flex",
    altText: `ตามเงิน: ค้างรวม ${baht(total)}`,
    contents: topicBubble({
      icon: "📣",
      title: "ตามเงิน",
      subtitle: `ยอดที่ยังค้างรวม ${baht(total)}`,
      tagline: "กด “จ่ายส่วนของฉัน” ที่การ์ดบิลเพื่อรับ QR ยอดของตัวเอง",
      appUrl: input.appUrl,
      body: blocks,
    }),
  };
}
