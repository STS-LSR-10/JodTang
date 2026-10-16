/**
 * Create and publish the JodTang Rich Menu.
 *
 *   pnpm richmenu --dry-run     render assets/richmenu.png only (no network)
 *   pnpm richmenu               create the menu, upload the image, set it as default
 *   pnpm richmenu --replace     same, but first delete earlier "meetang-main" menus
 *
 * Reads LINE_CHANNEL_ACCESS_TOKEN and NEXT_PUBLIC_LIFF_ID from .env.local (or the environment).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { buildRichMenuSvg, cellBounds, RICH_MENU_HEIGHT, RICH_MENU_WIDTH } from "./richmenu-design";

// Kept as "meetang-main" on purpose: --replace finds and deletes earlier menus by this name.
const MENU_NAME = "meetang-main";
const API = "https://api.line.me/v2/bot";
const API_DATA = "https://api-data.line.me/v2/bot";
const IMAGE_PATH = resolve("assets/richmenu.png");

// Cell order matches CELLS in richmenu-design.ts
const LIFF_PAGES = ["summary", "analytics", "transactions", "budgets", "settings"] as const;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function renderImage(): Promise<Buffer> {
  const png = await sharp(Buffer.from(buildRichMenuSvg()))
    .resize(RICH_MENU_WIDTH, RICH_MENU_HEIGHT)
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  if (png.length > 1_000_000) fail(`image is ${png.length} bytes; LINE's limit is 1 MB`);
  await mkdir(dirname(IMAGE_PATH), { recursive: true });
  await writeFile(IMAGE_PATH, png);
  console.log(`✓ rendered ${IMAGE_PATH} (${Math.round(png.length / 1024)} KB)`);
  return png;
}

async function line(
  token: string,
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, { ...init, headers, body });
  if (!res.ok) {
    // LINE error bodies describe the request, not secrets
    fail(`${init.method ?? "GET"} ${new URL(url).pathname} → ${res.status} ${await res.text()}`);
  }
  return res;
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // no .env.local: rely on variables already in the environment
  }
  const args = new Set(process.argv.slice(2));
  const png = await renderImage();
  if (args.has("--dry-run")) return;

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!token) fail("LINE_CHANNEL_ACCESS_TOKEN is not set (.env.local)");
  if (!liffId) fail("NEXT_PUBLIC_LIFF_ID is not set (.env.local)");
  // A real token is plain ASCII with no spaces; anything else is usually a leftover placeholder.
  if (!/^[\x21-\x7E]+$/.test(token)) {
    fail(
      "LINE_CHANNEL_ACCESS_TOKEN has spaces or non-ASCII characters — is it still a placeholder?",
    );
  }
  if (!/^[\x21-\x7E]+$/.test(liffId)) {
    fail("NEXT_PUBLIC_LIFF_ID has spaces or non-ASCII characters — is it still a placeholder?");
  }

  if (args.has("--replace")) {
    const list = (await (await line(token, `${API}/richmenu/list`)).json()) as {
      richmenus: { richMenuId: string; name: string }[];
    };
    for (const m of list.richmenus.filter((r) => r.name === MENU_NAME)) {
      await line(token, `${API}/richmenu/${m.richMenuId}`, { method: "DELETE" });
      console.log(`✓ deleted old menu ${m.richMenuId}`);
    }
  }

  const compose = {
    type: "postback",
    label: "จดรายการ",
    data: "a=compose",
    inputOption: "openKeyboard",
    // LINE requires non-empty text. It has no digits, so sending it as-is is never recorded.
    fillInText: "ชื่อรายการ จำนวนเงิน",
  };
  const liff = (page: string, label: string) => ({
    type: "uri",
    label,
    uri: `https://liff.line.me/${liffId}/${page}`,
  });
  const labels = ["สรุป", "วิเคราะห์", "รายการ", "หมวด/งบ", "ตั้งค่า"];

  const areas = [
    { bounds: cellBounds(0), action: compose },
    ...LIFF_PAGES.map((page, i) => ({
      bounds: cellBounds(i + 1),
      action: liff(page, labels[i] ?? page),
    })),
  ];

  const created = (await (
    await line(token, `${API}/richmenu`, {
      method: "POST",
      json: {
        size: { width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT },
        selected: true,
        name: MENU_NAME,
        chatBarText: "เมนู",
        areas,
      },
    })
  ).json()) as { richMenuId: string };
  console.log(`✓ created ${created.richMenuId}`);

  await line(token, `${API_DATA}/richmenu/${created.richMenuId}/content`, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(png),
  });
  console.log("✓ uploaded image");

  await line(token, `${API}/user/all/richmenu/${created.richMenuId}`, { method: "POST" });
  console.log("✓ set as default Rich Menu for all users");
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : "unknown error"));
