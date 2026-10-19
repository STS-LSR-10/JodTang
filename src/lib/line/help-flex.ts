import type { Plan } from "@/lib/plan";
import type { LineMessage } from "@/lib/types";
import { COLOR } from "./flex";

/** The lowest plan that has a thing (Ultimate includes everything Professional has). */
type Need = "free" | "plus" | "ultimate";

const RANK: Record<Plan, number> = { free: 0, plus: 1, ultimate: 2 };
const NEED_RANK: Record<Need, number> = { free: 0, plus: 1, ultimate: 2 };

export interface HelpItem {
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

export interface HelpSection {
  icon: string;
  title: string;
  subtitle: string;
  items: HelpItem[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    icon: "📝",
    title: "จดรายการ",
    subtitle: "พิมพ์ชื่อรายการ แล้วตามด้วยจำนวนเงิน",
    items: [
      { cmd: "กาแฟ 30", desc: "จดรายจ่าย (ทศนิยมได้ เช่น ข้าว 50.50)", need: "free" },
      { cmd: "เงินเดือน 20000", desc: "จดรายรับ (ใส่คอมมาได้ 20,000)", need: "free" },
      { cmd: "+500 ขายของ", desc: "ใส่ + เป็นรายรับ · − เป็นรายจ่าย", need: "free" },
      { cmd: "เมื่อวาน กาแฟ 45", desc: "จดย้อนหลัง · หรือ 12/10 ค่าไฟ 1200", need: "plus" },
      { cmd: "ข้าว 50, กาแฟ 45", desc: "หลายรายการ คั่นด้วยคอมมาหรือขึ้นบรรทัดใหม่", need: "plus" },
      { cmd: "หมูกระทะ 500 #ปาร์ตี้", desc: "ติดแท็ก # เพื่อค้นหาทีหลัง", need: "plus" },
    ],
  },
  {
    icon: "📷",
    title: "จดแบบพิเศษ",
    subtitle: "ส่งรูป ส่งเสียง หรือเงินต่างประเทศ",
    items: [
      { cmd: "ส่งรูปสลิป", desc: "บอทอ่านยอดให้ · Free ลองฟรี 1 ใบ", need: "free" },
      {
        cmd: "ส่งข้อความเสียง",
        desc: "พูดว่า “กาแฟสามสิบบาท” · Free ลองฟรี 1 ครั้ง",
        need: "plus",
      },
      { cmd: "กาแฟ 45 @KTC", desc: "จดลงกระเป๋าที่ต้องการ", need: "plus" },
      { cmd: "ราเมน 1500 JPY", desc: "เงินต่างสกุล แปลงเป็นบาทให้", need: "ultimate" },
      { cmd: "พิมพ์เป็นประโยคยาว ๆ", desc: "AI ช่วยอ่านแล้วถามยืนยันก่อนจด", need: "ultimate" },
    ],
  },
  {
    icon: "📊",
    title: "สรุปและค้นหา",
    subtitle: "กดที่คำสั่งเพื่อดูได้เลย",
    items: [
      {
        cmd: "สรุปวันนี้",
        desc: "รายรับ รายจ่าย คงเหลือของวันนี้",
        need: "free",
        send: "สรุปวันนี้",
      },
      {
        cmd: "สรุปเดือนนี้",
        desc: "ตามรอบงบ พร้อมเทียบเดือนก่อน",
        need: "free",
        send: "สรุปเดือนนี้",
      },
      { cmd: "สรุปหมวด", desc: "รายจ่ายแยกตามหมวด", need: "free", send: "สรุปหมวด" },
      { cmd: "ล่าสุด", desc: "5 รายการล่าสุด", need: "free", send: "ล่าสุด" },
      { cmd: "สรุปปี", desc: "ภาพรวมทั้งปี", need: "plus", send: "สรุปปี" },
      { cmd: "เทียบเดือน", desc: "เทียบเดือนต่อเดือนรายหมวด", need: "plus", send: "เทียบเดือน" },
      { cmd: "สรุป 1/10 ถึง 15/10", desc: "เลือกช่วงวันเอง", need: "plus" },
      { cmd: "ค้นหา กาแฟ", desc: "หารายการพร้อมยอดรวม", need: "plus" },
      { cmd: "พยากรณ์", desc: "คาดเงินปลายรอบ", need: "ultimate", send: "พยากรณ์" },
      { cmd: "วิเคราะห์", desc: "AI วิเคราะห์การใช้จ่าย", need: "ultimate" },
    ],
  },
  {
    icon: "👛",
    title: "กระเป๋าและบัตร",
    subtitle: "แยกเงินสด บัญชี บัตรเครดิต",
    items: [
      { cmd: "กระเป๋า", desc: "ยอดแต่ละใบและยอดรวม", need: "free", send: "กระเป๋า" },
      { cmd: "โอน 500 เงินสด>KTC", desc: "โอนระหว่างกระเป๋า ไม่นับเป็นรายจ่าย", need: "plus" },
      { cmd: "บัตร", desc: "วงเงิน และยอดตามรอบบิลของบัตรเครดิต", need: "plus", send: "บัตร" },
      { cmd: "เชิญ กองกลาง", desc: "ชวนแฟนใช้กระเป๋าร่วมกัน (ได้รหัส 6 หลัก)", need: "plus" },
      { cmd: "ร่วมกระเป๋า 123456", desc: "เข้ากระเป๋าร่วมด้วยรหัสที่ได้รับ", need: "free" },
    ],
  },
  {
    icon: "🎯",
    title: "งบและเป้าหมาย",
    subtitle: "คุมรายจ่ายและเก็บเงิน",
    items: [
      { cmd: "งบวัน 500", desc: "ตั้งงบรายวัน เกินแล้วบอทเตือนทันที", need: "plus" },
      { cmd: "งบวัน", desc: "ดูสถานะงบวันนี้ · ปิดด้วย งบวัน ปิด", need: "plus", send: "งบวัน" },
      { cmd: "เป้าหมาย", desc: "ดูกระปุกออมทั้งหมด", need: "plus", send: "เป้าหมาย" },
      { cmd: "เป้าหมาย ใหม่ เที่ยวญี่ปุ่น 30000", desc: "สร้างกระปุกใหม่", need: "plus" },
      { cmd: "ออม เที่ยวญี่ปุ่น 2000", desc: "หยอดเงิน · ถอนด้วย ถอน … 500", need: "plus" },
    ],
  },
  {
    icon: "🤝",
    title: "หนี้และบิล",
    subtitle: "ให้ยืม ยืม และเตือนวันจ่าย",
    items: [
      {
        cmd: "ให้ยืม สมชาย 500",
        desc: "จดเงินที่ให้ยืม · ยืม แม่ 2000 คืน 25/10",
        need: "ultimate",
      },
      { cmd: "สมชายคืน 200", desc: "จดเงินที่คืนมา · คืนแม่ 1000 เมื่อคืนเอง", need: "ultimate" },
      { cmd: "หนี้", desc: "ยอดค้างทั้งหมด", need: "ultimate", send: "หนี้" },
      { cmd: "บิล", desc: "บิลที่ต้องจ่ายและวันครบกำหนด", need: "ultimate", send: "บิล" },
      {
        cmd: "บิล ใหม่ ค่าไฟ 1250 ทุกวันที่ 15",
        desc: "ตั้งเตือนก่อนครบกำหนด · จ่ายแล้วพิมพ์ จ่ายบิล ค่าไฟ",
        need: "ultimate",
      },
    ],
  },
  {
    icon: "✏️",
    title: "แก้ไข ตังสะสม ชวนเพื่อน",
    subtitle: "คำสั่งอื่น ๆ ที่ใช้บ่อย",
    items: [
      { cmd: "ลบล่าสุด", desc: "ลบรายการล่าสุด", need: "free" },
      { cmd: "แก้ล่าสุด 45", desc: "เปลี่ยนจำนวนเงินรายการล่าสุด", need: "free" },
      { cmd: "ตังสะสม", desc: "ดูแต้มและจดต่อเนื่องกี่วัน", need: "free", send: "ตังสะสม" },
      { cmd: "รหัสชวน", desc: "รหัสชวนเพื่อน ได้โบนัสทั้งสองฝ่าย", need: "free", send: "รหัสชวน" },
      { cmd: "ใช้รหัส ABCD1234", desc: "ใส่รหัสของเพื่อน", need: "free" },
    ],
  },
];

const BADGE: Record<Exclude<Need, "free">, { label: string; bg: string; fg: string }> = {
  plus: { label: "Pro", bg: "#FEF3C7", fg: "#92400E" },
  ultimate: { label: "Ultimate", bg: "#EDE9FE", fg: "#5B21B6" },
};

const LOCKED_TEXT = "#94A3B8";

function row(item: HelpItem, plan: Plan) {
  const has = RANK[plan] >= NEED_RANK[item.need];
  const tappable = has && item.send !== undefined;
  const badge = item.need === "free" ? null : BADGE[item.need];
  const top = {
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
        // the tappable ones sit on the soft band and take the theme's accent colour
        color: !has ? LOCKED_TEXT : tappable ? COLOR.primary : "#14352E",
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
  };
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    margin: "sm",
    paddingAll: "8px",
    cornerRadius: "10px",
    ...(tappable ? { backgroundColor: COLOR.primarySoft } : {}),
    ...(tappable
      ? { action: { type: "message", label: item.cmd.slice(0, 20), text: item.send } }
      : {}),
    contents: [
      top,
      {
        type: "text",
        text: tappable ? `${item.desc} · แตะเพื่อดู` : item.desc,
        size: "xs",
        color: has ? COLOR.muted : LOCKED_TEXT,
        wrap: true,
      },
    ],
  };
}

function sectionBubble(section: HelpSection, plan: Plan) {
  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLOR.primarySoft,
      paddingAll: "14px",
      spacing: "xs",
      contents: [
        {
          type: "text",
          text: `${section.icon} ${section.title}`,
          weight: "bold",
          size: "md",
          color: "#0B5D4F",
          wrap: true,
        },
        { type: "text", text: section.subtitle, size: "xs", color: "#3F6B63", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      spacing: "none",
      contents: section.items.map((item) => row(item, plan)),
    },
  };
}

const SHORTCUTS: { label: string; path: string }[] = [
  { label: "📊 หน้าสรุป", path: "/summary" },
  { label: "🧾 หน้ารายการ", path: "/transactions" },
  { label: "🏷️ หมวดและงบ", path: "/budgets" },
  { label: "⚙️ ตั้งค่า", path: "/settings" },
  { label: "⭐ อัปเกรด", path: "/upgrade" },
];

function shortcutsBubble(appUrl: string | undefined) {
  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLOR.primarySoft,
      paddingAll: "14px",
      spacing: "xs",
      contents: [
        { type: "text", text: "🚀 ทางลัด", weight: "bold", size: "md", color: "#0B5D4F" },
        { type: "text", text: "เปิดหน้าต่าง ๆ ในแอป", size: "xs", color: "#3F6B63" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      spacing: "sm",
      contents: appUrl
        ? SHORTCUTS.map((s) => ({
            type: "button",
            style: "secondary",
            height: "sm",
            action: { type: "uri", label: s.label, uri: `${appUrl}${s.path}` },
          }))
        : [
            {
              type: "text",
              text: "เปิดจากเมนูด้านล่างของแชทได้เลย",
              size: "sm",
              color: COLOR.muted,
              wrap: true,
            },
          ],
    },
  };
}

/**
 * "ช่วยเหลือ": a swipeable card per kind of thing you can do. What the person's plan does not have is
 * shown dimmed with its plan badge (so they can see what an upgrade adds). Only read-only commands are
 * buttons; examples that record or delete are plain text.
 */
export function buildHelpCarousel(input: { plan: Plan; appUrl?: string }): LineMessage {
  return {
    type: "flex",
    altText: "วิธีใช้จดตังค์: จดรายการ สรุป กระเป๋า งบ หนี้ — ปัดดูได้เลย",
    contents: {
      type: "carousel",
      contents: [
        ...HELP_SECTIONS.map((s) => sectionBubble(s, input.plan)),
        shortcutsBubble(input.appUrl),
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
            action: { type: "message", label: "ดูวิธีใช้ทั้งหมด", text: "ช่วยเหลือ" },
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

/** How to use the group ledger (read by everyone in the group, so no buttons that send messages). */
export function buildGroupHelpCard(): LineMessage {
  const line = (cmd: string, desc: string) => ({
    type: "box",
    layout: "vertical",
    margin: "sm",
    spacing: "xs",
    contents: [
      { type: "text", text: cmd, size: "sm", weight: "bold", color: "#14352E", wrap: true },
      { type: "text", text: desc, size: "xs", color: COLOR.muted, wrap: true },
    ],
  });
  return {
    type: "flex",
    altText: "วิธีใช้สมุดกลุ่ม: จด ข้าวเที่ยง 350 · สรุป · ล่าสุด · ลบล่าสุด",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: COLOR.primarySoft,
        paddingAll: "16px",
        spacing: "xs",
        contents: [
          {
            type: "text",
            text: "👥 วิธีใช้สมุดกลุ่ม",
            weight: "bold",
            size: "md",
            color: "#0B5D4F",
          },
          {
            type: "text",
            text: "ช่วยกันจด ดูว่าใครจ่ายไปเท่าไร",
            size: "xs",
            color: "#3F6B63",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [
          line("จด ข้าวเที่ยง 350", "จดรายจ่าย ต้องขึ้นต้นด้วย “จด” (ข้อความคุยทั่วไปบอทไม่จด)"),
          line("จด กาแฟ 90, ขนม 40", "จดหลายรายการได้ (สูงสุด 5)"),
          line("สรุป · สรุปวันนี้", "ยอดรวมกลุ่มและใครจ่ายไปเท่าไร"),
          line("ล่าสุด", "5 รายการล่าสุดของกลุ่ม"),
          line("ลบล่าสุด", "ลบรายการล่าสุดของตัวเอง"),
          line("เริ่มทริป · สรุปทริป · จบทริป", "หารค่าใช้จ่ายทริป ดูว่าใครโอนคืนใคร"),
          line("ปิดสมุดกลุ่ม", "เฉพาะเจ้าของสมุด"),
          {
            type: "text",
            text: "บอทรู้ว่าใครจ่ายจากบัญชี LINE ของคนที่พิมพ์ (ต้องเพิ่มบอทเป็นเพื่อนไว้ก่อน)",
            size: "xxs",
            color: COLOR.muted,
            wrap: true,
            margin: "lg",
          },
        ],
      },
    },
  };
}
