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
    await page.getByRole("button", { name: /เลือกช่องทางชำระเงิน/ }).click();

    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({ plan: "ultimate", period: "yearly" });
    await expect(
      page.getByRole("status").filter({ hasText: "ยังไม่เปิดให้ชำระเงิน" }),
    ).toBeVisible();
  });

  test("a Professional user cannot buy Professional again", async ({ page }) => {
    await mockApi(page, { "GET /api/me": ME_PLUS });
    await page.goto("/upgrade");
    await expect(page.getByRole("button", { name: /ใช้แผน Professional อยู่แล้ว/ })).toBeDisabled();
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await mockApi(page, { "GET /api/me": ME_FREE });
    await page.goto("/upgrade");
    await expect(page.getByRole("table")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
