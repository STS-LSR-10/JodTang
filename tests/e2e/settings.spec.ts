import { expect, test, type Route } from "@playwright/test";
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
    await expect(page.getByText("การอ่านสลิปใช้ได้ตั้งแต่แผน Professional")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "โควตาสลิปเดือนนี้" })).toHaveCount(0);
    await expect(page.getByText("สำหรับแผน Professional").first()).toBeVisible();
    await expect(page.getByRole("switch", { name: "เปิดเตือนจดประจำวัน" })).toBeDisabled();
    await expect(page.getByRole("switch", { name: "เปิดสรุปรายสัปดาห์" })).toBeDisabled();
    await expect(page.getByRole("switch", { name: "เปิดสรุปรายเดือน" })).toBeDisabled();
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
    await expect(page.getByRole("progressbar", { name: "โควตาสลิปเดือนนี้" })).toBeVisible();
    await expect(page.getByText("3 / 5")).toBeVisible();
  });

  test("Professional: automatic summaries are off by default and saved when switched on", async ({
    page,
  }) => {
    const bodies: unknown[] = [];
    await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_PLUS,
      "GET /api/memory": { items: [] },
      "PATCH /api/settings": (route: Route) => {
        const body = route.request().postDataJSON();
        bodies.push(body);
        return { ...SETTINGS, ...body };
      },
    });
    await page.goto("/settings");

    const weekly = page.getByRole("switch", { name: "เปิดสรุปรายสัปดาห์" });
    const monthly = page.getByRole("switch", { name: "เปิดสรุปรายเดือน" });
    await expect(weekly).toHaveAttribute("aria-checked", "false");
    await expect(monthly).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(/ทุกวันจันทร์ 09:00/)).toBeVisible();
    await expect(page.getByText(/วันที่ 1 ของเดือน 09:00/)).toBeVisible();

    await weekly.click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({ weekly_summary_enabled: true });
    await expect(weekly).toHaveAttribute("aria-checked", "true");
    await expectNoHorizontalScroll(page);
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

  test("reset-all shows what will go, asks for the phrase and sends the keep-balance choice", async ({
    page,
  }) => {
    let body: unknown = null;
    await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_FREE,
      "GET /api/account/erase": {
        entries: 1234,
        transfers: 12,
        debts: 3,
        goalDeposits: 5,
        files: 20,
        keptShared: 7,
      },
      "POST /api/account/erase": async (route: Route) => {
        body = route.request().postDataJSON();
        return { ok: true };
      },
    });
    await page.goto("/settings");

    await page.getByRole("button", { name: "ล้างประวัติการเงินทั้งหมด" }).click();
    const dialog = page.getByRole("dialog", { name: "ล้างประวัติการเงินทั้งหมด?" });
    await expect(dialog.getByText("รายการรับ/จ่าย 1,234 รายการ")).toBeVisible();
    await expect(dialog.getByText("รูปแนบและรูปสลิป 20 ไฟล์")).toBeVisible();
    await expect(dialog.getByText("กระเป๋าร่วม").first()).toBeVisible();
    await expect(dialog.getByLabel("คงยอดเงินปัจจุบันของแต่ละกระเป๋าไว้")).toBeChecked();
    await dialog.getByLabel("คงยอดเงินปัจจุบันของแต่ละกระเป๋าไว้").uncheck();

    await dialog.getByRole("button", { name: "ดำเนินการต่อ" }).click();
    const confirm = page.getByRole("button", { name: "ลบอย่างถาวร" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/พิมพ์/).fill("ล้างประวัติ");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByRole("status")).toContainText("ล้างประวัติการเงินแล้ว");
    expect(body).toEqual({ scope: "all", keepBalance: false, confirm: "ล้างประวัติ" });
  });

  test("delete one month: pick it, see the numbers, type the month's phrase", async ({ page }) => {
    let body: unknown = null;
    await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_FREE,
      "GET /api/account/erase": async (_route: Route, url: URL) =>
        url.searchParams.get("scope") === "month"
          ? { entries: 40, transfers: 0, debts: 0, goalDeposits: 0, files: 2, keptShared: 0 }
          : {
              months: [
                { month: "2026-10", entries: 40, transfers: 0 },
                { month: "2026-09", entries: 5, transfers: 1 },
              ],
            },
      "POST /api/account/erase": async (route: Route) => {
        body = route.request().postDataJSON();
        return { ok: true };
      },
    });
    await page.goto("/settings");

    await page.getByRole("button", { name: "ลบเฉพาะเดือน" }).click();
    await page.getByLabel("เดือนที่จะลบ").selectOption("2026-10");
    await expect(page.getByText("รายการรับ/จ่าย 40 รายการ")).toBeVisible();
    await page.getByRole("button", { name: "ดำเนินการต่อ" }).click();

    const confirm = page.getByRole("button", { name: "ลบอย่างถาวร" });
    await page.getByLabel(/พิมพ์/).fill("ลบเดือน ก.ย. 2569"); // the wrong month
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/พิมพ์/).fill("ลบเดือน ต.ค. 2569");
    await confirm.click();
    await expect(page.getByRole("status")).toContainText("ลบข้อมูลเดือน ต.ค. 2569 แล้ว");
    expect(body).toEqual({ scope: "month", month: "2026-10", confirm: "ลบเดือน ต.ค. 2569" });
  });

  test("nothing to delete: the continue button says so", async ({ page }) => {
    await mockApi(page, {
      ...COMMON,
      "GET /api/me": ME_FREE,
      "GET /api/account/erase": {
        entries: 0,
        transfers: 0,
        debts: 0,
        goalDeposits: 0,
        files: 0,
        keptShared: 0,
      },
    });
    await page.goto("/settings");
    await page.getByRole("button", { name: "ล้างประวัติการเงินทั้งหมด" }).click();
    await expect(page.getByRole("button", { name: "ไม่มีอะไรให้ลบ" })).toBeDisabled();
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
