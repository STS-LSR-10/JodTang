import { expect, test, type Route } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
  ME_PLUS,
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
      tags: ["ทริปเหนือ", "company"],
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
    await expect(page.getByText("#ทริปเหนือ #company")).toBeVisible();
    await expect(page.getByRole("button", { name: "ลบ กาแฟ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ดูสลิป ร้านลุงหนวด" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("a foreign-currency entry shows the original amount and the rate under the title", async ({
    page,
  }) => {
    await mockApi(page, {
      "GET /api/transactions": {
        items: [
          TX({
            title: "ราเมน",
            amountSatang: 35_025,
            origCurrency: "JPY",
            origAmountMinor: 150_000,
            fxRate: 0.2335,
          }),
        ],
        hasMore: false,
      },
      "GET /api/me": ME_FREE,
    });
    await page.goto("/transactions");

    await expect(page.getByText("1,500 JPY @ 0.2335")).toBeVisible();
    await expect(page.getByText("-฿350.25")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("entries in a shared wallet show who wrote them; the other person's cannot be changed", async ({
    page,
  }) => {
    await mockApi(page, {
      "GET /api/transactions": {
        items: [
          TX({
            id: "m1",
            title: "ข้าวเย็น",
            accountShared: true,
            accountName: "กองกลาง",
            mine: true,
            writerName: "แอน",
          }),
          TX({
            id: "o1",
            title: "ค่าน้ำมัน",
            accountShared: true,
            accountName: "กองกลาง",
            mine: false,
            writerName: "บ๊อบ",
          }),
        ],
        hasMore: false,
      },
      "GET /api/me": ME_FREE,
    });
    await page.goto("/transactions");

    await expect(page.getByText(/คุณ · กองกลาง/)).toBeVisible();
    await expect(page.getByText(/บ๊อบ · กองกลาง/)).toBeVisible();
    await expect(page.getByRole("button", { name: "ลบ ข้าวเย็น" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ลบ ค่าน้ำมัน" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "แก้ไข ค่าน้ำมัน" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "แก้ไข ข้าวเย็น" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("the type filter re-queries the server", async ({ page }) => {
    const { seen } = await mockApi(page, { "GET /api/transactions": LIST, "GET /api/me": ME_FREE });
    await page.goto("/transactions");
    await expect(page.getByText("น้ำมัน")).toBeVisible();

    await page.getByRole("tab", { name: "รายจ่าย" }).click();
    await expect.poll(() => seen.some((s) => s.includes("type=expense"))).toBe(true);
  });

  test("searching with a # sends the text as typed so the server filters by tag", async ({
    page,
  }) => {
    const { seen } = await mockApi(page, { "GET /api/transactions": LIST, "GET /api/me": ME_FREE });
    await page.goto("/transactions");
    await expect(page.getByText("น้ำมัน")).toBeVisible();

    await page.getByRole("searchbox", { name: "ค้นหาชื่อรายการหรือแท็ก" }).fill("#company");
    await expect.poll(() => seen.some((s) => s.includes("q=%23company"))).toBe(true);
  });

  test("an entry with a photo shows a photo button that opens and can remove it", async ({
    page,
  }) => {
    const id = "44444444-4444-4444-4444-444444444444";
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const { seen } = await mockApi(page, {
      "GET /api/transactions": {
        items: [TX({ id, title: "ข้าวมันไก่", hasPhoto: true })],
        hasMore: false,
      },
      [`GET /api/transactions/${id}/photo`]: { url: png, expiresIn: 60 },
      [`DELETE /api/transactions/${id}/photo`]: { ok: true },
      "GET /api/me": ME_FREE,
    });
    page.on("dialog", (d) => d.accept());
    await page.goto("/transactions");

    await page.getByRole("button", { name: "ดูรูปแนบ ข้าวมันไก่" }).click();
    await expect(page.getByRole("img", { name: "รูปแนบของรายการ ข้าวมันไก่" })).toBeVisible();
    await page.getByRole("button", { name: "ลบรูปแนบ" }).click();
    await expect
      .poll(() => seen.some((s) => s.includes(`DELETE /api/transactions/${id}/photo`)))
      .toBe(true);
    await expect(page.getByText("ลบรูปแนบแล้ว")).toBeVisible();
  });

  test("a search link prefills the box, and Professional sees the totals of everything found", async ({
    page,
  }) => {
    await mockApi(page, {
      "GET /api/transactions": {
        items: [TX({ title: "กาแฟเย็น" })],
        hasMore: false,
        totals: { incomeSatang: 10_000, expenseSatang: 10_550, count: 3 },
      },
      "GET /api/me": ME_FREE,
    });
    await page.goto("/transactions?q=กาแฟ");

    await expect(page.getByRole("searchbox", { name: "ค้นหาชื่อรายการหรือแท็ก" })).toHaveValue(
      "กาแฟ",
    );
    const strip = page.getByRole("status", { name: "ยอดรวมของผลค้นหา" });
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("+฿100");
    await expect(strip).toContainText("-฿105.50");
    await expect(strip).toContainText("3 รายการ");
    await expectNoHorizontalScroll(page);
  });

  test("no totals strip when the server sends none (Free) or nothing is searched", async ({
    page,
  }) => {
    await mockApi(page, {
      "GET /api/transactions": { items: [TX()], hasMore: false, totals: null },
      "GET /api/me": ME_FREE,
    });
    await page.goto("/transactions?q=กาแฟ");
    await expect(page.getByText("กาแฟ").first()).toBeVisible();
    await expect(page.getByRole("status", { name: "ยอดรวมของผลค้นหา" })).toHaveCount(0);
  });

  test("a category's emoji is shown in front of its name in the list", async ({ page }) => {
    await mockApi(page, {
      "GET /api/transactions": {
        items: [TX({ title: "ทรายแมว", categoryName: "ค่าอาหารแมว", categoryIcon: "🐱" })],
        hasMore: false,
      },
      "GET /api/me": ME_FREE,
    });
    await page.goto("/transactions");
    await expect(page.getByText("🐱 ค่าอาหารแมว")).toBeVisible();
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

  test("export sheet is locked for Free and points to the upgrade page", async ({ page }) => {
    const { seen } = await mockApi(page, { "GET /api/transactions": LIST, "GET /api/me": ME_FREE });
    await page.goto("/transactions");
    await page.getByRole("button", { name: "ส่งออกไฟล์" }).click();

    const dialog = page.getByRole("dialog", { name: "ส่งออกไฟล์" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("ส่งออก CSV / Excel สำหรับแผน Professional")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "ดูแผน Professional" })).toHaveAttribute(
      "href",
      "/upgrade",
    );
    await expect(page.getByRole("button", { name: "ดาวน์โหลด CSV" })).toHaveCount(0);
    expect(seen.some((s) => s.includes("/api/export"))).toBe(false);
  });

  test("export sheet explains the external download", async ({ page }) => {
    await mockApi(page, { "GET /api/transactions": LIST, "GET /api/me": ME_PLUS });
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

  test("editing sends only the changed fields", async ({ page }) => {
    const bodies: unknown[] = [];
    await mockApi(page, {
      "GET /api/transactions": LIST,
      "GET /api/categories": CATEGORIES,
      "GET /api/me": ME_FREE,
      "PATCH /api/transactions/11111111-1111-1111-1111-111111111111": (route: Route) => {
        bodies.push(route.request().postDataJSON());
        return { ok: true };
      },
    });
    await page.goto("/transactions");
    await page.getByRole("button", { name: "แก้ไข กาแฟ" }).click();

    const dialog = page.getByRole("dialog", { name: "แก้ไขรายการ" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("ชื่อรายการ")).toHaveValue("กาแฟ");
    await expect(dialog.getByLabel("จำนวนเงิน")).toHaveValue("30.00");
    await expectNoHorizontalScroll(page);

    await dialog.getByLabel("จำนวนเงิน").fill("45.50");
    await dialog.getByRole("button", { name: "บันทึก" }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({ amount: "45.50" });
    await expect(page.getByText("บันทึกแล้ว")).toBeVisible();
  });

  test("?edit=<id> (the chat's แก้ button) opens that entry's editor, and saving says it worked", async ({
    page,
  }) => {
    const id = "11111111-1111-1111-1111-111111111111";
    const bodies: unknown[] = [];
    await mockApi(page, {
      [`GET /api/transactions/${id}`]: TX(),
      "GET /api/categories": CATEGORIES,
      "GET /api/wallets": { items: [] },
      "GET /api/me": ME_FREE,
      [`PATCH /api/transactions/${id}`]: (route: Route) => {
        bodies.push(route.request().postDataJSON());
        return { ok: true };
      },
    });
    await page.goto(`/transactions?edit=${id}`);

    const dialog = page.getByRole("dialog", { name: "แก้ไขรายการ" });
    await expect(dialog.getByLabel("ชื่อรายการ")).toHaveValue("กาแฟ");
    await expectNoHorizontalScroll(page);
    await dialog.getByLabel("ชื่อรายการ").fill("กาแฟเย็น");
    await dialog.getByRole("button", { name: "บันทึก" }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({ title: "กาแฟเย็น" });
    await expect(page.getByText("✅ แก้ไขรายการสำเร็จ")).toBeVisible();
  });

  test("?edit= for an entry that is gone says so instead of hanging", async ({ page }) => {
    const id = "99999999-9999-9999-9999-999999999999";
    await mockApi(page, { "GET /api/me": ME_FREE });
    await page.route(`**/api/transactions/${id}`, (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "ไม่พบรายการนี้" }),
      }),
    );
    await page.goto(`/transactions?edit=${id}`);
    await expect(page.getByText("ไม่พบรายการนี้")).toBeVisible();
  });

  test("edit sheet validates before sending", async ({ page }) => {
    const { seen } = await mockApi(page, {
      "GET /api/transactions": LIST,
      "GET /api/categories": CATEGORIES,
      "GET /api/me": ME_FREE,
    });
    await page.goto("/transactions");
    await page.getByRole("button", { name: "แก้ไข กาแฟ" }).click();
    const dialog = page.getByRole("dialog", { name: "แก้ไขรายการ" });

    await dialog.getByLabel("จำนวนเงิน").fill("0");
    await dialog.getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "จำนวนเงินไม่ถูกต้อง" })).toBeVisible();
    expect(seen.some((s) => s.startsWith("PATCH"))).toBe(false);
  });

  test("select mode: choose two entries and delete them in one call", async ({ page }) => {
    const bodies: unknown[] = [];
    await mockApi(page, {
      "GET /api/transactions": LIST,
      "GET /api/me": ME_FREE,
      "POST /api/transactions/bulk": (route: Route) => {
        bodies.push(route.request().postDataJSON());
        return { updated: 2, skipped: 0 };
      },
    });
    page.once("dialog", (d) => void d.accept());
    await page.goto("/transactions");
    await page.getByRole("button", { name: "เลือก", exact: true }).click();

    const bar = page.getByRole("region", { name: "จัดการรายการที่เลือก" });
    await expect(bar.getByRole("button", { name: "ลบ" })).toBeDisabled();
    await page.getByRole("checkbox", { name: "เลือก กาแฟ" }).check();
    await page.getByRole("checkbox", { name: "เลือก น้ำมัน" }).check();
    await expect(bar.getByText("เลือกแล้ว 2 รายการ")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await bar.getByRole("button", { name: "ลบ" }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({
      action: "delete",
      ids: ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"],
    });
    await expect(page.getByText("ลบแล้ว 2 รายการ")).toBeVisible();
    await expect(page.getByRole("region", { name: "จัดการรายการที่เลือก" })).toHaveCount(0);
  });

  test("select mode: move the selection to another category", async ({ page }) => {
    const bodies: unknown[] = [];
    await mockApi(page, {
      "GET /api/transactions": LIST,
      "GET /api/categories": {
        items: [
          { id: "c1", type: "expense", name: "อาหาร" },
          { id: "c2", type: "income", name: "เงินเดือน" },
        ],
      },
      "GET /api/me": ME_FREE,
      "POST /api/transactions/bulk": (route: Route) => {
        bodies.push(route.request().postDataJSON());
        return { updated: 1, skipped: 1 };
      },
    });
    await page.goto("/transactions");
    await page.getByRole("button", { name: "เลือก", exact: true }).click();
    await page.getByRole("checkbox", { name: "เลือก กาแฟ" }).check();
    await page.getByRole("checkbox", { name: "เลือก น้ำมัน" }).check();
    await page.getByRole("button", { name: "ย้ายหมวด", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: /ย้ายหมวด 2 รายการ/ });
    await expect(dialog).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await dialog.getByLabel("หมวดปลายทาง").selectOption({ label: "อาหาร" });
    await dialog.getByRole("button", { name: "ย้ายหมวด" }).click();

    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({ action: "move", categoryId: "c1" });
    await expect(page.getByText("ย้ายหมวดแล้ว 1 รายการ (ข้าม 1)")).toBeVisible();
  });

  test("select mode has no serious accessibility violations", async ({ page }) => {
    await mockApi(page, { "GET /api/transactions": LIST, "GET /api/me": ME_FREE });
    await page.goto("/transactions");
    await page.getByRole("button", { name: "เลือก", exact: true }).click();
    await page.getByRole("checkbox", { name: "เลือก กาแฟ" }).check();
    await expectNoSeriousA11yViolations(page);
  });
});
