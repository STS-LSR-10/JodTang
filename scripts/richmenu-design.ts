/**
 * Rich Menu artwork for JodTang: a painted picture (assets/richmenu-art.webp) cut and stretched to
 * LINE's 2500x1686 size. The tap areas are boxes laid over the tiles of the picture; they are
 * measured on the picture itself (ART_*) and carried over to the menu with the same crop and scale,
 * so changing the picture means changing the boxes below.
 *
 *   ┌───────────────────────────────────────┐
 *   │   logo · "จดบันทึก" panel with mascot   │  compose
 *   ├────┬────┬────┬────┬───────────────────┤
 *   │สรุป│วิเคราะห์│หมวด/งบ│รายการ│  (mascot)       │
 *   ├────┼────┼────┼────┴───────────┬──────┤
 *   │ชวนเพื่อน│วิธีใช้งาน│ตั้งค่า│  อัปเกรด Pro · Elite │ mascot │
 *   └────┴────┴────┴────────────────┴──────┘
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
 * The painting is toned down to pastel: less colour, a little lighter, shadows lifted. Still dark
 * enough for the labels to read (the next step, "soft", started to wash out the "Elite!" text).
 */
export const PASTEL = { saturation: 0.7, brightness: 1.06, contrast: 0.86, lift: 26 } as const;

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
  { key: "compose", label: "จดบันทึก", box: [50, 150, 1380, 560] },
  { key: "summary", label: "สรุป", box: [57, 578, 270, 790] },
  { key: "analytics", label: "วิเคราะห์", box: [285, 578, 495, 790] },
  { key: "budgets", label: "หมวด/งบ", box: [508, 578, 718, 790] },
  { key: "transactions", label: "รายการ", box: [732, 578, 945, 790] },
  { key: "invite", label: "ชวนเพื่อน", box: [57, 800, 270, 1008] },
  { key: "help", label: "วิธีใช้งาน", box: [285, 800, 495, 1008] },
  { key: "settings", label: "ตั้งค่า", box: [508, 800, 718, 1008] },
  // the upgrade banner, and the mascot that stands beside it (a tap on him is a tap on the banner)
  { key: "upgrade", label: "อัปเกรด", box: [730, 797, 1452, 1083] },
  { key: "upgrade", label: "อัปเกรด", box: [950, 562, 1452, 797] },
];

export const TILES: Tile[] = BOXES.map(({ key, label, box }) => ({
  key,
  label,
  bounds: toMenuBounds(box),
}));
