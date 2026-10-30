import { expect, test, type Route } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  expectNoSeriousA11yViolations,
  mockApi,
  ME_FREE,
} from "./helpers";

const note = (n: number, body: string) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  body,
  createdAt: `2026-10-0${n}T05:00:00.000Z`,
  updatedAt: `2026-10-0${n}T05:00:00.000Z`,
});

const PAGE = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  items,
  hasMore: false,
  count: items.length,
  limit: 30,
  canAdd: true,
  ...extra,
});

test.describe("notes page (360px)", () => {
  test("lists notes, shows the usage, and has no accessibility or overflow problems", async ({
    page,
  }) => {
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/notes": PAGE([note(2, "รหัสไวไฟ 1234"), note(1, "ซื้อนม\nไข่")]),
    });
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "โน้ต" })).toBeVisible();
    await expect(page.getByText("รหัสไวไฟ 1234")).toBeVisible();
    await expect(page.getByText("ใช้ไป 2/30 โน้ต")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousA11yViolations(page);
  });

  test("shows a friendly empty state", async ({ page }) => {
    await mockApi(page, { "GET /api/me": ME_FREE, "GET /api/notes": PAGE([]) });
    await page.goto("/notes");
    await expect(page.getByText("ยังไม่มีโน้ต")).toBeVisible();
  });

  test("shows the error with a retry when loading fails", async ({ page }) => {
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/notes": { status: 500, body: { error: "ขออภัย ระบบสะดุดชั่วคราว" } },
    });
    await page.goto("/notes");
    await expect(page.getByRole("button", { name: "ลองอีกครั้ง" })).toBeVisible();
  });

  test("adds a note and shows it", async ({ page }) => {
    let items = [note(1, "ของเก่า")];
    const posted: unknown[] = [];
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/notes": () => PAGE(items),
      "POST /api/notes": async (route: Route) => {
        posted.push(JSON.parse(route.request().postData() ?? "{}"));
        items = [note(2, "ของใหม่"), ...items];
        return { note: items[0] };
      },
    });
    await page.goto("/notes");
    await page.getByLabel("โน้ตใหม่").fill("ของใหม่");
    await page.getByRole("button", { name: "จดโน้ต" }).click();
    await expect(page.getByText("จดโน้ตแล้ว")).toBeVisible();
    await expect(page.getByRole("list", { name: "โน้ต" }).getByText("ของใหม่")).toBeVisible();
    expect(posted).toEqual([{ body: "ของใหม่" }]);
  });

  test("a full notebook blocks adding and says so", async ({ page }) => {
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/notes": PAGE([note(1, "x")], { count: 30, canAdd: false }),
    });
    await page.goto("/notes");
    await expect(page.getByText("โน้ตเต็มแล้ว")).toBeVisible();
    await page.getByLabel("โน้ตใหม่").fill("อีกอัน");
    await expect(page.getByRole("button", { name: "จดโน้ต" })).toBeDisabled();
  });

  test("searches (and the link from the chat opens with the word already typed)", async ({
    page,
  }) => {
    const asked: string[] = [];
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/notes": (_route: Route, url: URL) => {
        asked.push(url.search);
        return url.searchParams.get("q")
          ? PAGE([note(2, "รหัสไวไฟ 1234")])
          : PAGE([note(2, "รหัสไวไฟ 1234"), note(1, "ซื้อนม")]);
      },
    });
    await page.goto("/notes?q=ไวไฟ");
    await expect(page.getByText("ค้นหา “ไวไฟ”")).toBeVisible();
    await expect(page.getByText("ซื้อนม")).toHaveCount(0);
    expect(asked[0]).toContain("q=");

    await page.getByRole("button", { name: "ล้างการค้นหา" }).click();
    await expect(page.getByText("ซื้อนม")).toBeVisible();
  });

  test("edits and deletes a note", async ({ page }) => {
    const patched: unknown[] = [];
    const deleted: string[] = [];
    await mockApi(page, {
      "GET /api/me": ME_FREE,
      "GET /api/notes": PAGE([note(1, "ของเก่า")]),
      "PATCH /api/notes/00000000-0000-4000-8000-000000000001": async (route: Route) => {
        patched.push(JSON.parse(route.request().postData() ?? "{}"));
        return { ok: true };
      },
      "DELETE /api/notes/00000000-0000-4000-8000-000000000001": () => {
        deleted.push("1");
        return { ok: true };
      },
    });
    await page.goto("/notes");
    await page.getByRole("button", { name: "แก้ไขโน้ต" }).click();
    const dialog = page.getByRole("dialog", { name: "แก้ไขโน้ต" });
    await dialog.getByLabel("เนื้อหาโน้ต").fill("ของแก้แล้ว");
    await dialog.getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByText("แก้ไขแล้ว")).toBeVisible();
    expect(patched).toEqual([{ body: "ของแก้แล้ว" }]);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "ลบโน้ต" }).click();
    await expect.poll(() => deleted.length).toBe(1);
  });
});
