import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
  TX,
} from "./helpers";

const LIST = {
  items: [
    TX(),
    TX({
      id: "22222222-2222-2222-2222-222222222222",
      title: "น้ำมัน",
      amountSatang: 50_000,
      categoryName: "เดินทาง",
    }),
    TX({
      id: "33333333-3333-3333-3333-333333333333",
      title: "ร้านลุงหนวด",
      hasSlip: true,
      source: "slip",
    }),
  ],
  hasMore: false,
};

const CATEGORIES = { items: [{ id: "c1", type: "expense", name: "อาหาร", own: false }] };

test.describe("transactions page (360px)", () => {
  test("lists entries with delete and slip buttons, no sideways scroll", async ({ page }) => {
    await mockApi(page, { "GET /api/transactions": LIST, "GET /api/me": ME_FREE });
    await page.goto("/transactions");

    await expect(page.getByText("น้ำมัน")).toBeVisible();
    await expect(page.getByRole("button", { name: "ลบ กาแฟ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ดูสลิป ร้านลุงหนวด" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("the type filter re-queries the server", async ({ page }) => {
    const { seen } = await mockApi(page, { "GET /api/transactions": LIST, "GET /api/me": ME_FREE });
    await page.goto("/transactions");
    await expect(page.getByText("น้ำมัน")).toBeVisible();

    await page.getByRole("tab", { name: "รายจ่าย" }).click();
    await expect.poll(() => seen.some((s) => s.includes("type=expense"))).toBe(true);
  });

  test("empty state", async ({ page }) => {
    await mockApi(page, {
      "GET /api/transactions": { items: [], hasMore: false },
      "GET /api/me": ME_FREE,
    });
    await page.goto("/transactions");
    await expect(page.getByText("ยังไม่มีรายการ", { exact: true })).toBeVisible();
  });

  test("deleting asks first, then calls the API", async ({ page }) => {
    const { seen } = await mockApi(page, {
      "GET /api/transactions": LIST,
      "GET /api/me": ME_FREE,
      "DELETE /api/transactions/11111111-1111-1111-1111-111111111111": { ok: true },
    });
    page.once("dialog", (d) => void d.accept());
    await page.goto("/transactions");
    await page.getByRole("button", { name: "ลบ กาแฟ" }).click();
    await expect
      .poll(() => seen.some((s) => s.startsWith("DELETE /api/transactions/1111")))
      .toBe(true);
  });

  test("add sheet validates the amount before sending", async ({ page }) => {
    const { seen } = await mockApi(page, {
      "GET /api/transactions": LIST,
      "GET /api/categories": CATEGORIES,
      "GET /api/me": ME_FREE,
    });
    await page.goto("/transactions");
    await page.getByRole("button", { name: "เพิ่ม" }).click();

    await page.getByLabel("ชื่อรายการ", { exact: true }).fill("ข้าว");
    await page.getByLabel("จำนวนเงิน").fill("abc");
    await page.getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "จำนวนเงินไม่ถูกต้อง" })).toBeVisible();
    expect(seen.some((s) => s.startsWith("POST"))).toBe(false);
  });

  test("export sheet explains the external download", async ({ page }) => {
    await mockApi(page, { "GET /api/transactions": LIST, "GET /api/me": ME_FREE });
    await page.goto("/transactions");
    await page.getByRole("button", { name: "ส่งออกไฟล์" }).click();

    await expect(page.getByRole("dialog", { name: "ส่งออกไฟล์" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ดาวน์โหลด CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: /ดาวน์โหลด Excel/ })).toBeVisible();
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await mockApi(page, { "GET /api/transactions": LIST, "GET /api/me": ME_FREE });
    await page.goto("/transactions");
    await expect(page.getByText("น้ำมัน")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
