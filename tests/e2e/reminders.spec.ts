import { expect, test, type Route } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
} from "./helpers";

const item = (n: number, body: string, repeat: string | null = null) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  body,
  remindAt: new Date(Date.now() + n * 86_400_000).toISOString(),
  repeat,
});
const LIST = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  items,
  limit: 3,
  canAdd: true,
  ...extra,
});

test.describe("reminders page (360px)", () => {
  test("lists what is waiting, with the repeat, and has no overflow or accessibility problems", async ({
    page,
  }) => {
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/reminders": LIST([item(1, "จ่ายค่าไฟ"), item(2, "กินยา", "daily")]),
    });
    await page.goto("/reminders");
    await expect(page.getByRole("heading", { name: "เตือน" })).toBeVisible();
    await expect(page.getByText("จ่ายค่าไฟ")).toBeVisible();
    await expect(page.getByText(/· ทุกวัน/)).toBeVisible();
    await expect(page.getByText("ตั้งไว้ 2/3 เตือน")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousA11yViolations(page);
  });

  test("shows an empty state and an error state with a retry", async ({ page }) => {
    await mockApi(page, { "GET /api/me": ME_FREE, "GET /api/reminders": LIST([]) });
    await page.goto("/reminders");
    await expect(page.getByText("ยังไม่มีเตือนที่รออยู่")).toBeVisible();

    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/reminders": { status: 500, body: { error: "ขออภัย ระบบสะดุดชั่วคราว" } },
    });
    await page.goto("/reminders");
    await expect(page.getByRole("button", { name: "ลองอีกครั้ง" })).toBeVisible();
  });

  test("sets a reminder (text, time, repeat) and shows it", async ({ page }) => {
    let items = [item(1, "ของเก่า")];
    const posted: Record<string, unknown>[] = [];
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/reminders": () => LIST(items),
      "POST /api/reminders": async (route: Route) => {
        const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
        posted.push(body);
        items = [...items, item(2, String(body.body), (body.repeat as string) ?? null)];
        return { reminder: items.at(-1) };
      },
    });
    await page.goto("/reminders");
    await page.getByLabel("เตือนเรื่อง").fill("กินยา");
    await page.getByLabel("ความถี่").selectOption("daily");
    await page.getByRole("button", { name: "ตั้งเตือน" }).click();
    await expect(page.getByText("ตั้งเตือนแล้ว")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "เตือนที่รออยู่" }).getByText("กินยา"),
    ).toBeVisible();
    expect(posted[0]).toMatchObject({ body: "กินยา", repeat: "daily" });
    expect(String(posted[0]?.remindAt)).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  test("a full list blocks adding and says so", async ({ page }) => {
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/reminders": LIST([item(1, "a"), item(2, "b"), item(3, "c")], { canAdd: false }),
    });
    await page.goto("/reminders");
    await expect(page.getByText("เตือนเต็มแล้ว")).toBeVisible();
    await page.getByLabel("เตือนเรื่อง").fill("อีกอัน");
    await expect(page.getByRole("button", { name: "ตั้งเตือน" })).toBeDisabled();
  });

  test("cancels a reminder after asking", async ({ page }) => {
    const deleted: string[] = [];
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/reminders": LIST([item(1, "จ่ายค่าไฟ")]),
      "DELETE /api/reminders/00000000-0000-4000-8000-000000000001": () => {
        deleted.push("1");
        return { ok: true };
      },
    });
    await page.goto("/reminders");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "ยกเลิกเตือน จ่ายค่าไฟ" }).click();
    await expect.poll(() => deleted.length).toBe(1);
  });
});
