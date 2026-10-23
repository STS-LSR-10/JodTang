import type { PersonaId } from "@/lib/personalize";
import type { Plan } from "@/lib/plan";
import type { LineMessage } from "@/lib/types";
import { COLOR } from "./flex";

/** The lowest plan that has a thing (Ultimate includes everything Professional has). */
type Need = "free" | "plus" | "ultimate";

const RANK: Record<Plan, number> = { free: 0, plus: 1, ultimate: 2 };
const NEED_RANK: Record<Need, number> = { free: 0, plus: 1, ultimate: 2 };

export interface HelpItem {
  /** An emoji for the round icon at the left of the row. */
  icon: string;
  /** What to type, e.g. "สรุปวันนี้" or "กาแฟ 30". */
  cmd: string;
  /** One short line: what it does. */
  desc: string;
  need: Need;
  /**
   * Tapping the row sends this text as if the person typed it. Only read-only commands get one: an
   * example that records or deletes something is never a button, so nobody saves or loses an entry by
   * trying the help.
   */
  send?: string;
}

export type HelpTopicId =
  | "record"
  | "special"
  | "summary"
  | "search"
  | "wallet"
  | "budget"
  | "debt"
  | "other"
  | "shortcuts";

export interface HelpTopic {
  id: HelpTopicId;
  /** The chip under the question (20 characters at most). */
  chip: string;
  icon: string;
  title: string;
  subtitle: string;
  /** A short closing line at the foot of the card. */
  tagline: string;
  /** At most 6: more does not fit a phone screen. */
  items: HelpItem[];
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "record",
    chip: "📝 จดรายการ",
    icon: "📝",
    title: "จดรายการ",
    subtitle: "พิมพ์ชื่อรายการ แล้วตามด้วยจำนวนเงิน",
    tagline: "พิมพ์สั้น ๆ ก็จดเสร็จแล้ว",
    items: [
      { icon: "☕", cmd: "กาแฟ 30", desc: "จดรายจ่าย (ทศนิยมได้ เช่น ข้าว 50.50)", need: "free" },
      { icon: "💰", cmd: "เงินเดือน 20000", desc: "จดรายรับ (ใส่คอมมาได้ 20,000)", need: "free" },
      { icon: "➕", cmd: "+500 ขายของ", desc: "ใส่ + เป็นรายรับ · − เป็นรายจ่าย", need: "free" },
      {
        icon: "📅",
        cmd: "เมื่อวาน กาแฟ 45",
        desc: "จดย้อนหลัง · หรือ 12/10 ค่าไฟ 1200",
        need: "plus",
      },
      {
        icon: "🧾",
        cmd: "ข้าว 50, กาแฟ 45",
        desc: "หลายรายการ คั่นด้วยคอมมาหรือขึ้นบรรทัดใหม่",
        need: "plus",
      },
      {
        icon: "🏷️",
        cmd: "หมูกระทะ 500 #ปาร์ตี้",
        desc: "ติดแท็ก # เพื่อค้นหาทีหลัง",
        need: "plus",
      },
    ],
  },
  {
    id: "special",
    chip: "📷 จดแบบพิเศษ",
    icon: "📷",
    title: "จดแบบพิเศษ",
    subtitle: "ส่งรูป ส่งเสียง หรือเงินต่างประเทศ",
    tagline: "ไม่ต้องพิมพ์เองก็จดได้",
    items: [
      { icon: "📷", cmd: "ส่งรูปสลิป", desc: "บอทอ่านยอดให้ · Free ลองฟรี 1 ใบ", need: "free" },
      {
        icon: "🎤",
        cmd: "ส่งข้อความเสียง",
        desc: "พูดว่า “กาแฟสามสิบบาท” · Free ลองฟรี 1 ครั้ง",
        need: "plus",
      },
      { icon: "👛", cmd: "กาแฟ 45 @KTC", desc: "จดลงกระเป๋าที่ต้องการ", need: "plus" },
      { icon: "💴", cmd: "ราเมน 1500 JPY", desc: "เงินต่างสกุล แปลงเป็นบาทให้", need: "ultimate" },
      {
        icon: "✨",
        cmd: "พิมพ์เป็นประโยคยาว ๆ",
        desc: "AI ช่วยอ่านแล้วถามยืนยันก่อนจด",
        need: "ultimate",
      },
    ],
  },
  {
    id: "summary",
    chip: "📊 สรุป",
    icon: "📊",
    title: "สรุป",
    subtitle: "แตะที่แถวเพื่อดูได้เลย",
    tagline: "รู้ทันทีว่าเงินไปไหนบ้าง",
    items: [
      {
        icon: "☀️",
        cmd: "สรุปวันนี้",
        desc: "รายรับ รายจ่าย คงเหลือของวันนี้",
        need: "free",
        send: "สรุปวันนี้",
      },
      {
        icon: "🗓️",
        cmd: "สรุปเดือนนี้",
        desc: "ตามรอบงบ พร้อมเทียบเดือนก่อน",
        need: "free",
        send: "สรุปเดือนนี้",
      },
      { icon: "🥧", cmd: "สรุปหมวด", desc: "รายจ่ายแยกตามหมวด", need: "free", send: "สรุปหมวด" },
      { icon: "🕘", cmd: "ล่าสุด", desc: "5 รายการล่าสุด", need: "free", send: "ล่าสุด" },
      { icon: "📆", cmd: "สรุปปี", desc: "ภาพรวมทั้งปี", need: "plus", send: "สรุปปี" },
      {
        icon: "⚖️",
        cmd: "เทียบเดือน",
        desc: "เทียบเดือนต่อเดือนรายหมวด",
        need: "plus",
        send: "เทียบเดือน",
      },
    ],
  },
  {
    id: "search",
    chip: "🔎 ค้นหา/วิเคราะห์",
    icon: "🔎",
    title: "ค้นหาและวิเคราะห์",
    subtitle: "เจาะลึกการใช้จ่ายของคุณ",
    tagline: "ให้ตัวเลขช่วยตัดสินใจ",
    items: [
      { icon: "🗓️", cmd: "สรุป 1/10 ถึง 15/10", desc: "เลือกช่วงวันเอง", need: "plus" },
      { icon: "🔎", cmd: "ค้นหา กาแฟ", desc: "หารายการพร้อมยอดรวม", need: "plus" },
      { icon: "🔮", cmd: "พยากรณ์", desc: "คาดเงินปลายรอบ", need: "ultimate", send: "พยากรณ์" },
      { icon: "🧠", cmd: "วิเคราะห์", desc: "AI วิเคราะห์การใช้จ่าย", need: "ultimate" },
    ],
  },
  {
    id: "wallet",
    chip: "👛 กระเป๋า/บัตร",
    icon: "👛",
    title: "กระเป๋าและบัตร",
    subtitle: "แยกเงินสด บัญชี บัตรเครดิต",
    tagline: "แยกเงินให้เป็นระเบียบ",
    items: [
      { icon: "👛", cmd: "กระเป๋า", desc: "ยอดแต่ละใบและยอดรวม", need: "free", send: "กระเป๋า" },
      {
        icon: "🔁",
        cmd: "โอน 500 เงินสด>KTC",
        desc: "โอนระหว่างกระเป๋า ไม่นับเป็นรายจ่าย",
        need: "plus",
      },
      {
        icon: "💳",
        cmd: "บัตร",
        desc: "วงเงิน และยอดตามรอบบิลของบัตรเครดิต",
        need: "plus",
        send: "บัตร",
      },
      {
        icon: "💞",
        cmd: "เชิญ กองกลาง",
        desc: "ชวนแฟนใช้กระเป๋าร่วมกัน (ได้รหัส 6 หลัก)",
        need: "plus",
      },
      {
        icon: "🔑",
        cmd: "ร่วมกระเป๋า 123456",
        desc: "เข้ากระเป๋าร่วมด้วยรหัสที่ได้รับ",
        need: "free",
      },
    ],
  },
  {
    id: "budget",
    chip: "🎯 งบและเป้าหมาย",
    icon: "🎯",
    title: "งบและเป้าหมาย",
    subtitle: "คุมรายจ่ายและเก็บเงิน",
    tagline: "ค่อย ๆ เก็บ ถึงเป้าแน่นอน",
    items: [
      { icon: "⏰", cmd: "งบวัน 500", desc: "ตั้งงบรายวัน เกินแล้วบอทเตือนทันที", need: "plus" },
      {
        icon: "📉",
        cmd: "งบวัน",
        desc: "ดูสถานะงบวันนี้ · ปิดด้วย งบวัน ปิด",
        need: "plus",
        send: "งบวัน",
      },
      { icon: "🐷", cmd: "เป้าหมาย", desc: "ดูกระปุกออมทั้งหมด", need: "plus", send: "เป้าหมาย" },
      {
        icon: "🌱",
        cmd: "เป้าหมาย ใหม่ เที่ยวญี่ปุ่น 30000",
        desc: "สร้างกระปุกใหม่",
        need: "plus",
      },
      {
        icon: "🪙",
        cmd: "ออม เที่ยวญี่ปุ่น 2000",
        desc: "หยอดเงิน · ถอนด้วย ถอน … 500",
        need: "plus",
      },
    ],
  },
  {
    id: "debt",
    chip: "🤝 หนี้และบิล",
    icon: "🤝",
    title: "หนี้และบิล",
    subtitle: "ให้ยืม ยืม และเตือนวันจ่าย",
    tagline: "ไม่ลืมทั้งเงินที่ต้องจ่ายและเงินที่ต้องได้คืน",
    items: [
      {
        icon: "🤲",
        cmd: "ให้ยืม สมชาย 500",
        desc: "จดเงินที่ให้ยืม · ยืม แม่ 2000 คืน 25/10",
        need: "ultimate",
      },
      {
        icon: "✅",
        cmd: "สมชายคืน 200",
        desc: "จดเงินที่คืนมา · คืนแม่ 1000 เมื่อคืนเอง",
        need: "ultimate",
      },
      { icon: "📒", cmd: "หนี้", desc: "ยอดค้างทั้งหมด", need: "ultimate", send: "หนี้" },
      {
        icon: "🧾",
        cmd: "บิล",
        desc: "บิลที่ต้องจ่ายและวันครบกำหนด",
        need: "ultimate",
        send: "บิล",
      },
      {
        icon: "🔔",
        cmd: "บิล ใหม่ ค่าไฟ 1250 ทุกวันที่ 15",
        desc: "ตั้งเตือนก่อนครบกำหนด · จ่ายแล้วพิมพ์ จ่ายบิล ค่าไฟ",
        need: "ultimate",
      },
    ],
  },
  {
    id: "other",
    chip: "✏️ อื่น ๆ",
    icon: "✏️",
    title: "แก้ไข ตังสะสม ชวนเพื่อน",
    subtitle: "คำสั่งอื่น ๆ ที่ใช้บ่อย",
    tagline: "จดผิดก็แก้ได้ในพริบตา",
    items: [
      { icon: "🗑️", cmd: "ลบล่าสุด", desc: "ลบรายการล่าสุด", need: "free" },
      { icon: "✏️", cmd: "แก้ล่าสุด 45", desc: "เปลี่ยนจำนวนเงินรายการล่าสุด", need: "free" },
      {
        icon: "🎁",
        cmd: "ตังสะสม",
        desc: "ดูแต้มและจดต่อเนื่องกี่วัน",
        need: "free",
        send: "ตังสะสม",
      },
      {
        icon: "📣",
        cmd: "รหัสชวน",
        desc: "รหัสชวนเพื่อน ได้โบนัสทั้งสองฝ่าย",
        need: "free",
        send: "รหัสชวน",
      },
      { icon: "🎟️", cmd: "ใช้รหัส ABCD1234", desc: "ใส่รหัสของเพื่อน", need: "free" },
    ],
  },
  {
    id: "shortcuts",
    chip: "🚀 ทางลัด",
    icon: "🚀",
    title: "ทางลัด",
    subtitle: "เปิดหน้าต่าง ๆ ในแอป",
    tagline: "ดูภาพรวมได้ละเอียดกว่าในแอป",
    items: [],
  },
];

const TOPIC_IDS = new Set<string>(HELP_TOPICS.map((t) => t.id));
export const isHelpTopic = (value: unknown): value is HelpTopicId =>
  typeof value === "string" && TOPIC_IDS.has(value);

/** The row of topic chips under the question and under every topic card (so it stays on screen). */
function chips(): unknown {
  return {
    items: HELP_TOPICS.map((t) => ({
      type: "action",
      action: { type: "postback", label: t.chip, data: `a=help&t=${t.id}`, displayText: t.chip },
    })),
  };
}

/** The question after "วิธีใช้งาน", in the chosen manner of the bot, with the topic chips under it. */
export function buildHelpPrompt(persona: PersonaId = "polite"): LineMessage {
  const wording: Record<PersonaId, string> = {
    polite: "อยากรู้เรื่องไหนเป็นพิเศษคะ แตะหัวข้อด้านล่างเพื่อดูวิธีใช้ได้เลยค่ะ ✨",
    friendly: "อยากรู้เรื่องไหนบอกได้เลยเพื่อน! จิ้มหัวข้อข้างล่างได้เลย 😎",
    strict: "ยังไม่รู้จะเริ่มตรงไหนใช่ไหม? เลือกหัวข้อข้างล่าง แล้วอ่านให้จบนะ! 📖",
    cheer: "ถามไว้ก่อนเก่งมากเลย! เลือกหัวข้อด้านล่าง เดี๋ยวบอกให้ละเอียดเลยนะ 🌟",
  };
  return { type: "text", text: wording[persona], quickReply: chips() };
}

/** Pastel tiles, one colour after another, like a sticker sheet. */
const TILE_COLORS = ["#FDECEF", "#E8F8EF", "#E8F1FD", "#EFEBFD", "#E3F7F4", "#FFF1E5"];
const TILE_LOCKED = "#F1F5F9";

const BADGE: Record<Exclude<Need, "free">, { label: string; bg: string; fg: string }> = {
  plus: { label: "Pro", bg: "#FEF3C7", fg: "#92400E" },
  ultimate: { label: "Ultimate", bg: "#EDE9FE", fg: "#5B21B6" },
};

const LOCKED_TEXT = "#94A3B8";

function row(item: HelpItem, index: number, plan: Plan) {
  const has = RANK[plan] >= NEED_RANK[item.need];
  const tappable = has && item.send !== undefined;
  const badge = item.need === "free" ? null : BADGE[item.need];
  return {
    type: "box",
    layout: "horizontal",
    spacing: "md",
    alignItems: "center",
    margin: "sm",
    paddingAll: "10px",
    cornerRadius: "14px",
    backgroundColor: has ? TILE_COLORS[index % TILE_COLORS.length] : TILE_LOCKED,
    ...(tappable
      ? { action: { type: "message", label: item.cmd.slice(0, 20), text: item.send } }
      : {}),
    contents: [
      {
        type: "box",
        layout: "vertical",
        width: "40px",
        height: "40px",
        cornerRadius: "20px",
        backgroundColor: "#FFFFFF",
        justifyContent: "center",
        alignItems: "center",
        flex: 0,
        contents: [
          { type: "text", text: item.icon, size: "lg", align: "center", color: "#000000" },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        flex: 1,
        contents: [
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: item.cmd,
                size: "sm",
                weight: "bold",
                color: has ? "#14352E" : LOCKED_TEXT,
                wrap: true,
                flex: 1,
              },
              ...(badge
                ? [
                    {
                      type: "box",
                      layout: "vertical",
                      backgroundColor: badge.bg,
                      cornerRadius: "10px",
                      paddingTop: "2px",
                      paddingBottom: "2px",
                      paddingStart: "8px",
                      paddingEnd: "8px",
                      flex: 0,
                      contents: [
                        {
                          type: "text",
                          text: has ? `${badge.label} ✓` : badge.label,
                          size: "xxs",
                          weight: "bold",
                          color: badge.fg,
                        },
                      ],
                    },
                  ]
                : []),
            ],
          },
          {
            type: "text",
            text: tappable ? `${item.desc} · แตะเพื่อดู` : item.desc,
            size: "xs",
            color: has ? COLOR.muted : LOCKED_TEXT,
            wrap: true,
          },
        ],
      },
    ],
  };
}

const SHORTCUTS: { label: string; path: string }[] = [
  { label: "📊 หน้าสรุป", path: "/summary" },
  { label: "🧾 หน้ารายการ", path: "/transactions" },
  { label: "🏷️ หมวดและงบ", path: "/budgets" },
  { label: "⚙️ ตั้งค่า", path: "/settings" },
  { label: "⭐ อัปเกรด", path: "/upgrade" },
];

/**
 * One topic as a card: a soft header with a big icon, then a coloured tile per thing you can do, with
 * its plan badge (dimmed when the person's plan lacks it), then a closing line with the app logo.
 * The topic chips ride along so they stay under the latest message.
 */
export function buildHelpTopicCard(input: {
  topic: HelpTopicId;
  plan: Plan;
  appUrl?: string;
}): LineMessage {
  const topic = HELP_TOPICS.find((t) => t.id === input.topic) ?? (HELP_TOPICS[0] as HelpTopic);
  const body =
    topic.id === "shortcuts"
      ? input.appUrl
        ? SHORTCUTS.map((s) => ({
            type: "button",
            style: "secondary",
            height: "sm",
            margin: "sm",
            action: { type: "uri", label: s.label, uri: `${input.appUrl}${s.path}` },
          }))
        : [
            {
              type: "text",
              text: "เปิดจากเมนูด้านล่างของแชทได้เลย",
              size: "sm",
              color: COLOR.muted,
              wrap: true,
            },
          ]
      : topic.items.map((item, i) => row(item, i, input.plan));
  return {
    type: "flex",
    altText: `วิธีใช้: ${topic.title}`,
    quickReply: chips(),
    contents: topicBubble({
      icon: topic.icon,
      title: topic.title,
      subtitle: topic.subtitle,
      tagline: topic.tagline,
      body,
      appUrl: input.appUrl,
    }),
  };
}

/**
 * The look every how-to card shares (private topics, the group guide, the group welcome): a soft header
 * with a big icon, a body of coloured tiles, and a foot with the app logo and a closing line (or, for
 * the welcome, its own buttons).
 */
export function topicBubble(input: {
  icon: string;
  title: string;
  subtitle: string;
  tagline?: string;
  body: unknown[];
  appUrl?: string;
  footer?: unknown[];
}) {
  const logo =
    input.appUrl?.startsWith("https://") === true
      ? [
          {
            type: "image",
            url: `${input.appUrl}/logo.png`,
            size: "36px",
            aspectMode: "fit",
            flex: 0,
          },
        ]
      : [];
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: COLOR.primarySoft,
      paddingAll: "16px",
      spacing: "md",
      alignItems: "center",
      contents: [
        { type: "text", text: input.icon, size: "4xl", flex: 0 },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          flex: 1,
          contents: [
            {
              type: "text",
              text: input.title,
              weight: "bold",
              size: "xl",
              color: "#0B5D4F",
              wrap: true,
            },
            { type: "text", text: input.subtitle, size: "xs", color: "#3F6B63", wrap: true },
          ],
        },
        // a card with its own buttons has no logo line at the foot, so the logo rides in the header
        ...(input.footer ? logo : []),
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      spacing: "none",
      contents: input.body,
    },
    footer: input.footer
      ? {
          type: "box",
          layout: "vertical",
          paddingAll: "12px",
          spacing: "sm",
          contents: input.footer,
        }
      : {
          type: "box",
          layout: "horizontal",
          paddingAll: "12px",
          spacing: "md",
          alignItems: "center",
          contents: [
            ...logo,
            {
              type: "text",
              text: input.tagline ?? "",
              size: "xs",
              color: COLOR.muted,
              wrap: true,
              flex: 1,
            },
          ],
        },
  };
}

/** The greeting for a new friend: three ways to record, and a button to the full guide. */
export function buildWelcomeCard(input: { appUrl?: string }): LineMessage {
  const example = (cmd: string, desc: string) => ({
    type: "box",
    layout: "horizontal",
    spacing: "md",
    alignItems: "center",
    margin: "sm",
    contents: [
      {
        type: "text",
        text: cmd,
        size: "sm",
        weight: "bold",
        color: "#14352E",
        flex: 4,
        wrap: true,
      },
      { type: "text", text: desc, size: "xs", color: COLOR.muted, flex: 3, wrap: true },
    ],
  });
  return {
    type: "flex",
    altText: "สวัสดี! เราคือจดตังค์ พิมพ์ เช่น กาแฟ 30 หรือ เงินเดือน 20000 ได้เลย",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLOR.primarySoft,
        paddingAll: "18px",
        spacing: "xs",
        contents: [
          {
            type: "text",
            text: "สวัสดี! เราคือจดตังค์ 👋",
            weight: "bold",
            size: "lg",
            color: "#0B5D4F",
          },
          {
            type: "text",
            text: "ผู้ช่วยจดรายรับรายจ่ายของคุณ พิมพ์สั้น ๆ ได้เลย",
            size: "xs",
            color: "#3F6B63",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "ลองพิมพ์ดู", size: "xs", weight: "bold", color: COLOR.muted },
          example("กาแฟ 30", "จดรายจ่าย"),
          example("เงินเดือน 20000", "จดรายรับ"),
          example("+500 ขายของ", "ใส่ + เป็นรายรับ"),
          example("ส่งรูปสลิป", "บอทอ่านให้ (ลองฟรี 1 ใบ)"),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: COLOR.primary,
            action: { type: "message", label: "ดูวิธีใช้ทั้งหมด", text: "วิธีใช้งาน" },
          },
          ...(input.appUrl
            ? [
                {
                  type: "button",
                  style: "secondary",
                  height: "sm",
                  action: { type: "uri", label: "เปิดหน้าสรุป", uri: `${input.appUrl}/summary` },
                },
              ]
            : []),
        ],
      },
    },
  };
}

const GROUP_ITEMS: HelpItem[] = [
  {
    icon: "🧾",
    cmd: "จด ข้าวเที่ยง 350",
    desc: "จดรายจ่าย ต้องขึ้นต้นด้วย “จด” (ข้อความคุยทั่วไปบอทไม่จด) · หลายรายการ: จด กาแฟ 90, ขนม 40 (สูงสุด 5)",
    need: "free",
  },
  { icon: "📊", cmd: "สรุป · สรุปวันนี้", desc: "ยอดรวมกลุ่มและใครจ่ายไปเท่าไร", need: "free" },
  {
    icon: "🕘",
    cmd: "ล่าสุด · ลบล่าสุด",
    desc: "ดู 5 รายการล่าสุด · ลบรายการล่าสุดของตัวเอง",
    need: "free",
  },
  {
    icon: "🍽️",
    cmd: "หารบิล หมูกระทะ 1200",
    desc: "คนจ่ายก่อนพิมพ์ แล้วเลือกคนหาร (หรือพิมพ์ ทั้งหมด ต่อท้าย) บอทส่ง QR พร้อมเพย์ยอดรายคนเข้ากลุ่ม · โอนแล้วส่งสลิป บอทตรวจให้ · ตามเงิน ดูว่าใครยังค้าง",
    need: "free",
  },
  {
    icon: "✈️",
    cmd: "เริ่มทริป · สรุปทริป · จบทริป",
    desc: "หารค่าใช้จ่ายทริป ดูว่าใครโอนคืนใคร",
    need: "free",
  },
  { icon: "🔒", cmd: "ปิดสมุดกลุ่ม", desc: "เฉพาะเจ้าของสมุด", need: "free" },
];

/**
 * How to use the group ledger, in the same look as the private how-to cards. Everyone in the group
 * reads it, so there are no buttons that send messages.
 */
export function buildGroupHelpCard(input: { appUrl?: string } = {}): LineMessage {
  return {
    type: "flex",
    altText: "วิธีใช้สมุดกลุ่ม: จด ข้าวเที่ยง 350 · สรุป · ล่าสุด · ลบล่าสุด",
    contents: topicBubble({
      icon: "👥",
      title: "วิธีใช้สมุดกลุ่ม",
      subtitle: "ช่วยกันจด ดูว่าใครจ่ายไปเท่าไร",
      tagline: "บอทรู้ว่าใครจ่ายจากบัญชี LINE ของคนที่พิมพ์ (ต้องเพิ่มบอทเป็นเพื่อนไว้ก่อน)",
      body: GROUP_ITEMS.map((item, i) => row(item, i, "free")),
      appUrl: input.appUrl,
    }),
  };
}

/**
 * What the group sees when the bot is added: who it is for, three steps to start, and two buttons that
 * type the command for whoever taps them ("เปิดสมุดกลุ่ม" needs an Ultimate member, anyone else is told
 * so by the bot). Groups have no single person's theme, so it keeps the default colours.
 */
export function buildGroupWelcomeCard(input: { appUrl?: string }): LineMessage {
  const who: HelpItem[] = [
    { icon: "👨‍👩‍👧", cmd: "ครอบครัว · คู่รัก", desc: "ดูว่าเงินกองกลางไปไหนบ้าง", need: "free" },
    {
      icon: "✈️",
      cmd: "กลุ่มเพื่อนไปเที่ยว",
      desc: "หารค่าทริปและสรุปว่าใครโอนคืนใคร",
      need: "free",
    },
    {
      icon: "🏠",
      cmd: "เพื่อนร่วมบ้าน · ร่วมห้อง",
      desc: "จดค่าส่วนกลางและของใช้ร่วมกัน",
      need: "free",
    },
  ];
  const step = (n: string, text: string, hint: string) => ({
    type: "box",
    layout: "horizontal",
    spacing: "md",
    margin: "md",
    contents: [
      {
        type: "box",
        layout: "vertical",
        width: "24px",
        height: "24px",
        cornerRadius: "12px",
        backgroundColor: COLOR.primary,
        justifyContent: "center",
        alignItems: "center",
        flex: 0,
        contents: [
          { type: "text", text: n, size: "xs", weight: "bold", color: "#FFFFFF", align: "center" },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        flex: 1,
        contents: [
          { type: "text", text, size: "sm", weight: "bold", color: "#14352E", wrap: true },
          { type: "text", text: hint, size: "xs", color: COLOR.muted, wrap: true },
        ],
      },
    ],
  });
  return {
    type: "flex",
    altText: 'จดตังค์มาแล้ว! ช่วยกันจดรายจ่ายในกลุ่ม แตะ "เปิดสมุดกลุ่ม" เพื่อเริ่ม',
    contents: topicBubble({
      icon: "👋",
      title: "จดตังค์ มาช่วยจดแล้ว",
      subtitle: "ช่วยกันจดรายจ่ายของกลุ่ม ดูว่าใครจ่ายไปเท่าไร",
      appUrl: input.appUrl,
      body: [
        {
          type: "text",
          text: "เหมาะกับ",
          size: "xs",
          weight: "bold",
          color: COLOR.muted,
          margin: "sm",
        },
        ...who.map((item, i) => row(item, i, "free")),
        { type: "separator", margin: "lg" },
        {
          type: "text",
          text: "เริ่มใช้ใน 3 ขั้น",
          size: "xs",
          weight: "bold",
          color: COLOR.muted,
          margin: "lg",
        },
        step(
          "1",
          "กดปุ่ม “เปิดสมุดกลุ่ม”",
          "ผู้เปิดสมุดต้องเป็น Ultimate (ทดลองฟรี 7 วันได้) เพื่อน ๆ จดได้ฟรี",
        ),
        step(
          "2",
          "จดรายจ่าย พิมพ์ จด ข้าวเที่ยง 350",
          "ต้องขึ้นต้นด้วย “จด” ข้อความคุยทั่วไปบอทไม่จด",
        ),
        step("3", "พิมพ์ สรุป", "ดูยอดรวมและใครจ่ายไปเท่าไร"),
      ],
      footer: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: COLOR.primary,
          action: { type: "message", label: "📒 เปิดสมุดกลุ่ม", text: "เปิดสมุดกลุ่ม" },
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: { type: "message", label: "📖 วิธีใช้งาน", text: "วิธีใช้งาน" },
        },
      ],
    }),
  };
}
