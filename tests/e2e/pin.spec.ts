import { expect, test, type Route } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
  ME_PLUS,
  SETTINGS,
} from "./helpers";

const REQUIRED = {
  hasPin: true,
  required: true,
  unlocked: false,
  canSet: true,
  lockedUntil: null,
  triesLeft: 5,
  resetAt: null,
};

const COMMON = {
  "GET /api/settings": SETTINGS,
  "GET /api/recurring": { items: [], limit: 20 },
  "GET /api/memory": { items: [] },
  "GET /api/wallets": { items: [], totalSatang: 0, limit: 5, canAdd: true },
};

test.describe("PIN lock screen (360px)", () => {
  test("a PIN is asked for before anything else, and the right one opens the app", async ({
    page,
  }) => {
    const seen: (string | undefined)[] = [];
    let body: unknown = null;
    await mockApi(page, {
      ...COMMON,
      "GET /api/pin/status": REQUIRED,
      "POST /api/pin/unlock": async (route: Route) => {
        body = route.request().postDataJSON();
        return { token: "tok-1", expiresAt: "2099-01-01T00:00:00Z" };
      },
      "GET /api/me": async (route: Route) => {
        seen.push(route.request().headers()["x-unlock"]);
        return ME_PLUS;
      },
    });
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "ใส่ PIN เพื่อดูข้อมูล" })).toBeVisible();
    await expect(page.getByText("สมชาย ทดสอบ")).toHaveCount(0); // nothing of the app is shown
    expect(seen).toHaveLength(0); // and nothing was even asked for
    await expectNoHorizontalScroll(page);
    await expectNoSeriousA11yViolations(page);

    await expect(page.getByRole("button", { name: "ปลดล็อก" })).toBeDisabled();
    await page.getByLabel("PIN 4–6 หลัก").fill("4827");
    await page.getByRole("button", { name: "ปลดล็อก" }).click();

    await expect(page.getByText("สมชาย ทดสอบ")).toBeVisible();
    expect(body).toEqual({ pin: "4827" });
    expect(seen[0]).toBe("tok-1"); // the unlock token travels with every request after that
  });

  test("a wrong PIN says how many tries are left and clears the field", async ({ page }) => {
    await mockApi(page, {
      ...COMMON,
      "GET /api/pin/status": REQUIRED,
      "POST /api/pin/unlock": { status: 400, body: { error: "PIN ไม่ถูกต้อง", triesLeft: 3 } },
    });
    await page.goto("/settings");

    await page.getByLabel("PIN 4–6 หลัก").fill("1111");
    await page.getByRole("button", { name: "ปลดล็อก" }).click();
    await expect(page.getByText(/เหลืออีก 3 ครั้ง/)).toBeVisible();
    await expect(page.getByLabel("PIN 4–6 หลัก")).toHaveValue("");
  });

  test("locked out: a countdown, and the field and button are off", async ({ page }) => {
    const until = new Date(Date.now() + 10 * 60_000).toISOString();
    await mockApi(page, { ...COMMON, "GET /api/pin/status": { ...REQUIRED, lockedUntil: until } });
    await page.goto("/settings");

    await expect(page.getByText(/ลองใหม่ได้ใน/)).toBeVisible();
    await expect(page.getByLabel("PIN 4–6 หลัก")).toBeDisabled();
    await expect(page.getByRole("button", { name: "ปลดล็อก" })).toBeDisabled();
  });

  test("the server refusing with 423 puts the lock screen up, even when the status said unlocked", async ({
    page,
  }) => {
    await mockApi(page, {
      ...COMMON,
      "GET /api/pin/status": async () => ({ ...REQUIRED, unlocked: true }),
      "GET /api/me": { status: 423, body: { error: "ต้องใส่ PIN", locked: true } },
    });
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "ใส่ PIN เพื่อดูข้อมูล" })).toBeVisible();
  });

  test("forgot PIN: explains the 24 hours, sends the request, can cancel it", async ({ page }) => {
    const calls: string[] = [];
    await mockApi(page, {
      ...COMMON,
      "GET /api/pin/status": REQUIRED,
      "POST /api/pin/reset": () => {
        calls.push("ask");
        return { ok: true, resetAt: "2026-10-19T05:00:00Z" };
      },
      "DELETE /api/pin/reset": () => {
        calls.push("cancel");
        return { ok: true };
      },
    });
    await page.goto("/settings");

    await page.getByRole("button", { name: "ลืม PIN?" }).click();
    await expect(page.getByText("24 ชั่วโมง")).toBeVisible();
    await page.getByRole("button", { name: "ขอลบ PIN" }).click();
    await expect(page.getByText("รับคำขอลบ PIN แล้ว")).toBeVisible();
    await page.getByRole("button", { name: "ยกเลิกคำขอ" }).click();
    await expect(page.getByRole("button", { name: "ขอลบ PIN" })).toBeVisible();
    expect(calls).toEqual(["ask", "cancel"]);
  });

  test("a pending request is shown from the start", async ({ page }) => {
    await mockApi(page, {
      ...COMMON,
      "GET /api/pin/status": { ...REQUIRED, resetAt: "2026-10-19T05:00:00Z" },
    });
    await page.goto("/settings");
    await page.getByRole("button", { name: "ลืม PIN?" }).click();
    await expect(page.getByText("รับคำขอลบ PIN แล้ว")).toBeVisible();
  });

  test("no PIN set: the app opens straight away", async ({ page }) => {
    await mockApi(page, {
      ...COMMON,
      "GET /api/pin/status": { ...REQUIRED, hasPin: false, required: false, unlocked: true },
      "GET /api/me": ME_PLUS,
    });
    await page.goto("/settings");
    await expect(page.getByText("สมชาย ทดสอบ")).toBeVisible();
    await expect(page.getByRole("heading", { name: "ใส่ PIN เพื่อดูข้อมูล" })).toHaveCount(0);
  });
});

test.describe("PIN card in the settings (360px)", () => {
  const OFF = { hasPin: false, required: false, unlocked: true, canSet: true, resetAt: null };
  const ON = { hasPin: true, required: true, unlocked: true, canSet: true, resetAt: null };

  test("Free: told it needs Professional, no set button", async ({ page }) => {
    await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_FREE,
      "GET /api/pin/status": { ...OFF, canSet: false },
    });
    await page.goto("/settings");
    const card = page.getByRole("region", { name: "ล็อกด้วย PIN" });
    await expect(card.getByText("สำหรับแผน Professional")).toBeVisible();
    await expect(card.getByRole("button", { name: "ตั้ง PIN" })).toBeDisabled();
  });

  test("setting a PIN sends it twice and the card then shows it is on", async ({ page }) => {
    let body: unknown = null;
    let on = false;
    await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_PLUS,
      "GET /api/pin/status": () => (on ? ON : OFF),
      "POST /api/pin/set": async (route: Route) => {
        body = route.request().postDataJSON();
        on = true;
        return { ok: true, token: "tok-set", expiresAt: "2099-01-01T00:00:00Z" };
      },
    });
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "ล็อกด้วย PIN" });
    await card.getByRole("button", { name: "ตั้ง PIN" }).click();
    const save = page.getByRole("button", { name: "บันทึก" });
    await expect(save).toBeDisabled();
    await page.getByLabel("PIN ใหม่", { exact: true }).fill("4827");
    await page.getByLabel("ยืนยัน PIN ใหม่").fill("4827");
    await save.click();

    await expect(card.getByText("ตั้ง PIN แล้ว")).toBeVisible();
    await expect(card.getByText("เปิดอยู่")).toBeVisible();
    expect(body).toEqual({ pin: "4827", confirmPin: "4827" });
  });

  test("the server's complaint (an easy PIN) is shown", async ({ page }) => {
    await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_PLUS,
      "GET /api/pin/status": OFF,
      "POST /api/pin/set": { status: 400, body: { error: "PIN นี้เดาง่ายเกินไป" } },
    });
    await page.goto("/settings");
    await page
      .getByRole("region", { name: "ล็อกด้วย PIN" })
      .getByRole("button", { name: "ตั้ง PIN" })
      .click();
    await page.getByLabel("PIN ใหม่", { exact: true }).fill("1234");
    await page.getByLabel("ยืนยัน PIN ใหม่").fill("1234");
    await page.getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByText("PIN นี้เดาง่ายเกินไป")).toBeVisible();
  });

  test("changing needs the current PIN; turning off asks for it too", async ({ page }) => {
    const bodies: Record<string, unknown> = {};
    await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_PLUS,
      "GET /api/pin/status": ON,
      "POST /api/pin/set": async (route: Route) => {
        bodies.set = route.request().postDataJSON();
        return { ok: true, token: "t", expiresAt: "2099-01-01T00:00:00Z" };
      },
      "POST /api/pin/disable": async (route: Route) => {
        bodies.disable = route.request().postDataJSON();
        return { ok: true };
      },
    });
    await page.goto("/settings");
    const card = page.getByRole("region", { name: "ล็อกด้วย PIN" });

    await card.getByRole("button", { name: "เปลี่ยน PIN" }).click();
    await page.getByLabel("PIN ปัจจุบัน").fill("4827");
    await page.getByLabel("PIN ใหม่", { exact: true }).fill("9051");
    await page.getByLabel("ยืนยัน PIN ใหม่").fill("9051");
    await page.getByRole("button", { name: "บันทึก" }).click();
    await expect(card.getByText("เปลี่ยน PIN แล้ว")).toBeVisible();
    expect(bodies.set).toEqual({ pin: "9051", confirmPin: "9051", current: "4827" });

    await card.getByRole("button", { name: "ปิดการล็อก" }).click();
    const save = page.getByRole("button", { name: "บันทึก" });
    await expect(save).toBeDisabled();
    await page.getByLabel("PIN ปัจจุบัน").fill("9051");
    await save.click();
    await expect(card.getByText("ปิดการล็อกด้วย PIN แล้ว")).toBeVisible();
    expect(bodies.disable).toEqual({ pin: "9051" });
  });

  test("a lapsed plan: the PIN is kept but not asked for, and says so", async ({ page }) => {
    await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_FREE,
      "GET /api/pin/status": {
        hasPin: true,
        required: false,
        unlocked: true,
        canSet: false,
        resetAt: null,
      },
    });
    await page.goto("/settings");
    const card = page.getByRole("region", { name: "ล็อกด้วย PIN" });
    await expect(card.getByText("พักไว้")).toBeVisible();
    await expect(card.getByText("แผนของคุณหมดอายุ")).toBeVisible();
  });
});
