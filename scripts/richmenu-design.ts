/**
 * Rich Menu artwork: 2500x1686, 3x2 grid, flat green/white. Original design (no third-party
 * assets). Icons are simple hand-built SVG shapes.
 */
export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 1686;

const COLS = 3;
const ROWS = 2;
const CELL_W = [833, 834, 833] as const;
const CELL_H = RICH_MENU_HEIGHT / ROWS; // 843

const PRIMARY = "#0F766E";
const PRIMARY_DEEP = "#115E59";
const WHITE = "#FFFFFF";

export interface MenuCell {
  label: string;
  /** SVG for a 200x200 icon box drawn in white. */
  icon: string;
}

const stroke = `fill="none" stroke="${WHITE}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"`;

export const CELLS: MenuCell[] = [
  {
    label: "จดรายการ",
    icon: `<path d="M40 160 L52 112 L136 28 a20 20 0 0 1 28 28 L80 140 Z" ${stroke}/><path d="M120 44 L148 72" ${stroke}/>`,
  },
  {
    label: "สรุป",
    icon: `<path d="M24 100 L100 36 L176 100" ${stroke}/><path d="M48 90 V168 H152 V90" ${stroke}/><path d="M84 168 V120 H116 V168" ${stroke}/>`,
  },
  {
    label: "วิเคราะห์",
    icon: `<path d="M36 164 V92" ${stroke}/><path d="M100 164 V40" ${stroke}/><path d="M164 164 V120" ${stroke}/><path d="M20 172 H180" ${stroke}/>`,
  },
  {
    label: "รายการ",
    icon: `<path d="M70 52 H176" ${stroke}/><path d="M70 100 H176" ${stroke}/><path d="M70 148 H176" ${stroke}/><circle cx="34" cy="52" r="4" ${stroke}/><circle cx="34" cy="100" r="4" ${stroke}/><circle cx="34" cy="148" r="4" ${stroke}/>`,
  },
  {
    label: "หมวด/งบ",
    icon: `<path d="M24 100 V36 a12 12 0 0 1 12 -12 H100 L176 100 a14 14 0 0 1 0 20 L120 176 a14 14 0 0 1 -20 0 Z" ${stroke}/><circle cx="64" cy="64" r="8" ${stroke}/>`,
  },
  {
    label: "ตั้งค่า",
    icon: `<circle cx="100" cy="100" r="30" ${stroke}/><path d="M100 18 V44 M100 156 V182 M18 100 H44 M156 100 H182 M42 42 L60 60 M140 140 L158 158 M158 42 L140 60 M60 140 L42 158" ${stroke}/>`,
  },
];

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pixel bounds of cell `index` (row-major). Also used for the tap areas. */
export function cellBounds(index: number): Bounds {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = CELL_W.slice(0, col).reduce((a, b) => a + b, 0);
  return { x, y: row * CELL_H, width: CELL_W[col] ?? 833, height: CELL_H };
}

export function buildRichMenuSvg(): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RICH_MENU_WIDTH}" height="${RICH_MENU_HEIGHT}" viewBox="0 0 ${RICH_MENU_WIDTH} ${RICH_MENU_HEIGHT}">`,
    `<rect width="100%" height="100%" fill="${PRIMARY}"/>`,
  ];

  CELLS.forEach((cell, i) => {
    const b = cellBounds(i);
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    // checkerboard of two greens keeps cells distinct without outlines
    const fill = (col + row) % 2 === 0 ? PRIMARY : PRIMARY_DEEP;
    const cx = b.x + b.width / 2;
    const iconScale = 1.9;
    const iconX = cx - (200 * iconScale) / 2;
    const iconY = b.y + 150;
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${fill}"/>`,
      `<g transform="translate(${iconX} ${iconY}) scale(${iconScale})">${cell.icon}</g>`,
      `<text x="${cx}" y="${b.y + b.height - 130}" text-anchor="middle" font-size="96" font-weight="700" fill="${WHITE}" font-family="'Noto Sans Thai','Leelawadee UI','Tahoma','Sarabun',sans-serif">${cell.label}</text>`,
    );
  });

  parts.push("</svg>");
  return parts.join("");
}
