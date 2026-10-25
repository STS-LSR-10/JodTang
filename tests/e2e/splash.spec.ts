import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, mockApi, ME_FREE } from "./helpers";

test.describe("opening screen (360px)", () => {
  test("shows the muted looping logo video while signing in, then the page", async ({ page }) => {
    await mockApi(page, {
      "GET /api/pin/status": async () => {
        await new Promise((r) => setTimeout(r, 1200));
        return { required: false };
      },
      "GET /api/transactions": { items: [], hasMore: false },
      "GET /api/me": ME_FREE,
      "GET /api/wallets": { items: [] },
    });
    await page.goto("/transactions");

    const splash = page.getByRole("status", { name: "กำลังเปิดแอป" });
    await expect(splash).toBeVisible();
    const video = splash.locator("video");
    await expect(video).toHaveAttribute("src", "/loading.mp4");
    expect(await video.evaluate((v: HTMLVideoElement) => [v.muted, v.loop])).toEqual([true, true]);
    await expectNoHorizontalScroll(page);

    await expect(splash).toHaveCount(0);
    await expect(page.getByText("ยังไม่มีรายการ")).toBeVisible();
  });

  test("the entry page is the same opening screen, with no title or tagline text", async ({
    page,
  }) => {
    // hold the redirect target so the entry page stays on screen
    await mockApi(page, {
      "GET /api/pin/status": async () => {
        await new Promise((r) => setTimeout(r, 1500));
        return { required: false };
      },
      "GET /api/me": ME_FREE,
      "GET /api/wallets": { items: [] },
    });
    await page.route("**/summary**", (route) => route.abort());
    await page.goto("/");
    const splash = page.getByRole("status", { name: "กำลังเปิดแอป" });
    await expect(splash).toBeVisible();
    await expect(page.getByText("จดง่าย เห็นเงินชัด")).toHaveCount(0);
    await expect(page.getByText("กำลังเปิด...")).toHaveCount(0);
  });
});
