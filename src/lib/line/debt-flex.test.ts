import { describe, expect, it } from "vitest";
import { buildDebtDone, buildDebtsCard } from "./debt-flex";

const NOW = new Date("2026-10-18T05:00:00Z");

describe("buildDebtsCard", () => {
  const json = JSON.stringify(
    buildDebtsCard({
      now: NOW,
      manageUrl: "https://app.test/debts",
      people: [
        {
          person: "แม่",
          direction: "borrowed",
          remainingSatang: 200000,
          dueAt: "2026-10-17T05:00:00Z",
        },
        {
          person: "สมชาย",
          direction: "lent",
          remainingSatang: 50000,
          dueAt: "2026-10-30T05:00:00Z",
        },
        { person: "ป้อม", direction: "lent", remainingSatang: 10000, dueAt: null },
      ],
    }),
  );

  it("splits who owes me from whom I owe, with totals", () => {
    expect(json).toContain("คนที่ติดเรา");
    expect(json).toContain("เราติดใคร");
    expect(json).toContain("฿600"); // 500 + 100 lent
    expect(json).toContain("฿2,000");
  });

  it("marks an overdue date and shows a later one", () => {
    expect(json).toContain("เลยกำหนด");
    expect(json).toContain("ครบ ");
  });

  it("has the link to the page", () => {
    expect(json).toContain("https://app.test/debts");
  });

  it("with only one direction there is only that section", () => {
    const only = JSON.stringify(
      buildDebtsCard({
        now: NOW,
        people: [{ person: "แม่", direction: "borrowed", remainingSatang: 100, dueAt: null }],
      }),
    );
    expect(only).not.toContain("คนที่ติดเรา");
    expect(only).toContain("เราติดใคร");
  });
});

describe("buildDebtDone", () => {
  it("carries a Quick Reply that undoes it", () => {
    const msg = buildDebtDone({ text: "จดแล้ว", undoData: "a=dx&id=d1" }) as unknown as {
      quickReply: { items: { action: { data: string } }[] };
    };
    expect(msg.quickReply.items[0]?.action.data).toBe("a=dx&id=d1");
  });
});
