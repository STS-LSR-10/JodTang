/**
 * Rich Menu artwork for JodTang: a painted picture (assets/richmenu-art.webp) cut and stretched to
 * LINE's 2500x1686 size. The tap areas are boxes laid over the tiles of the picture; they are
 * measured on the picture itself (ART_*) and carried over to the menu with the same crop and scale,
 * so changing the picture means changing the boxes below.
 *
 *   ┌──────────────────────────────────────┐
 *   │ logo · "จดบันทึก" panel with the piggy bank │  compose
 *   ├────┬────┬────┬────┬──────────────────────┤
 *   │สรุป│วิเคราะห์│หมวด/งบ│รายการ│   (decoration)         │
 *   ├────┼────┼────┼────┴────────────┬─────────┤
 *   │ชวนเพื่อน│วิธีใช้งาน│ตั้งค่า│ อัปเกรด Pro · Elite │ (deco)  │
 *   └────┴────┴────┴─────────────────┴─────────┘
 */
export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 1686;

/** The picture, in its own pixels. */
export const ART_FILE = "assets/richmenu-art.webp";
export const ART_WIDTH = 1452;
export const ART_HEIGHT = 1083;
/**
 * The menu is wider than the picture (1.48 against 1.34), so a strip of garden at the top and
 * bottom is cut (all the tiles stay), and the rest is stretched about 5% sideways.
 */
export const ART_CROP = { top: 20, height: 1031 } as const;

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
  | "invite";

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
  { key: "compose", label: "จดบันทึก", box: [60, 155, 1390, 545] },
  { key: "summary", label: "สรุป", box: [65, 582, 268, 795] },
  { key: "analytics", label: "วิเคราะห์", box: [290, 582, 492, 795] },
  { key: "budgets", label: "หมวด/งบ", box: [515, 582, 716, 795] },
  { key: "transactions", label: "รายการ", box: [738, 582, 940, 795] },
  { key: "invite", label: "ชวนเพื่อน", box: [65, 818, 268, 1027] },
  { key: "help", label: "วิธีใช้งาน", box: [290, 818, 492, 1027] },
  { key: "settings", label: "ตั้งค่า", box: [515, 818, 716, 1027] },
  { key: "upgrade", label: "อัปเกรด", box: [735, 818, 1158, 1027] },
];

export const TILES: Tile[] = BOXES.map(({ key, label, box }) => ({
  key,
  label,
  bounds: toMenuBounds(box),
}));
