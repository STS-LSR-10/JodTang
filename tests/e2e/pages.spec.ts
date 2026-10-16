import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
  ME_PLUS,
} from "./helpers";

const SERIES = Array.from({ length: 6 }, (_, i) => ({
  start: `2026-0${i + 5}-01T00:00:00Z`,
  label: ["พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค."][i] ?? "",
  incomeSatang: 2_000_000,
  expenseSatang: 1_200_000 + i * 50_000,
}));

const ANALYTICS = {
  view: "month",
  scope: "cycle",
  series: SERIES,
  categories: [
    { categoryId: "a", name: "อาหาร", color: "#0F766E", totalSatang: 300_000 },
    { categoryId: "b", name: "เดินทาง", color: "#0369A1", totalSatang: 150_000 },
  ],
  categoriesTotalSatang: 450_000,
};

const BUDGETS = {
  mode: "overall",
  cycle: "monthly",
  range: { from: "2026-09-30T17:00:00Z", to: "2026-10-31T17:00:00Z" },
  overall: { amountSatang: 1_000_000, spentSatang: 850_000 },
  categories: [
    { categoryId: "a", name: "อาหาร", color: "#0F766E", amountSatang: null, spentSatang: 300_000 },
  ],
};

const CATEGORIES = {
  items: [
    {
      id: "a",
      type: "expense",
      name: "อาหาร",
      own: false,
      keywords: ["ข้าว"],
      color: "#0F766E",
      isHidden: false,
      sortOrder: 1,
      isFallback: false,
    },
    {
      id: "z",
      type: "expense",
      name: "อื่นๆ",
      own: false,
      keywords: [],
      color: "#64748B",
      isHidden: false,
      sortOrder: 99,
      isFallback: true,
    },
  ],
};

test.describe("analytics page (360px)", () => {
  test("renders both charts and the category legend", async ({ page }) => {
    await mockApi(page, { "GET /api/analytics": ANALYTICS, "GET /api/me": ME_FREE });
    await page.goto("/analytics");

    await expect(page.getByRole("region", { name: "กราฟรายรับรายจ่าย" })).toBeVisible();
    await expect(page.getByRole("region", { name: "สัดส่วนรายจ่ายตามหมวด" })).toBeVisible();
    await expect(page.getByText("อาหาร").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("savings tab: locked for Free, real chart for Plus", async ({ page }) => {
    await mockApi(page, { "GET /api/analytics": ANALYTICS, "GET /api/me": ME_FREE });
    await page.goto("/analytics");
    await page.getByRole("tab", { name: /เก็บออม/ }).click();
    await expect(page.getByText("กราฟเก็บออมสำหรับแผน Professional")).toBeVisible();

    const plus = await page.context().newPage();
    await mockApi(plus, { "GET /api/analytics": ANALYTICS, "GET /api/me": ME_PLUS });
    await plus.goto("/analytics");
    await plus.getByRole("tab", { name: /เก็บออม/ }).click();
    await expect(plus.getByRole("region", { name: "กราฟเงินเก็บออม" })).toBeVisible();
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await mockApi(page, { "GET /api/analytics": ANALYTICS, "GET /api/me": ME_FREE });
    await page.goto("/analytics");
    await expect(page.getByRole("region", { name: "กราฟรายรับรายจ่าย" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});

test.describe("budgets page (360px)", () => {
  test("shows the budget progress with a text label, not just colour", async ({ page }) => {
    await mockApi(page, {
      "GET /api/budgets": BUDGETS,
      "GET /api/categories": CATEGORIES,
      "GET /api/me": ME_FREE,
    });
    await page.goto("/budgets");

    await expect(page.getByRole("progressbar", { name: "การใช้งบ" })).toBeVisible();
    await expect(page.getByText(/ใช้ไป ฿8,500 จาก ฿10,000 \(85%\)/)).toBeVisible();
    await expect(page.getByText(/ใกล้ครบงบ/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await mockApi(page, {
      "GET /api/budgets": BUDGETS,
      "GET /api/categories": CATEGORIES,
      "GET /api/me": ME_FREE,
    });
    await page.goto("/budgets");
    await expect(page.getByRole("progressbar", { name: "การใช้งบ" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});

test.describe("legal pages (public, no sign-in)", () => {
  for (const [path, heading] of [
    ["/privacy", "นโยบายความเป็นส่วนตัว"],
    ["/terms", "ข้อกำหนดการใช้งาน"],
  ] as const) {
    test(`${path} renders, fits the screen and is accessible`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole("note")).toContainText("ฉบับร่าง");
      await expectNoHorizontalScroll(page);
      await expectNoSeriousA11yViolations(page);
    });
  }

  test("security headers are present", async ({ request }) => {
    const res = await request.get("/privacy");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});
