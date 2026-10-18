import { PRICES, TRIAL_DAYS } from "@/lib/pricing";
import type { LineMessage } from "@/lib/types";
import { COLOR } from "./flex";

/** "a=bdt&t=…" must fit LINE's 300-character postback limit. */
const MAX_POSTBACK = 300;

export interface UpsellCardInput {
  feature: "backdate" | "slip";
  /** The Professional trial can still be started from the chat. */
  trialAvailable: boolean;
  /** Public /upgrade page; the button is left out when the app URL is unknown. */
  upgradeUrl?: string;
  /** For the backdated entry: its original text, so "record as today instead" can redo it. */
  retryText?: string;
}

const COPY = {
  backdate: {
    title: "จดย้อนหลังสำหรับสมาชิก Professional",
    body: "ระบบตรวจพบการระบุวันที่ย้อนหลัง (เช่น “เมื่อวาน”) ฟังก์ชันนี้สำหรับสมาชิกแพ็กเกจ Professional ขึ้นไป ยังไม่ได้จดรายการนี้นะ",
  },
  slip: {
    title: "ให้บอทอ่านสลิปให้อัตโนมัติ",
    body: "อยากให้บอทช่วยอ่านสลิปให้อัตโนมัติโดยไม่ต้องพิมพ์เองไหม? ส่งรูปปุ๊บ บันทึกปั๊บ!",
  },
} as const;

const button = (label: string, action: Record<string, unknown>, primary: boolean) => ({
  type: "button",
  style: primary ? "primary" : "secondary",
  height: "sm",
  margin: "sm",
  ...(primary ? { color: COLOR.primary } : {}),
  action: { label, ...action },
});

/** The card that offers an upgrade at the moment a Free user reaches for a paid feature. */
export function buildUpsellCard(input: UpsellCardInput): LineMessage {
  const copy = COPY[input.feature];
  const plus = PRICES.plus.monthly;
  const ultimate = PRICES.ultimate.monthly;
  const price =
    input.feature === "slip"
      ? `Professional ฿${plus}/เดือน อ่านสลิปได้ 5 ใบ/เดือน · Ultimate ฿${ultimate}/เดือน อ่านไม่จำกัด`
      : `อัปเกรดวันนี้เพียง ฿${plus}/เดือน${input.trialAvailable ? ` หรือทดลองใช้ฟรี ${TRIAL_DAYS} วัน!` : ""}`;

  const buttons: unknown[] = [];
  if (input.trialAvailable) {
    buttons.push(
      button(
        `ทดลองใช้ฟรี ${TRIAL_DAYS} วัน`,
        {
          type: "postback",
          data: "a=trial&p=plus",
          displayText: `ทดลองใช้ Professional ฟรี ${TRIAL_DAYS} วัน`,
        },
        true,
      ),
    );
  }
  if (input.upgradeUrl) {
    buttons.push(
      button("ดูแผนและอัปเกรด", { type: "uri", uri: input.upgradeUrl }, !input.trialAvailable),
    );
  }
  if (input.feature === "backdate" && input.retryText) {
    const data = `a=bdt&t=${encodeURIComponent(input.retryText)}`;
    if (data.length <= MAX_POSTBACK) {
      buttons.push(
        button(
          "จดเป็นวันนี้แทน",
          { type: "postback", data, displayText: "จดเป็นวันนี้แทน" },
          false,
        ),
      );
    }
  }

  return {
    type: "flex",
    altText: copy.title,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLOR.primarySoft,
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "⭐ " + copy.title,
            weight: "bold",
            size: "md",
            color: "#0B5D4F",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        spacing: "md",
        contents: [
          { type: "text", text: copy.body, size: "sm", color: COLOR.text, wrap: true },
          {
            type: "text",
            text: price,
            size: "sm",
            weight: "bold",
            color: COLOR.primary,
            wrap: true,
          },
        ],
      },
      ...(buttons.length > 0
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              paddingAll: "12px",
              contents: buttons,
            },
          }
        : {}),
    },
  };
}
