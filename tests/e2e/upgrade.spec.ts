import { expect, test, type Route } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
  ME_PLUS,
} from "./helpers";

test.describe("upgrade page (360px)", () => {
  test("shows three plans with the agreed prices and switches period", async ({ page }) => {
    await mockApi(page, { "GET /api/me": ME_FREE });
    await page.goto("/upgrade");

    const plans = page.getByRole("radiogroup", { name: "เลือกแผน" });
    await expect(plans.getByText("Free", { exact: true })).toBeVisible();
    await expect(plans.getByRole("radio", { name: /^Professional/ })).toContainText("฿299");
    await expect(plans.getByRole("radio", { name: /Ultimate/ })).toContainText("฿799");

    await page.getByRole("radio", { name: /รายเดือน/ }).click();
    await expect(plans.getByRole("radio", { name: /^Professional/ })).toContainText("฿59");
    await expect(plans.getByRole("radio", { name: /Ultimate/ })).toContainText("฿139");
    await expectNoHorizontalScroll(page);
  });

  test("comparison table lists upcoming Ultimate features as coming soon", async ({ page }) => {
    await mockApi(page, { "GET /api/me": ME_FREE });
    await page.goto("/upgrade");
    const table = page.getByRole("table");
    await expect(table.getByRole("row", { name: /จดด้วย PDF/ })).toContainText("เร็วๆ นี้");
    await expect(table.getByRole("row", { name: /อ่านสลิปอัตโนมัติ/ })).toContainText(
      "30 ใบ/เดือน",
    );
  });

  test("checkout sends the chosen plan and period; the stub explains it is not open", async ({
    page,
  }) => {
    const bodies: unknown[] = [];
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "POST /api/plan/checkout": (route: Route) => {
        bodies.push(route.request().postDataJSON());
        return { available: false, message: "ยังไม่เปิดให้ชำระเงิน" };
      },
    });
    await page.goto("/upgrade");
    await page.getByRole("radio", { name: /Ultimate/ }).click();
    await page.getByRole("radio", { name: /พร้อมเพย์/ }).click();
    await page.getByRole("button", { name: /ชำระเงิน · Ultimate/ }).click();

    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({ plan: "ultimate", period: "yearly", method: "promptpay" });
    await expect(
      page.getByRole("status").filter({ hasText: "ยังไม่เปิดให้ชำระเงิน" }),
    ).toBeVisible();
  });

  test("offers card (auto-renew) and PromptPay (one period) and defaults to card", async ({
    page,
  }) => {
    await mockApi(page, { "GET /api/me": ME_FREE });
    await page.goto("/upgrade");
    const methods = page.getByRole("radiogroup", { name: "ช่องทางชำระเงิน" });
    await expect(methods.getByRole("radio", { name: /บัตรเครดิต/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(methods.getByRole("radio", { name: /พร้อมเพย์/ })).toContainText(
      "ไม่ต่ออายุอัตโนมัติ",
    );
    await expect(page.getByRole("button", { name: /จัดการการชำระเงิน/ })).toHaveCount(0);
  });

  test("a card subscriber cannot pay a second time but can open the billing portal", async ({
    page,
  }) => {
    const me = {
      ...ME_PLUS,
      payments: { available: true, history: [], canManage: true, autoRenew: true },
    };
    const { seen } = await mockApi(page, {
      "GET /api/me": me,
      "POST /api/plan/portal": { available: false, message: "ยังไม่เปิด" },
    });
    await page.goto("/upgrade");
    const pay = page.getByRole("button", { name: /(ชำระเงิน|ต่ออายุ) · Professional/ });
    await expect(pay).toBeDisabled();
    await expect(page.getByText(/ต่ออายุอัตโนมัติด้วยบัตรอยู่/)).toBeVisible();

    // PromptPay would pay twice for the same time, so it is blocked as well
    await page.getByRole("radio", { name: /พร้อมเพย์/ }).click();
    await expect(pay).toBeDisabled();

    await page.getByRole("button", { name: /จัดการการชำระเงิน/ }).click();
    await expect.poll(() => seen.some((s) => s.startsWith("POST /api/plan/portal"))).toBe(true);
  });

  test("prepaid (PromptPay) time can be topped up or upgraded, but not mixed with a card", async ({
    page,
  }) => {
    const me = {
      ...ME_PLUS,
      payments: { available: true, history: [], canManage: false, prepaidRunning: true },
    };
    await mockApi(page, { "GET /api/me": me });
    await page.goto("/upgrade");

    // card is the default method: blocked with an explanation
    await expect(page.getByText(/แผนแบบพร้อมเพย์ที่ยังไม่หมดอายุ/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /(ชำระเงิน|ต่ออายุ) · Professional/ }),
    ).toBeDisabled();

    await page.getByRole("radio", { name: /พร้อมเพย์/ }).click();
    await expect(page.getByRole("button", { name: /ต่ออายุ · Professional/ })).toBeEnabled();
    await page.getByRole("radio", { name: /^Ultimate/ }).click();
    await expect(page.getByRole("button", { name: /ชำระเงิน · Ultimate/ })).toBeEnabled();
  });

  test("an Ultimate user cannot buy the cheaper plan", async ({ page }) => {
    await mockApi(page, { "GET /api/me": { ...ME_PLUS, plan: "ultimate" } });
    await page.goto("/upgrade");
    await expect(page.getByText("คุณใช้แผนที่สูงกว่านี้อยู่แล้ว")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ต่ออายุ · Professional|ชำระเงิน · Professional/ }),
    ).toBeDisabled();
  });
  test("has no serious accessibility violations", async ({ page }) => {
    await mockApi(page, { "GET /api/me": ME_FREE });
    await page.goto("/upgrade");
    await expect(page.getByRole("table")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
