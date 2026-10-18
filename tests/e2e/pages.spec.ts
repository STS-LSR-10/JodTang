import { expect, test, type Route } from "@playwright/test";
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
    await mockApi(page, { "GET /api/analytics": ANALYTICS, "GET /api/me": ME_PLUS });
    await page.goto("/analytics");

    await expect(page.getByRole("region", { name: "กราฟรายรับรายจ่าย" })).toBeVisible();
    await expect(page.getByRole("region", { name: "สัดส่วนรายจ่ายตามหมวด" })).toBeVisible();
    await expect(page.getByText("อาหาร").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("Free sees a locked page with an upgrade link and never calls the analytics API", async ({
    page,
  }) => {
    const { seen } = await mockApi(page, {
      "GET /api/analytics": ANALYTICS,
      "GET /api/me": ME_FREE,
    });
    await page.goto("/analytics");

    await expect(page.getByText("กราฟและตารางวิเคราะห์สำหรับแผน Professional")).toBeVisible();
    await expect(page.getByRole("link", { name: /ดูแผน Professional/ })).toHaveAttribute(
      "href",
      "/upgrade",
    );
    await expect(page.getByText("สรุปเดือนนี้ · สรุปหมวด · ล่าสุด")).toBeVisible();
    await expect(page.getByRole("region", { name: "กราฟรายรับรายจ่าย" })).toHaveCount(0);
    expect(seen.some((s) => s.includes("/api/analytics"))).toBe(false);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousA11yViolations(page);
  });

  test("savings tab shows the real chart for Plus", async ({ page }) => {
    await mockApi(page, { "GET /api/analytics": ANALYTICS, "GET /api/me": ME_PLUS });
    await page.goto("/analytics");
    await page.getByRole("tab", { name: /เก็บออม/ }).click();
    await expect(page.getByRole("region", { name: "กราฟเงินเก็บออม" })).toBeVisible();
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await mockApi(page, { "GET /api/analytics": ANALYTICS, "GET /api/me": ME_PLUS });
    await page.goto("/analytics");
    await expect(page.getByRole("region", { name: "กราฟรายรับรายจ่าย" })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});

const OWN_CATEGORIES = {
  items: [
    ...CATEGORIES.items,
    {
      id: "m1",
      type: "expense",
      name: "ค่าอาหารแมว",
      own: true,
      keywords: ["ทราย"],
      color: "#7C3AED",
      emoji: "🐱",
      isHidden: false,
      sortOrder: 5,
      isFallback: false,
    },
  ],
};

test.describe("custom categories (360px)", () => {
  const BASE = { "GET /api/budgets": BUDGETS, "GET /api/categories": OWN_CATEGORIES };

  test("a category's emoji is shown in front of its name", async ({ page }) => {
    await mockApi(page, { ...BASE, "GET /api/me": ME_PLUS });
    await page.goto("/budgets");
    const row = page.getByRole("listitem").filter({ hasText: "ค่าอาหารแมว" });
    await expect(row).toContainText("🐱");
    await expectNoHorizontalScroll(page);
  });

  test("Free: adding shows the Professional lock and sends nothing", async ({ page }) => {
    const { seen } = await mockApi(page, { ...BASE, "GET /api/me": ME_FREE });
    await page.goto("/budgets");
    await page.getByRole("button", { name: /เพิ่มหมวด/ }).click();

    const dialog = page.getByRole("dialog", { name: "หมวดของตัวเอง" });
    await expect(dialog.getByText("สร้างหมวดของตัวเองสำหรับแผน Professional")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "ดูแผน Professional" })).toHaveAttribute(
      "href",
      "/upgrade",
    );
    await expect(page.getByLabel("ชื่อหมวด")).toHaveCount(0);
    expect(seen.some((s) => s.startsWith("POST"))).toBe(false);
  });

  test("Free: an own category can be deleted but not edited", async ({ page }) => {
    await mockApi(page, { ...BASE, "GET /api/me": ME_FREE });
    await page.goto("/budgets");
    await page.getByRole("button", { name: "แก้ไข ค่าอาหารแมว" }).click();

    const dialog = page.getByRole("dialog", { name: "แก้ไขหมวด" });
    await expect(dialog.getByLabel("ชื่อหมวด")).toBeDisabled();
    await expect(dialog.getByText("แก้หมวดของตัวเองได้ในแผน Professional ขึ้นไป")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "บันทึก" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "ลบหมวดนี้" })).toBeVisible();
    await expect(dialog.getByRole("radiogroup", { name: "เลือกอีโมจิ" })).toHaveCount(0);
  });

  test("Professional: pick an emoji from the grid and it is sent with the new category", async ({
    page,
  }) => {
    const bodies: unknown[] = [];
    await mockApi(page, {
      ...BASE,
      "GET /api/me": ME_PLUS,
      "POST /api/categories": (route: Route) => {
        bodies.push(route.request().postDataJSON());
        return { id: "new" };
      },
    });
    await page.goto("/budgets");
    await page.getByRole("button", { name: /เพิ่มหมวด/ }).click();

    const dialog = page.getByRole("dialog", { name: /เพิ่มหมวด/ });
    await dialog.getByLabel("ชื่อหมวด").fill("เติมเกม");
    await dialog.getByRole("radio", { name: "อีโมจิ 🎮" }).click();
    await expect(dialog.getByRole("radio", { name: "อีโมจิ 🎮" })).toBeChecked();
    await expectNoSeriousA11yViolations(page);
    await dialog.getByRole("button", { name: "เพิ่มหมวด" }).click();

    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({ type: "expense", name: "เติมเกม", emoji: "🎮" });
  });

  test("Professional: typing something that is not one emoji is refused before sending", async ({
    page,
  }) => {
    const { seen } = await mockApi(page, { ...BASE, "GET /api/me": ME_PLUS });
    await page.goto("/budgets");
    await page.getByRole("button", { name: /เพิ่มหมวด/ }).click();

    const dialog = page.getByRole("dialog", { name: /เพิ่มหมวด/ });
    await dialog.getByLabel("ชื่อหมวด").fill("ทดสอบ");
    await dialog.getByLabel("อีโมจิ (พิมพ์เอง)").fill("ab");
    await expect(dialog.getByText("ใส่ได้เป็นอีโมจิตัวเดียวเท่านั้นนะ").first()).toBeVisible();
    await dialog.getByRole("button", { name: "เพิ่มหมวด" }).click();
    await expect(dialog.getByRole("alert")).toContainText("อีโมจิตัวเดียว");
    expect(seen.some((s) => s.startsWith("POST"))).toBe(false);
  });

  test("Professional: clearing the emoji sends an empty one", async ({ page }) => {
    const bodies: unknown[] = [];
    await mockApi(page, {
      ...BASE,
      "GET /api/me": ME_PLUS,
      "PATCH /api/categories/m1": (route: Route) => {
        bodies.push(route.request().postDataJSON());
        return { ok: true };
      },
    });
    await page.goto("/budgets");
    await page.getByRole("button", { name: "แก้ไข ค่าอาหารแมว" }).click();
    const dialog = page.getByRole("dialog", { name: "แก้ไขหมวด" });
    await expect(dialog.getByRole("radio", { name: "อีโมจิ 🐱" })).toBeChecked();
    await dialog.getByRole("button", { name: "ล้าง" }).click();
    await dialog.getByRole("button", { name: "บันทึก" }).click();

    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({ emoji: "" });
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

test.describe("category budgets are Professional and above (360px)", () => {
  const CATEGORY_MODE = {
    ...BUDGETS,
    mode: "category",
    categories: [
      {
        categoryId: "a",
        name: "อาหาร",
        color: "#0F766E",
        amountSatang: 300_000,
        spentSatang: 100_000,
      },
    ],
  };
  const FOOD = { items: [CATEGORIES.items[0]] };

  test("Free: the แยกหมวด choice is off and the upgrade note shows; the overall budget works", async ({
    page,
  }) => {
    await mockApi(page, {
      "GET /api/budgets": BUDGETS,
      "GET /api/categories": CATEGORIES,
      "GET /api/me": ME_FREE,
    });
    await page.goto("/budgets");

    await expect(page.getByRole("radio", { name: "แยกหมวด" })).toBeDisabled();
    await expect(page.getByRole("radio", { name: "งบรวม" })).toBeEnabled();
    await expect(page.getByText("สำหรับแผน Professional").first()).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "การใช้งบ" })).toBeVisible();
  });

  test("Free with an old category budget: kept, shown, but read only", async ({ page }) => {
    await mockApi(page, {
      "GET /api/budgets": CATEGORY_MODE,
      "GET /api/categories": FOOD,
      "GET /api/me": ME_FREE,
    });
    await page.goto("/budgets");

    const field = page.getByLabel("งบหมวด อาหาร");
    await expect(field).toBeDisabled();
    await expect(field).toHaveValue("3000");
    await expect(page.getByRole("radio", { name: "งบรวม" })).toBeEnabled();
  });

  test("Professional: the แยกหมวด choice and the budget field are open", async ({ page }) => {
    await mockApi(page, {
      "GET /api/budgets": CATEGORY_MODE,
      "GET /api/categories": FOOD,
      "GET /api/me": ME_PLUS,
    });
    await page.goto("/budgets");

    await expect(page.getByRole("radio", { name: "แยกหมวด" })).toBeEnabled();
    await expect(page.getByLabel("งบหมวด อาหาร")).toBeEnabled();
    await expect(page.getByText("จะแจ้งเตือนในแชทเมื่อใช้ถึง 80%")).toBeVisible();
  });
});

test.describe("daily budget (360px)", () => {
  const WITH_DAILY = { ...BUDGETS, daily: { amountSatang: 50_000, spentSatang: 62_000 } };
  const NO_DAILY = { ...BUDGETS, daily: { amountSatang: null, spentSatang: 32_000 } };

  test("Professional: shows today's use of the limit and saves a new one", async ({ page }) => {
    const bodies: unknown[] = [];
    await mockApi(page, {
      "GET /api/budgets": WITH_DAILY,
      "GET /api/categories": CATEGORIES,
      "GET /api/me": ME_PLUS,
      "PUT /api/budgets": async (route: Route) => {
        bodies.push(route.request().postDataJSON());
        return { ok: true };
      },
    });
    await page.goto("/budgets");

    const section = page.getByRole("region", { name: "งบรายวัน" });
    await expect(section.getByRole("progressbar", { name: "การใช้งบวันนี้" })).toBeVisible();
    await expect(section.getByText("เกินงบ")).toBeVisible();
    await section.getByLabel("งบรายวัน").fill("800");
    await section.getByRole("button", { name: "บันทึก" }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({ daily: "800" });
  });

  test("clearing the field sends null", async ({ page }) => {
    const bodies: unknown[] = [];
    await mockApi(page, {
      "GET /api/budgets": WITH_DAILY,
      "GET /api/categories": CATEGORIES,
      "GET /api/me": ME_PLUS,
      "PUT /api/budgets": async (route: Route) => {
        bodies.push(route.request().postDataJSON());
        return { ok: true };
      },
    });
    await page.goto("/budgets");

    const section = page.getByRole("region", { name: "งบรายวัน" });
    await section.getByLabel("งบรายวัน").fill("");
    await section.getByRole("button", { name: "บันทึก" }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({ daily: null });
  });

  test("a bad amount is refused before sending", async ({ page }) => {
    await mockApi(page, {
      "GET /api/budgets": NO_DAILY,
      "GET /api/categories": CATEGORIES,
      "GET /api/me": ME_PLUS,
    });
    await page.goto("/budgets");

    const section = page.getByRole("region", { name: "งบรายวัน" });
    await section.getByLabel("งบรายวัน").fill("abc");
    await section.getByRole("button", { name: "บันทึก" }).click();
    await expect(section.getByText("จำนวนเงินไม่ถูกต้อง")).toBeVisible();
  });

  test("Free: the field is off with an upgrade note", async ({ page }) => {
    await mockApi(page, {
      "GET /api/budgets": NO_DAILY,
      "GET /api/categories": CATEGORIES,
      "GET /api/me": ME_FREE,
    });
    await page.goto("/budgets");

    const section = page.getByRole("region", { name: "งบรายวัน" });
    await expect(section.getByLabel("งบรายวัน")).toBeDisabled();
    await expect(section.getByText("สำหรับแผน Professional")).toBeVisible();
    await expectNoHorizontalScroll(page);
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
