/**
 * Rich Menu artwork for JodTang: 2500x1686, pastel mint background with rounded tiles.
 * Original hand-built SVG (icons are simple shapes). Tile bounds double as the tap areas.
 *
 *   ┌────┬────┬──────────────────────┐
 *   │สรุป│วิเคราะห์│  จดตังค์            │  big tile: compose
 *   ├────┼────┤  รายรับ / รายจ่าย    │
 *   │หมวด│รายการ│                      │
 *   ├────┼────┼───────────┬──────────┤
 *   │ตั้งค่า│วิธีใช้│ อัปเกรด  │ ชวนเพื่อน │
 *   └────┴────┴───────────┴──────────┘
 */
export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 1686;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TileKey =
  | "summary"
  | "analytics"
  | "budgets"
  | "transactions"
  | "settings"
  | "help"
  | "compose"
  | "upgrade"
  | "invite";

export interface Tile {
  key: TileKey;
  label: string;
  bounds: Bounds;
}

// ── geometry ──
const M = 64; // outer margin
const G = 36; // gutter
const SMALL_W = 430;
const ROW_H = [500, 500, 370] as const;

const COL_A = M;
const COL_B = COL_A + SMALL_W + G;
const COL_BIG = COL_B + SMALL_W + G;
const BIG_W = RICH_MENU_WIDTH - M - COL_BIG;
const HALF_W = (BIG_W - G) / 2;
const ROW_Y = [M, M + ROW_H[0] + G, M + ROW_H[0] + G + ROW_H[1] + G] as const;

const rect = (x: number, y: number, width: number, height: number): Bounds => ({
  x,
  y,
  width,
  height,
});

export const TILES: Tile[] = [
  { key: "summary", label: "สรุป", bounds: rect(COL_A, ROW_Y[0], SMALL_W, ROW_H[0]) },
  { key: "analytics", label: "วิเคราะห์", bounds: rect(COL_B, ROW_Y[0], SMALL_W, ROW_H[0]) },
  { key: "budgets", label: "หมวด/งบ", bounds: rect(COL_A, ROW_Y[1], SMALL_W, ROW_H[1]) },
  { key: "transactions", label: "รายการ", bounds: rect(COL_B, ROW_Y[1], SMALL_W, ROW_H[1]) },
  { key: "settings", label: "ตั้งค่า", bounds: rect(COL_A, ROW_Y[2], SMALL_W, ROW_H[2]) },
  { key: "help", label: "วิธีใช้งาน", bounds: rect(COL_B, ROW_Y[2], SMALL_W, ROW_H[2]) },
  {
    key: "compose",
    label: "จดรายการ",
    bounds: rect(COL_BIG, ROW_Y[0], BIG_W, ROW_H[0] + G + ROW_H[1]),
  },
  { key: "upgrade", label: "อัปเกรด", bounds: rect(COL_BIG, ROW_Y[2], HALF_W, ROW_H[2]) },
  {
    key: "invite",
    label: "ชวนเพื่อน",
    bounds: rect(COL_BIG + HALF_W + G, ROW_Y[2], HALF_W, ROW_H[2]),
  },
];

// ── palette (pastel mint / sky / butter) ──
const C = {
  bgFrom: "#BDEBD8",
  bgTo: "#7ED3BE",
  white: "#FFFFFF",
  mintTile: "#D7F0E4",
  skyTile: "#D9E9F8",
  ink: "#0F5D4B",
  teal: "#12775F",
  mint: "#43B89D",
  green: "#2ECB7A",
  forest: "#14573F",
  navy: "#1D4E7A",
  gold: "#F7D04A",
  goldEdge: "#F2A81F",
  butterFrom: "#FBE7A1",
  butterTo: "#F5B84B",
} as const;

const FONT = "'Noto Sans Thai','Leelawadee UI','Tahoma','Sarabun',sans-serif";

// ── icons: drawn in a 200x200 box centred on (0,0) ──
const ICONS: Record<string, string> = {
  home: `<path d="M0 -84 L90 -4 L68 -4 V80 H20 V22 H-20 V80 H-68 V-4 H-90 Z" fill="${C.green}" stroke="${C.green}" stroke-width="14" stroke-linejoin="round"/>`,
  analytics: `<circle cx="-14" cy="-14" r="68" fill="${C.green}"/>
    <rect x="-48" y="-2" width="16" height="38" rx="6" fill="${C.white}"/>
    <rect x="-22" y="-36" width="16" height="72" rx="6" fill="${C.white}"/>
    <rect x="4" y="-18" width="16" height="54" rx="6" fill="${C.white}"/>
    <path d="M38 38 L84 84" stroke="${C.green}" stroke-width="30" stroke-linecap="round"/>`,
  budgets: `<path d="M-6 6 L-6 -70 A76 76 0 1 0 70 6 Z" fill="${C.forest}" stroke="${C.forest}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M8 -8 L8 -84 A76 76 0 0 1 84 -8 Z" fill="${C.forest}" stroke="${C.forest}" stroke-width="8" stroke-linejoin="round"/>`,
  transactions: `<g fill="none" stroke="${C.forest}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
      <path d="M-88 -50 L-72 -34 L-44 -66"/>
      <path d="M-88 8 L-72 24 L-44 -8"/>
      <path d="M-22 -48 H88"/>
      <path d="M-22 4 H88"/>
      <path d="M-22 58 H88"/>
    </g>
    <circle cx="-66" cy="58" r="10" fill="${C.forest}"/>`,
  settings: `<g fill="${C.forest}">
      ${Array.from({ length: 8 }, (_, i) => `<rect x="-15" y="-94" width="30" height="40" rx="9" transform="rotate(${i * 45})"/>`).join("")}
    </g>
    <circle r="54" fill="none" stroke="${C.forest}" stroke-width="32"/>`,
  help: `<circle r="88" fill="${C.navy}"/>
    <text y="42" text-anchor="middle" font-family="${FONT}" font-size="124" font-weight="800" fill="${C.white}">?</text>`,
  qr: `<g fill="none" stroke="${C.teal}" stroke-width="18" stroke-linejoin="round">
      <rect x="-88" y="-88" width="72" height="72" rx="14"/>
      <rect x="16" y="-88" width="72" height="72" rx="14"/>
      <rect x="-88" y="16" width="72" height="72" rx="14"/>
    </g>
    <g fill="${C.teal}">
      <rect x="-66" y="-66" width="28" height="28" rx="6"/>
      <rect x="38" y="-66" width="28" height="28" rx="6"/>
      <rect x="-66" y="38" width="28" height="28" rx="6"/>
      <rect x="22" y="22" width="26" height="26" rx="6"/>
      <rect x="62" y="22" width="26" height="26" rx="6"/>
      <rect x="22" y="62" width="26" height="26" rx="6"/>
      <rect x="62" y="62" width="26" height="26" rx="6"/>
    </g>`,
  invite: `<circle cx="-18" cy="-40" r="42" fill="${C.navy}"/>
    <path d="M-88 78 C-88 24 -52 6 -18 6 C16 6 52 24 52 78 Z" fill="${C.navy}"/>
    <path d="M70 -62 V-6 M42 -34 H98" stroke="${C.navy}" stroke-width="20" stroke-linecap="round"/>`,
  coin: `<circle r="104" fill="${C.gold}" stroke="${C.goldEdge}" stroke-width="10"/>
    <circle r="78" fill="none" stroke="${C.goldEdge}" stroke-opacity="0.35" stroke-width="8"/>
    <text y="46" text-anchor="middle" font-family="${FONT}" font-size="132" font-weight="800" fill="${C.white}">฿</text>`,
  crown: `<path d="M-88 50 L-100 -50 L-44 0 L0 -70 L44 0 L100 -50 L88 50 Z" fill="${C.teal}" stroke="${C.teal}" stroke-width="16" stroke-linejoin="round"/>
    <rect x="-88" y="68" width="176" height="26" rx="13" fill="${C.teal}"/>`,
  edit: `<path d="M64 -18 V68 A32 32 0 0 1 32 100 H-68 A32 32 0 0 1 -100 68 V-32 A32 32 0 0 1 -68 -64 H18" fill="none" stroke="${C.teal}" stroke-width="24" stroke-linecap="round"/>
    <path d="M-18 30 L72 -60" stroke="${C.teal}" stroke-width="44" stroke-linecap="round"/>
    <path d="M52 -80 L92 -40" stroke="${C.white}" stroke-width="10" stroke-linecap="round"/>`,
};

function icon(name: keyof typeof ICONS, cx: number, cy: number, scale = 1): string {
  return `<g transform="translate(${cx} ${cy}) scale(${scale})">${ICONS[name]}</g>`;
}

function tileBox(b: Bounds, fill: string): string {
  return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="92" fill="${fill}" filter="url(#soft)"/>`;
}

function label(text: string, cx: number, y: number, size = 92, fill: string = C.ink): string {
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="800" fill="${fill}">${text}</text>`;
}

const spark = (cx: number, cy: number, r: number, opacity = 0.7) =>
  `<path d="M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z" fill="${C.white}" fill-opacity="${opacity}"/>`;

/** Small logo mark (same artwork as public/logo.svg) scaled into a ~110px box. */
function logoMark(x: number, y: number, size: number): string {
  const s = size / 1170;
  return `<g transform="translate(${x} ${y}) scale(${s}) translate(-375 -185)">
    <path fill="#25305F" d="M965 315C650 315 440 530 440 770C440 930 500 1040 575 1085C570 1140 550 1180 530 1205C520 1222 535 1225 555 1225C620 1225 680 1205 705 1175C780 1210 870 1225 965 1225Z"/>
    <path fill="#7ADBA9" d="M965 315H1400A90 90 0 0 1 1490 405V1135A90 90 0 0 1 1400 1225H965Z"/>
    <circle cx="965" cy="770" r="258" fill="#25305F"/>
    <circle cx="965" cy="770" r="246" fill="#FBD34F"/>
    <path fill="#EFB02A" d="M1139 596A246 246 0 0 1 791 944Z"/>
  </g>`;
}

export function buildRichMenuSvg(): string {
  const t = (key: TileKey) => {
    const tile = TILES.find((x) => x.key === key);
    if (!tile) throw new Error(`unknown tile ${key}`);
    return tile.bounds;
  };
  const cx = (b: Bounds) => b.x + b.width / 2;

  const small = (
    key: TileKey,
    fill: string,
    ico: keyof typeof ICONS,
    text: string,
    compact = false,
  ) => {
    const b = t(key);
    const iconY = b.y + (compact ? 135 : 190);
    const textY = b.y + (compact ? 300 : 405);
    return [
      tileBox(b, fill),
      icon(ico, cx(b), iconY, compact ? 0.86 : 1),
      label(text, cx(b), textY, compact ? 84 : 92),
    ].join("");
  };

  const big = t("compose");
  const up = t("upgrade");

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RICH_MENU_WIDTH}" height="${RICH_MENU_HEIGHT}" viewBox="0 0 ${RICH_MENU_WIDTH} ${RICH_MENU_HEIGHT}">`,
    `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${C.bgFrom}"/><stop offset="1" stop-color="${C.bgTo}"/>
      </linearGradient>
      <linearGradient id="butter" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${C.butterFrom}"/><stop offset="1" stop-color="${C.butterTo}"/>
      </linearGradient>
      <filter id="soft" x="-10%" y="-10%" width="120%" height="125%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="12"/>
        <feOffset dy="10" result="o"/>
        <feComponentTransfer in="o" result="s"><feFuncA type="linear" slope="0.14"/></feComponentTransfer>
        <feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>`,
    `<rect width="100%" height="100%" fill="url(#bg)"/>`,
    // soft bubbles for a playful pastel feel
    `<circle cx="2330" cy="1540" r="260" fill="${C.white}" fill-opacity="0.10"/>`,
    `<circle cx="150" cy="1560" r="190" fill="${C.white}" fill-opacity="0.10"/>`,
    `<circle cx="1320" cy="40" r="150" fill="${C.white}" fill-opacity="0.08"/>`,

    // small tiles
    small("summary", C.white, "home", "สรุป"),
    small("analytics", C.white, "analytics", "วิเคราะห์"),
    small("budgets", C.mintTile, "budgets", "หมวด/งบ"),
    small("transactions", C.mintTile, "transactions", "รายการ"),
    small("settings", C.mintTile, "settings", "ตั้งค่า", true),
    small("help", C.skyTile, "help", "วิธีใช้งาน", true),

    // big compose tile
    tileBox(big, C.white),
    `<text x="${big.x + 120}" y="${big.y + 400}" font-family="${FONT}" font-size="270" font-weight="900" fill="${C.teal}">จดตังค์</text>`,
    `<text x="${big.x + 124}" y="${big.y + 590}" font-family="${FONT}" font-size="128" font-weight="800" fill="${C.mint}">รายรับ / รายจ่าย</text>`,
    icon("coin", big.x + big.width - 560, big.y + big.height - 175, 1.15),
    icon("edit", big.x + big.width - 215, big.y + big.height - 180, 1.3),
    spark(big.x + big.width - 150, big.y + 130, 46, 0.9),
    spark(big.x + big.width - 280, big.y + 210, 26, 0.7),

    // upgrade tile (butter yellow)
    tileBox(up, "url(#butter)"),
    `<rect x="${up.x + 56}" y="${up.y + 52}" width="236" height="68" rx="34" fill="${C.white}" fill-opacity="0.75"/>`,
    `<text x="${up.x + 174}" y="${up.y + 99}" text-anchor="middle" font-family="${FONT}" font-size="42" font-weight="800" fill="#9A6A08">สุดคุ้ม</text>`,
    `<text x="${up.x + 56}" y="${up.y + 222}" font-family="${FONT}" font-size="104" font-weight="900" fill="${C.teal}">อัปเกรด</text>`,
    `<text x="${up.x + 56}" y="${up.y + 320}" font-family="${FONT}" font-size="64" font-weight="800" fill="#9A6A08">Pro · Elite</text>`,
    icon("crown", up.x + up.width - 150, up.y + 140, 0.95),
    // invite tile
    small("invite", C.skyTile, "invite", "ชวนเพื่อน", true),
  ];
  parts.push(
    // footer: logo + name, centred as one group
    logoMark(855, 1544, 112),
    `<text x="997" y="1620" font-family="${FONT}" font-size="76" font-weight="800" fill="${C.ink}">JodTang (จดตังค์)</text>`,
    spark(2380, 1620, 24, 0.6),
    spark(120, 1630, 18, 0.6),
    "</svg>",
  );
  return parts.join("");
}
