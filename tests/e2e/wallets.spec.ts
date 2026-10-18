import { expect, test, type Route } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
} from "./helpers";

const wallet = (over: Record<string, unknown>) => ({
  id: "w1",
  name: "เงินสด",
  kind: "cash",
  isDefault: true,
  openingSatang: 100_000,
  incomeSatang: 50_000,
  expenseSatang: 20_000,
  balanceSatang: 130_000,
  entryCount: 4,
  ...over,
});

const TWO = {
  items: [
    wallet({}),
    wallet({
      id: "w2",
      name: "KTC",
      kind: "card",
      isDefault: false,
      openingSatang: -350_000,
      incomeSatang: 0,
      expenseSatang: 0,
      balanceSatang: -350_000,
      entryCount: 0,
    }),
  ],
  totalSatang: -220_000,
  limit: 5,
  canAdd: true,
};

test.describe("wallets page (360px)", () => {
  test("lists wallets with balances, the total and a negative card balance", async ({ page }) => {
    await mockApi(page, { "GET /api/me": ME_FREE, "GET /api/wallets": TWO });
    await page.goto("/wallets");

    await expect(page.getByText("รวมทุกกระเป๋า")).toBeVisible();
    await expect(page.getByText("-฿2,200").first()).toBeVisible();
    await expect(page.getByText("-฿3,500")).toBeVisible();
    await expect(page.getByText("หลัก", { exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousA11yViolations(page);
  });

  test("Free at the limit: no add button, an upgrade link instead", async ({ page }) => {
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/wallets": { items: [wallet({})], totalSatang: 130_000, limit: 1, canAdd: false },
    });
    await page.goto("/wallets");

    await expect(page.getByRole("button", { name: "เพิ่มกระเป๋า" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "ดูแผนอัปเกรด" })).toBeVisible();
  });

  test("adding sends the name, kind and opening balance", async ({ page }) => {
    let body: unknown = null;
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/wallets": TWO,
      "POST /api/wallets": async (route: Route) => {
        body = route.request().postDataJSON();
        return { id: "new" };
      },
    });
    await page.goto("/wallets");

    await page.getByRole("button", { name: "เพิ่มกระเป๋า" }).click();
    await page.getByLabel("ชื่อกระเป๋า").fill("กสิกร");
    await page.getByLabel("ชนิดกระเป๋า").selectOption("bank");
    await page.getByLabel("ยอดตั้งต้น").fill("5000");
    await page.getByRole("button", { name: "บันทึก" }).click();

    await expect(page.getByRole("status")).toContainText("เพิ่มกระเป๋าแล้ว");
    expect(body).toEqual({ name: "กสิกร", kind: "bank", openingBalance: "5000" });
  });

  test("a bad opening balance is refused before anything is sent", async ({ page }) => {
    let posted = false;
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/wallets": TWO,
      "POST /api/wallets": () => {
        posted = true;
        return { id: "x" };
      },
    });
    await page.goto("/wallets");

    await page.getByRole("button", { name: "เพิ่มกระเป๋า" }).click();
    await page.getByLabel("ชื่อกระเป๋า").fill("A");
    await page.getByLabel("ยอดตั้งต้น").fill("abc");
    await page.getByRole("button", { name: "บันทึก" }).click();

    await expect(page.getByText("ยอดตั้งต้นไม่ถูกต้อง (เช่น")).toBeVisible();
    expect(posted).toBe(false);
  });

  test("shows an error with a retry when loading fails", async ({ page }) => {
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/wallets": { status: 500, body: { error: "เซิร์ฟเวอร์ขัดข้อง" } },
    });
    await page.goto("/wallets");

    await expect(page.getByRole("button", { name: "ลองอีกครั้ง" })).toBeVisible();
  });
});
