/**
 * Rich Menu artwork for JodTang: a painted picture (assets/richmenu-art.webp) cut and stretched to
 * LINE's 2500x1686 size. The tap areas are boxes laid over the tiles of the picture; they are
 * measured on the picture itself (ART_*) and carried over to the menu with the same crop and scale,
 * so changing the picture means changing the boxes below.
 *
 *   ┌────┬────┬─────────────────────────┐
 *   │สรุป│วิเคราะห์│   จดตังค์ (compose)        │
 *   ├────┼────┼────────────┬────────────┤
 *   │หมวด/งบ│รายการ│ ชวนเพื่อน   │ สแกนบิล    │
 *   ├────┼────┼────────────┴────────────┤
 *   │ตั้งค่า│วิธีใช้งาน│   อัปเกรด Pro · Elite     │
 *   └────┴────┴─────────────────────────┘
 */
export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 1686;

/** The picture, in its own pixels. */
export const ART_FILE = "assets/richmenu-art.jpg";
export const ART_WIDTH = 1264;
export const ART_HEIGHT = 848;
/** The picture is almost exactly the menu's proportions (1.49 against 1.48): nothing is cut. */
export const ART_CROP = { top: 0, height: ART_HEIGHT } as const;

/**
 * Optional toning of the painting (less colour, lighter, shadows lifted). The current picture is
 * already pastel, so this is neutral; the earlier picture used saturation 0.7, brightness 1.06,
 * contrast 0.86 and lift 26 (further than that washed out the labels).
 */
export const PASTEL = { saturation: 1, brightness: 1, contrast: 1, lift: 0 } as const;

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
  | "invite"
  | "scan";

export interface Tile {
  key: TileKey;
  label: string;
  bounds: Bounds;
}

/** A box measured on the picture, as left / top / right / bottom. */
type Box = readonly [left: number, top: number, right: number, bottom: number];

const SCALE_X = RICH_MENU_WIDTH / ART_WIDTH;
const SCALE_Y = RICH_MENU_HEIGHT / ART_CROP.height;

/** Carry a box from the picture over to the menu (crop, scale, round, keep inside the menu). */
export function toMenuBounds([left, top, right, bottom]: Box): Bounds {
  const x0 = Math.max(0, Math.round(left * SCALE_X));
  const y0 = Math.max(0, Math.round((top - ART_CROP.top) * SCALE_Y));
  const x1 = Math.min(RICH_MENU_WIDTH, Math.round(right * SCALE_X));
  const y1 = Math.min(RICH_MENU_HEIGHT, Math.round((bottom - ART_CROP.top) * SCALE_Y));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// ── the tiles of the picture ──
const BOXES: { key: TileKey; label: string; box: Box }[] = [
  { key: "summary", label: "สรุป", box: [30, 38, 262, 288] },
  { key: "analytics", label: "วิเคราะห์", box: [280, 38, 513, 288] },
  { key: "budgets", label: "หมวด/งบ", box: [30, 306, 262, 555] },
  { key: "transactions", label: "รายการ", box: [280, 306, 513, 555] },
  { key: "settings", label: "ตั้งค่า", box: [30, 573, 262, 815] },
  { key: "help", label: "วิธีใช้งาน", box: [280, 573, 513, 815] },
  { key: "compose", label: "จดตังค์", box: [525, 35, 1234, 378] },
  { key: "invite", label: "ชวนเพื่อน", box: [540, 396, 886, 610] },
  { key: "scan", label: "สแกนบิล", box: [902, 396, 1234, 610] },
  { key: "upgrade", label: "อัปเกรด", box: [540, 628, 1234, 812] },
];

export const TILES: Tile[] = BOXES.map(({ key, label, box }) => ({
  key,
  label,
  bounds: toMenuBounds(box),
}));
