import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
  ME_PLUS,
  SETTINGS,
} from "./helpers";

const COMMON = {
  "GET /api/settings": SETTINGS,
  "GET /api/recurring": { items: [], limit: 20 },
};

test.describe("settings page (360px)", () => {
  test("Free: shows the plan, quota and Plus locks instead of errors", async ({ page }) => {
    await mockApi(page, { ...COMMON, "GET /api/me": ME_FREE });
    await page.goto("/settings");

    await expect(page.getByText("สมชาย ทดสอบ")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "โควตาสลิปเดือนนี้" })).toBeVisible();
    await expect(page.getByText("12 / 30")).toBeVisible();
    await expect(page.getByText("สำหรับแผน Professional").first()).toBeVisible();
    await expect(page.getByRole("switch", { name: "เปิดเตือนจดประจำวัน" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "เพิ่ม" })).toBeDisabled();
    await expectNoHorizontalScroll(page);
  });

  test("Plus: reminder switch and recurring are usable", async ({ page }) => {
    await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_PLUS,
      "GET /api/memory": { items: [] },
    });
    await page.goto("/settings");

    await expect(page.getByRole("switch", { name: "เปิดเตือนจดประจำวัน" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "เพิ่ม" })).toBeEnabled();
  });

  test("referral code is shown and short codes cannot be submitted", async ({ page }) => {
    await mockApi(page, { ...COMMON, "GET /api/me": ME_FREE });
    await page.goto("/settings");

    await expect(page.getByLabel("รหัสชวนเพื่อนของคุณ")).toHaveText("ABCD1234");
    await page.getByLabel("รหัสของเพื่อน").fill("AB");
    await expect(page.getByRole("button", { name: "ใช้รหัส" })).toBeDisabled();
  });

  test("delete-all needs two steps and the exact phrase", async ({ page }) => {
    const { seen } = await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_FREE,
      "POST /api/account/delete": { ok: true },
    });
    await page.goto("/settings");

    await page.getByRole("button", { name: "ลบข้อมูลทั้งหมด" }).click(); // step 1: warning
    await expect(page.getByRole("dialog", { name: "ลบข้อมูลทั้งหมด?" })).toBeVisible();
    expect(seen.some((s) => s.startsWith("POST /api/account/delete"))).toBe(false);

    await page.getByRole("button", { name: "ดำเนินการต่อ" }).click(); // step 2: type phrase
    const confirm = page.getByRole("button", { name: "ลบข้อมูลทั้งหมดถาวร" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/พิมพ์/).fill("ลบข้อมูล");
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/พิมพ์/).fill("ลบข้อมูลทั้งหมด");
    await expect(confirm).toBeEnabled();

    await confirm.click();
    await expect(page.getByText("ลบข้อมูลทั้งหมดแล้ว")).toBeVisible();
  });

  test("links to the privacy policy and terms", async ({ page }) => {
    await mockApi(page, { ...COMMON, "GET /api/me": ME_FREE });
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "นโยบายความเป็นส่วนตัว" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(page.getByRole("link", { name: "ข้อกำหนดการใช้งาน" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await mockApi(page, { ...COMMON, "GET /api/me": ME_FREE });
    await page.goto("/settings");
    await expect(page.getByText("สมชาย ทดสอบ")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
