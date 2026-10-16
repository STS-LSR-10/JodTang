import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
  TX,
} from "./helpers";

const SUMMARY = {
  range: { from: "2026-09-30T17:00:00Z", to: "2026-10-31T17:00:00Z" },
  cycle: "monthly",
  incomeSatang: 2_000_000,
  expenseSatang: 750_000,
  balanceSatang: 1_250_000,
  count: 3,
  recent: [
    TX(),
    TX({
      id: "22222222-2222-2222-2222-222222222222",
      title: "เงินเดือน",
      type: "income",
      amountSatang: 2_000_000,
    }),
  ],
};

test.describe("summary page (360px)", () => {
  test("shows balance, totals and recent entries", async ({ page }) => {
    await mockApi(page, { "GET /api/summary": SUMMARY, "GET /api/me": ME_FREE });
    await page.goto("/summary");

    await expect(page.getByRole("heading", { name: "สรุป" })).toBeVisible();
    await expect(page.getByText("฿12,500", { exact: true })).toBeVisible(); // balance
    await expect(page.getByText("฿7,500", { exact: true })).toBeVisible(); // expense
    await expect(page.getByText("กาแฟ")).toBeVisible();
    await expect(page.getByText("เงินเดือน")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("bottom navigation has five tabs and marks the current page", async ({ page }) => {
    await mockApi(page, { "GET /api/summary": SUMMARY, "GET /api/me": ME_FREE });
    await page.goto("/summary");

    const nav = page.getByRole("navigation", { name: "เมนูหลัก" });
    await expect(nav.getByRole("link")).toHaveCount(5);
    await expect(nav.getByRole("link", { name: "สรุป" })).toHaveAttribute("aria-current", "page");
  });

  test("empty state when there are no entries", async ({ page }) => {
    await mockApi(page, {
      "GET /api/summary": {
        ...SUMMARY,
        incomeSatang: 0,
        expenseSatang: 0,
        balanceSatang: 0,
        count: 0,
        recent: [],
      },
      "GET /api/me": ME_FREE,
    });
    await page.goto("/summary");
    await expect(page.getByText("ยังไม่มีรายการเลย")).toBeVisible();
  });

  test("error state offers a retry that recovers", async ({ page }) => {
    let calls = 0;
    await mockApi(page, {
      "GET /api/summary": () =>
        ++calls === 1 ? { status: 500, body: { error: "ขออภัย ระบบสะดุดชั่วคราว" } } : SUMMARY,
      "GET /api/me": ME_FREE,
    });
    await page.goto("/summary");

    await expect(page.getByRole("alert").filter({ hasText: "ระบบสะดุดชั่วคราว" })).toBeVisible();
    await page.getByRole("button", { name: "ลองอีกครั้ง" }).click();
    await expect(page.getByText("฿12,500", { exact: true })).toBeVisible();
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await mockApi(page, { "GET /api/summary": SUMMARY, "GET /api/me": ME_FREE });
    await page.goto("/summary");
    await expect(page.getByText("กาแฟ")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
