import { expect, test, type Route } from "@playwright/test";
import { expectNoHorizontalScroll, expectNoSeriousA11yViolations, mockApi } from "./helpers";

const PEOPLE = [
  { lineUserId: "Uanna", name: "แอน", isPayer: true },
  { lineUserId: "Uchom", name: "ชมพู", isPayer: false },
  { lineUserId: "Ubob", name: "บ๊อบ", isPayer: false },
  { lineUserId: "Udan", name: "แดน ชื่อยาวมากมากมากมากมากมากมากมากมาก", isPayer: false },
];
const SETUP = {
  bill: { id: "b1", title: "หมูกระทะ", amountSatang: 120_000, status: "setup" },
  people: PEOPLE,
  complete: false,
  open: true,
  maxPeople: 30,
};

test.describe("split-bill people picker (360px)", () => {
  test("the payer is ticked and locked, the others are chosen one by one with the share shown", async ({
    page,
  }) => {
    await mockApi(page, { "GET /api/split-bill/b1": SETUP });
    await page.goto("/split-bill/b1");

    await expect(page.getByRole("heading", { name: "หมูกระทะ" })).toBeVisible();
    await expect(page.getByText("฿1,200").first()).toBeVisible();
    const payer = page.getByRole("checkbox", { name: /แอน/ });
    await expect(payer).toBeChecked();
    await expect(payer).toBeDisabled();
    await expect(page.getByText("คนจ่าย", { exact: true })).toBeVisible();

    const confirm = page.getByRole("button", { name: /ยืนยัน/ });
    await expect(confirm).toBeDisabled(); // nobody to share with yet
    await page.getByRole("checkbox", { name: /ชมพู/ }).check();
    await expect(page.getByText(/คนละ ≈/)).toContainText("฿600");
    await expect(confirm).toBeEnabled();
    await page.getByRole("checkbox", { name: /บ๊อบ/ }).check();
    await expect(page.getByText(/คนละ ≈/)).toContainText("฿400");
    await page.getByRole("checkbox", { name: /บ๊อบ/ }).uncheck();
    await expect(page.getByText(/คนละ ≈/)).toContainText("฿600");
    await expectNoHorizontalScroll(page);
    await expectNoSeriousA11yViolations(page);
  });

  test("'เลือกทั้งหมด' and 'ล้างที่เลือก'", async ({ page }) => {
    await mockApi(page, { "GET /api/split-bill/b1": SETUP });
    await page.goto("/split-bill/b1");
    await page.getByRole("button", { name: "เลือกทั้งหมด" }).click();
    for (const name of [/ชมพู/, /บ๊อบ/, /แดน/])
      await expect(page.getByRole("checkbox", { name })).toBeChecked();
    await expect(page.getByText(/เลือก\s*4\s*คน/)).toBeVisible();
    await page.getByRole("button", { name: "ล้างที่เลือก" }).click();
    await expect(page.getByRole("checkbox", { name: /ชมพู/ })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: /แอน/ })).toBeChecked(); // the payer stays
  });

  test("confirming sends the chosen people (payer included) and says what to do next", async ({
    page,
  }) => {
    let body: unknown = null;
    await mockApi(page, {
      "GET /api/split-bill/b1": SETUP,
      "POST /api/split-bill/b1": async (route: Route) => {
        body = route.request().postDataJSON();
        return { ok: true, count: 3, message: "✅ เลือกคนหารบิล หมูกระทะ แล้ว #b1000000" };
      },
    });
    await page.goto("/split-bill/b1");
    await page.getByRole("checkbox", { name: /ชมพู/ }).check();
    await page.getByRole("checkbox", { name: /บ๊อบ/ }).check();
    await page.getByRole("button", { name: /ยืนยัน/ }).click();

    await expect(page.getByRole("heading", { name: /เลือกเสร็จแล้ว หาร 3 คน/ })).toBeVisible();
    expect((body as { people: string[] }).people.sort()).toEqual(["Uanna", "Ubob", "Uchom"]);
    // outside LINE the page cannot write in the chat, so it points to the button on the card
    await expect(page.getByText("ส่ง QR เข้ากลุ่ม")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("a failed save shows why and keeps the choices", async ({ page }) => {
    await mockApi(page, {
      "GET /api/split-bill/b1": SETUP,
      "POST /api/split-bill/b1": { status: 409, body: { error: "บิลนี้เลือกคนหารไปแล้ว" } },
    });
    await page.goto("/split-bill/b1");
    await page.getByRole("checkbox", { name: /ชมพู/ }).check();
    await page.getByRole("button", { name: /ยืนยัน/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "เลือกคนหารไปแล้ว" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /ชมพู/ })).toBeChecked();
  });

  test("when the bot knows nobody else it says what to do, and when LINE could not list everyone it warns", async ({
    page,
  }) => {
    await mockApi(page, {
      "GET /api/split-bill/b1": { ...SETUP, people: [PEOPLE[0]] },
    });
    await page.goto("/split-bill/b1");
    await expect(page.getByText(/ยังไม่รู้จักเพื่อนในกลุ่มนี้/)).toBeVisible();
    await expect(page.getByRole("button", { name: /ยืนยัน/ })).toBeDisabled();
  });

  test("shows the 'only people the bot has seen' note unless LINE listed the whole group", async ({
    page,
  }) => {
    await mockApi(page, { "GET /api/split-bill/b1": SETUP });
    await page.goto("/split-bill/b1");
    await expect(page.getByText(/เฉพาะคนที่บอทเคยเห็นในกลุ่ม/)).toBeVisible();
  });

  test("a bill that was already chosen, and a person who is not the payer", async ({ page }) => {
    await mockApi(page, {
      "GET /api/split-bill/b1": {
        ...SETUP,
        open: false,
        bill: { ...SETUP.bill, status: "collecting" },
      },
    });
    await page.goto("/split-bill/b1");
    await expect(page.getByText("เลือกคนหารไปแล้ว")).toBeVisible();

    await mockApi(page, {
      "GET /api/split-bill/b1": {
        status: 403,
        body: { error: "เฉพาะคนที่จ่ายบิลนี้เลือกคนหารได้นะ" },
      },
    });
    await page.goto("/split-bill/b1");
    await expect(page.getByText("เฉพาะคนที่จ่ายบิลนี้เลือกคนหารได้นะ")).toBeVisible();
  });
});
