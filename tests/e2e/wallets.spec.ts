import { expect, test, type Route } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
  ME_PLUS,
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

  test("Professional: transfer between wallets sends both ids and the amount", async ({ page }) => {
    let body: unknown = null;
    await mockApi(page, {
      "GET /api/me": ME_PLUS,
      "GET /api/wallets": TWO,
      "GET /api/transfers": {
        items: [
          {
            id: "t1",
            fromId: "w1",
            fromName: "เงินสด",
            toId: "w2",
            toName: "KTC",
            amountSatang: 50_000,
            occurredAt: "2026-10-10T05:00:00Z",
            note: null,
          },
        ],
      },
      "POST /api/transfers": async (route: Route) => {
        body = route.request().postDataJSON();
        return { id: "new" };
      },
    });
    await page.goto("/wallets");

    await expect(page.getByText("เงินสด → KTC")).toBeVisible();
    await page.getByRole("button", { name: "โอน", exact: true }).click();
    await page.getByLabel("จำนวนเงินที่โอน").fill("250");
    await page.getByRole("button", { name: "โอน", exact: true }).last().click();

    await expect(page.getByRole("status")).toContainText("โอนแล้ว");
    expect(body).toEqual({ fromId: "w1", toId: "w2", amount: "250", note: null });
    await expectNoHorizontalScroll(page);
  });

  test("Free: the transfer button is off and says why", async ({ page }) => {
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/wallets": TWO,
      "GET /api/transfers": { items: [] },
    });
    await page.goto("/wallets");

    await expect(page.getByRole("button", { name: "โอน", exact: true })).toBeDisabled();
    await expect(page.getByText("สำหรับแผน Professional")).toBeVisible();
  });

  test("the same wallet on both sides is refused before sending", async ({ page }) => {
    await mockApi(page, {
      "GET /api/me": ME_PLUS,
      "GET /api/wallets": TWO,
      "GET /api/transfers": { items: [] },
    });
    await page.goto("/wallets");

    await page.getByRole("button", { name: "โอน", exact: true }).click();
    await page.getByLabel("ไปกระเป๋า").selectOption("w1");
    await page.getByLabel("จำนวนเงินที่โอน").fill("10");
    await page.getByRole("button", { name: "โอน", exact: true }).last().click();

    await expect(page.getByText("เลือกสองกระเป๋าที่ต่างกันนะ")).toBeVisible();
  });
});

test.describe("credit-card wallets (360px)", () => {
  const CARD = wallet({
    id: "w3",
    name: "KTC",
    kind: "card",
    isDefault: false,
    openingSatang: 0,
    incomeSatang: 0,
    expenseSatang: 4_500_000,
    balanceSatang: -4_500_000,
    creditLimitSatang: 5_000_000,
    statementDay: 25,
    dueDay: 10,
    card: {
      owedSatang: 4_500_000,
      limitSatang: 5_000_000,
      availableSatang: 500_000,
      usedPercent: 90,
      cycleSpentSatang: 120_000,
      previousCycleSpentSatang: 80_000,
      nextStatement: "2026-10-24T17:00:00Z",
      nextDue: "2026-11-09T17:00:00Z",
    },
  });
  const LIST = {
    items: [wallet({}), CARD],
    totalSatang: -4_370_000,
    limit: 5,
    canAdd: true,
  };

  test("shows the limit left, a usage bar and both statement cycles", async ({ page }) => {
    await mockApi(page, {
      "GET /api/me": ME_PLUS,
      "GET /api/wallets": LIST,
      "GET /api/transfers": { items: [] },
    });
    await page.goto("/wallets");

    await expect(page.getByText("วงเงินคงเหลือ")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "การใช้วงเงิน" })).toHaveAttribute(
      "aria-valuenow",
      "90",
    );
    await expect(page.getByText("ยอดใช้รอบที่แล้ว")).toBeVisible();
    await expect(page.getByText("ครบกำหนดชำระ")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousA11yViolations(page);
  });

  test("Professional: saving a card sends the limit and the two days", async ({ page }) => {
    let body: unknown = null;
    await mockApi(page, {
      "GET /api/me": ME_PLUS,
      "GET /api/wallets": LIST,
      "GET /api/transfers": { items: [] },
      "PATCH /api/wallets/w3": async (route: Route) => {
        body = route.request().postDataJSON();
        return { ok: true };
      },
    });
    await page.goto("/wallets");

    await page.getByRole("button", { name: "แก้ไข KTC" }).click();
    await page.getByLabel("วงเงิน", { exact: true }).fill("60000");
    await page.getByLabel("วันตัดรอบบิล").selectOption("20");
    await page.getByRole("button", { name: "บันทึก" }).click();

    await expect(page.getByRole("status")).toContainText("บันทึกแล้ว");
    expect(body).toMatchObject({
      kind: "card",
      creditLimit: "60000",
      statementDay: 20,
      dueDay: 10,
    });
  });

  test("Free: the card fields are replaced by an upgrade note", async ({ page }) => {
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/wallets": { ...LIST, items: [wallet({}), { ...CARD, card: null }] },
      "GET /api/transfers": { items: [] },
    });
    await page.goto("/wallets");

    await page.getByRole("button", { name: "แก้ไข KTC" }).click();
    await expect(page.getByLabel("วงเงิน", { exact: true })).toHaveCount(0);
    await expect(page.getByText("สำหรับแผน Professional").last()).toBeVisible();
  });
});
