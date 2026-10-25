import { categoryLabel } from "@/lib/category-emoji";
import { formatBaht } from "@/lib/money";
import { bangkokParts, formatThaiDate } from "@/lib/thai-date";
import type { ConfirmStyle, LineMessage, TxType } from "@/lib/types";

// Design tokens (see docs/design-tokens.md)
export const COLOR = {
  primary: "#0F766E",
  primarySoft: "#CCFBF1",
  expense: "#E11D48",
  income: "#059669",
  text: "#0F172A",
  muted: "#64748B",
  surface: "#FFFFFF",
} as const;

export interface ConfirmCardInput {
  style: Exclude<ConfirmStyle, "off">;
  txId: string;
  type: TxType;
  title: string;
  categoryName: string | null;
  amountSatang: number;
  occurredAt: Date;
  /** #tags on the entry (without the #). */
  tags?: string[];
  /** Total of this category in the current budget cycle, including this entry. */
  cycleTotalSatang: number | null;
  /** e.g. "รายเดือน (วันที่ 1)"; shown under the category total. */
  cycleLabel?: string;
  /** Wallet the entry went to, e.g. "💳 บัตร KTC" (shown only when there is more than one wallet). */
  walletName?: string | null;
  /** Foreign-currency entry: "1,500 JPY @ 0.2335" (shown under the date). */
  fxNote?: string | null;
  /** Offer the "ย้ายกระเป๋า" button (the user has two or more wallets). */
  canMoveWallet?: boolean;
  /** LIFF page that edits this entry; the "แก้" chip opens it (falls back to a chat hint without it). */
  editUrl?: string;
  /** The card confirms an edit ("แก้ไขรายการสำเร็จ") rather than a new entry. */
  edited?: boolean;
  /** Public PNG of the logo for the card header (omitted when the app URL is unknown). */
  logoUrl?: string;
}

const TYPE_LABEL: Record<TxType, string> = { expense: "รายจ่าย", income: "รายรับ" };

export function row(label: string, value: string) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: COLOR.muted, flex: 2 },
      {
        type: "text",
        text: value,
        size: "sm",
        color: COLOR.text,
        flex: 5,
        wrap: true,
        align: "end",
      },
    ],
  };
}

export function shareText(input: ConfirmCardInput): string {
  const sign = input.type === "income" ? "+" : "-";
  return `${input.title} ${sign}฿${formatBaht(input.amountSatang)} (${formatThaiDate(input.occurredAt)}) · จดด้วยจดตังค์`;
}

const chip = (label: string, bg: string, color: string, action: unknown, width = "40px") => ({
  type: "box",
  layout: "vertical",
  width,
  height: "36px",
  cornerRadius: "10px",
  backgroundColor: bg,
  justifyContent: "center",
  alignItems: "center",
  flex: 0,
  action,
  contents: [{ type: "text", text: label, size: "xs", weight: "bold", color, align: "center" }],
});

export function buildConfirmMessage(input: ConfirmCardInput): LineMessage {
  const amountText = `฿${formatBaht(input.amountSatang)}`;
  const category = input.categoryName ?? "ไม่ระบุหมวด";
  const tagsText = input.tags?.length ? ` ${input.tags.map((t) => `#${t}`).join(" ")}` : "";

  const walletText = input.walletName ? ` · ${input.walletName}` : "";
  const moveItem = input.canMoveWallet
    ? [
        {
          type: "action",
          action: {
            type: "postback",
            label: "💳 ย้ายกระเป๋า",
            data: `a=wl&id=${input.txId}`,
            displayText: "ย้ายกระเป๋า",
          },
        },
      ]
    : [];

  if (input.style === "short") {
    return {
      type: "text",
      text: `${input.edited ? "แก้ไขรายการสำเร็จ" : "จดแล้ว"}: ${input.title} ${amountText} · ${category}${tagsText}${walletText}${input.fxNote ? ` · ${input.fxNote}` : ""}`,
      // LINE refuses a quick reply with no buttons
      ...(moveItem.length > 0 ? { quickReply: { items: moveItem } } : {}),
    };
  }

  const income = input.type === "income";
  const accent = income ? COLOR.income : COLOR.expense;
  const accentSoft = income ? "#E6F7EF" : "#FDECEC";
  const total = input.cycleTotalSatang;
  // This entry's share of the category total in the cycle (a full bar for the first entry).
  const share =
    total !== null && total > 0
      ? Math.min(100, Math.max(4, (input.amountSatang * 100) / total))
      : 0;

  const header: unknown[] = [
    {
      type: "box",
      layout: "vertical",
      flex: 1,
      spacing: "xs",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          alignItems: "center",
          contents: [
            {
              type: "text",
              text: input.edited ? "แก้ไขรายการสำเร็จ" : "จดสำเร็จ",
              weight: "bold",
              size: "xl",
              color: "#0B5D4F",
              flex: 0,
            },
            {
              type: "box",
              layout: "vertical",
              width: "24px",
              height: "24px",
              cornerRadius: "7px",
              backgroundColor: "#2ECB7A",
              justifyContent: "center",
              alignItems: "center",
              flex: 0,
              contents: [{ type: "text", text: "✓", size: "sm", color: "#FFFFFF", weight: "bold" }],
            },
          ],
        },
        {
          type: "text",
          text: input.edited
            ? "อัปเดตรายการเรียบร้อยแล้ว"
            : income
              ? "เย้! มีเงินเข้ากระเป๋าเพิ่มแล้วนะ"
              : "อย่าลืมตรวจสอบรายการที่จดด้วยนะ",
          size: "xs",
          color: "#3F6B63",
          wrap: true,
        },
      ],
    },
  ];
  // LINE only accepts https image URLs (a local http app URL would make the whole card invalid).
  if (input.logoUrl?.startsWith("https://")) {
    header.push({
      type: "image",
      url: input.logoUrl,
      size: "64px",
      aspectMode: "fit",
      flex: 0,
    });
  }

  const body: unknown[] = [
    {
      type: "box",
      layout: "horizontal",
      spacing: "md",
      alignItems: "center",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: accent,
          cornerRadius: "14px",
          paddingTop: "4px",
          paddingBottom: "4px",
          paddingStart: "12px",
          paddingEnd: "12px",
          flex: 0,
          contents: [
            {
              type: "text",
              text: TYPE_LABEL[input.type],
              size: "sm",
              weight: "bold",
              color: "#FFFFFF",
            },
          ],
        },
        {
          type: "text",
          text: `- ${category}`,
          weight: "bold",
          size: "lg",
          color: "#14352E",
          flex: 1,
        },
        chip("แชร์", accentSoft, accent, {
          type: "uri",
          label: "แชร์",
          uri: `https://line.me/R/share?text=${encodeURIComponent(shareText(input))}`,
        }),
      ],
    },
    {
      type: "text",
      text: formatThaiDate(input.occurredAt, true),
      size: "sm",
      color: COLOR.muted,
      margin: "md",
    },
    ...(input.fxNote
      ? [
          {
            type: "text",
            text: input.fxNote,
            size: "sm",
            color: COLOR.muted,
            margin: "sm",
            wrap: true,
          },
        ]
      : []),
    ...(input.walletName
      ? [{ type: "text", text: input.walletName, size: "sm", color: COLOR.muted, margin: "sm" }]
      : []),
    ...(input.tags && input.tags.length > 0
      ? [
          {
            type: "text",
            text: input.tags.map((t) => `#${t}`).join(" "),
            size: "sm",
            color: COLOR.primary,
            wrap: true,
            margin: "sm",
          },
        ]
      : []),
    {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      alignItems: "center",
      margin: "md",
      contents: [
        {
          type: "text",
          text: input.title,
          weight: "bold",
          size: "lg",
          color: "#334155",
          wrap: true,
          flex: 1,
        },
        {
          type: "text",
          text: `${income ? "+" : ""}${amountText}`,
          weight: "bold",
          size: "lg",
          color: accent,
          flex: 0,
        },
        chip(
          "แก้",
          "#EAEEF0",
          "#334155",
          input.editUrl
            ? { type: "uri", label: "แก้ไข", uri: input.editUrl }
            : {
                type: "postback",
                label: "แก้ไข",
                data: `a=edit&id=${input.txId}`,
                displayText: "แก้ไข",
              },
        ),
        chip("ลบ", accentSoft, COLOR.expense, {
          type: "postback",
          label: "ลบ",
          data: `a=del&id=${input.txId}`,
          displayText: "ลบรายการ",
        }),
      ],
    },
  ];

  if (total !== null) {
    body.push(
      { type: "separator", margin: "lg" },
      {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        margin: "lg",
        alignItems: "center",
        contents: [
          {
            type: "text",
            text: category,
            weight: "bold",
            size: "lg",
            color: "#14352E",
            wrap: true,
            flex: 1,
          },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: `฿${formatBaht(total)}`,
                weight: "bold",
                size: "lg",
                color: accent,
              },
              {
                type: "box",
                layout: "vertical",
                height: "8px",
                cornerRadius: "4px",
                backgroundColor: "#E5EAEE",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    width: `${Math.round(share)}%`,
                    height: "8px",
                    cornerRadius: "4px",
                    backgroundColor: accent,
                    contents: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    );
    if (input.cycleLabel) {
      body.push({
        type: "text",
        text: `รอบงบ: ${input.cycleLabel}`,
        size: "xs",
        color: COLOR.muted,
        align: "end",
        margin: "md",
      });
    }
  }

  if (input.canMoveWallet) {
    body.push({
      type: "button",
      style: "link",
      height: "sm",
      action: {
        type: "postback",
        label: "💳 ย้ายกระเป๋า",
        data: `a=wl&id=${input.txId}`,
        displayText: "ย้ายกระเป๋า",
      },
    });
  }

  return {
    type: "flex",
    altText: `จดแล้ว: ${input.title} ${amountText}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        backgroundColor: COLOR.primarySoft,
        paddingAll: "18px",
        contents: header,
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLOR.surface,
        paddingAll: "18px",
        contents: body,
      },
    },
  };
}
/** Ask whether an ambiguous entry is income or expense (Quick Reply). */
export function buildTypeQuestion(input: {
  txId: string;
  title: string;
  amountSatang: number;
}): LineMessage {
  const action = (label: string, t: string) => ({
    type: "action",
    action: {
      type: "postback",
      label,
      data: `a=pt&id=${input.txId}&t=${t}`,
      displayText: label,
    },
  });
  return {
    type: "text",
    text: `${input.title} ฿${formatBaht(input.amountSatang)} เป็นรายรับหรือรายจ่ายนะ?`,
    quickReply: {
      items: [action("รายจ่าย", "expense"), action("รายรับ", "income"), action("ยกเลิก", "cancel")],
    },
  };
}

/**
 * Card shown when the Rich Menu "จดตังค์" tile is tapped: how to type an entry, plus a button that
 * opens the keyboard (no text is prefilled, so nothing can be sent by accident).
 */
export function buildComposeCard(): LineMessage {
  const bullet = (t: string) => ({
    type: "box",
    layout: "baseline",
    spacing: "md",
    contents: [
      { type: "text", text: "●", size: "xxs", color: "#1ABC9C", flex: 0 },
      { type: "text", text: t, size: "lg", weight: "bold", color: "#334155", flex: 1 },
    ],
  });
  return {
    type: "flex",
    altText: "พิมพ์บอกจดตังค์ได้เลย เช่น ข้าวมันไก่ 50 · เงินเดือน 20000",
    // pick a category first, then only the amount is left to type (see buildCategoryKeyboardList);
    // or pick a past day first (see buildDatePicker)
    quickReply: {
      items: [
        ...(
          [
            ["หมวดรายจ่าย", "expense"],
            ["หมวดรายรับ", "income"],
          ] as const
        ).map(([label, t]) => ({
          type: "action",
          action: { type: "postback", label, data: `a=cp&t=${t}`, displayText: label },
        })),
        {
          type: "action",
          action: {
            type: "postback",
            label: "📅 จดย้อนหลัง",
            data: "a=bd",
            displayText: "จดย้อนหลัง",
          },
        },
      ],
    },
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        paddingAll: "20px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            alignItems: "center",
            contents: [
              {
                type: "box",
                layout: "vertical",
                width: "44px",
                height: "44px",
                cornerRadius: "22px",
                backgroundColor: COLOR.primarySoft,
                justifyContent: "center",
                alignItems: "center",
                flex: 0,
                contents: [{ type: "text", text: "✒️", size: "lg", align: "center" }],
              },
              {
                type: "text",
                text: "พิมพ์บอกจดตังค์ได้เลย เช่น",
                weight: "bold",
                size: "md",
                color: "#334155",
                wrap: true,
                flex: 1,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "md",
            backgroundColor: "#F6F9F8",
            cornerRadius: "14px",
            paddingAll: "16px",
            contents: [bullet("ข้าวมันไก่ 50"), bullet("เงินเดือน 20000")],
          },
          {
            type: "text",
            text: "ระบบจะช่วยจดและแยกหมวดหมู่อัตโนมัติทันทีครับ ✨",
            size: "sm",
            color: COLOR.primary,
            wrap: true,
          },
          {
            type: "button",
            style: "primary",
            color: "#1ABC9C",
            height: "md",
            action: {
              type: "postback",
              label: "จดเลย",
              data: "a=compose-go",
              inputOption: "openKeyboard",
            },
          },
        ],
      },
    },
  };
}

export interface ComposeCategory {
  name: string;
  /** `categories.icon`: an emoji is shown in front of the name on the button. */
  icon?: string | null;
  type: TxType;
  sort_order: number;
  is_hidden: boolean;
}

const MAX_COMPOSE_CATEGORIES = 13; // LINE allows 13 quick-reply buttons
const MAX_COMPOSE_LABEL = 20; // LINE label limit
const CATCH_ALL_NAME = "อื่นๆ"; // exists for both types, so a typed name could not tell them apart

/**
 * Quick Reply list of one type's categories. Tapping one opens the keyboard with the category
 * name already in the box, so the person only types the amount ("อาหาร " + "50"); the text
 * handler then reads the leading category name. Nothing is stored between the two taps.
 */
export function buildCategoryKeyboardList(
  type: TxType,
  categories: ComposeCategory[],
): LineMessage {
  const shown = categories
    .filter((c) => c.type === type && !c.is_hidden && c.name !== CATCH_ALL_NAME)
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, MAX_COMPOSE_CATEGORIES);
  if (shown.length === 0) {
    return {
      type: "text",
      text: 'ยังไม่มีหมวดให้เลือก พิมพ์จดได้เลย เช่น "กาแฟ 30" นะ',
    };
  }
  return {
    type: "text",
    text: "เลือกหมวด แล้วพิมพ์แค่ตัวเลขจำนวนเงินได้เลย เช่น 50",
    quickReply: {
      items: shown.map((c) => ({
        type: "action",
        action: {
          type: "postback",
          label: categoryLabel(c.name, c.icon).slice(0, MAX_COMPOSE_LABEL),
          data: "a=cc",
          inputOption: "openKeyboard",
          fillInText: `${c.name} `,
        },
      })),
    },
  };
}

/** "Send the photo now": camera and gallery shortcuts under the question. */
export function buildPhotoAsk(message: string): LineMessage {
  return {
    type: "text",
    text: message,
    quickReply: {
      items: [
        { type: "action", action: { type: "camera", label: "ถ่ายรูป" } },
        { type: "action", action: { type: "cameraRoll", label: "เลือกจากอัลบั้ม" } },
      ],
    },
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => {
  const p = bangkokParts(d);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
};
const DAY_MS = 86_400_000;
/** How far back the date picker goes. */
export const BACKDATE_MAX_DAYS = 366;

/**
 * Step 1 of "จดย้อนหลัง": the LINE calendar (a quick-reply date picker). It reaches back a year
 * and up to today; the chosen day comes back as a postback `a=bdp` with `params.date`.
 */
export function buildDatePicker(now: Date): LineMessage {
  return {
    type: "text",
    text: "เลือกวันที่ที่ต้องการจดย้อนหลังได้เลย",
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "datetimepicker",
            label: "เลือกวันที่",
            data: "a=bdp",
            mode: "date",
            initial: ymd(new Date(now.getTime() - DAY_MS)),
            max: ymd(now),
            min: ymd(new Date(now.getTime() - BACKDATE_MAX_DAYS * DAY_MS)),
          },
        },
      ],
    },
  };
}

/** The text a backdated entry starts with: "12/10/2026 " (the parser reads it as that day). */
export function backdatePrefix(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year} `;
}

/**
 * Step 2: the day is chosen, so open the keyboard with it already typed. The person adds the item
 * and amount ("กาแฟ 60"); nothing is stored between the two steps.
 */
export function buildBackdatePrompt(isoDate: string, thaiDate: string): LineMessage {
  return {
    type: "text",
    text: `จดย้อนหลังวันที่ ${thaiDate} พิมพ์ชื่อรายการและจำนวนเงินต่อได้เลย เช่น กาแฟ 60`,
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "postback",
            label: "พิมพ์รายการ",
            data: "a=bdk",
            inputOption: "openKeyboard",
            fillInText: backdatePrefix(isoDate),
          },
        },
      ],
    },
  };
}

/**
 * Shortcuts under a summary card: the calendar range (its plan is checked when tapped), the spend
 * by category and the latest entries (the last two just send the command as a message).
 */
export function withSummaryShortcuts(message: LineMessage): LineMessage {
  return {
    ...message,
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "postback",
            label: "📆 ช่วงวันเอง",
            data: "a=sr",
            displayText: "ช่วงวันเอง",
          },
        },
        { type: "action", action: { type: "message", label: "📊 ตามหมวด", text: "สรุปหมวด" } },
        { type: "action", action: { type: "message", label: "🕘 ล่าสุด", text: "ล่าสุด" } },
        { type: "action", action: { type: "message", label: "📈 เทียบเดือน", text: "เทียบเดือน" } },
        { type: "action", action: { type: "message", label: "🗓️ ทั้งปี", text: "สรุปปี" } },
        { type: "action", action: { type: "message", label: "🔮 พยากรณ์", text: "พยากรณ์" } },
        { type: "action", action: { type: "message", label: "🧠 วิเคราะห์", text: "วิเคราะห์" } },
      ],
    },
  };
}

const RANGE_START_YEARS_BACK = 3;

/** Step 1 of a custom range: the first day. The pick comes back as `a=sr1` with params.date. */
export function buildRangeStartPicker(now: Date): LineMessage {
  return {
    type: "text",
    text: "เลือกวันเริ่มต้นของช่วงที่ต้องการสรุป",
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "datetimepicker",
            label: "วันเริ่มต้น",
            data: "a=sr1",
            mode: "date",
            initial: ymd(new Date(now.getTime() - 30 * DAY_MS)),
            max: ymd(now),
            min: ymd(new Date(now.getTime() - RANGE_START_YEARS_BACK * 366 * DAY_MS)),
          },
        },
      ],
    },
  };
}

/** Step 2: the last day, from the chosen first day up to today. The first day rides in `data`. */
export function buildRangeEndPicker(startIso: string, thaiStart: string, now: Date): LineMessage {
  return {
    type: "text",
    text: `เริ่มวันที่ ${thaiStart} เลือกวันสิ้นสุดต่อได้เลย`,
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "datetimepicker",
            label: "วันสิ้นสุด",
            data: `a=sr2&f=${startIso}`,
            mode: "date",
            initial: ymd(now),
            max: ymd(now),
            min: startIso,
          },
        },
      ],
    },
  };
}
