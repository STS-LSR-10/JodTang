import { describe, expect, it } from "vitest";
import {
  addDays,
  billReminderText,
  cardBills,
  dueReminders,
  dueState,
  firstDue,
  nextDueAfter,
  parseBillText,
  resolveBill,
  todayKey,
  type BillDto,
} from "./bill";
import { parseCommand } from "./commands";
import type { Wallet } from "./wallet";

// 2026-10-18 09:30 in Bangkok
const NOW = new Date("2026-10-18T02:30:00Z");

describe("dates", () => {
  it("todayKey is the Bangkok day, and addDays crosses months and years", () => {
    expect(todayKey(new Date("2026-10-17T20:00:00Z"))).toBe("2026-10-18");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("firstDue: this month if the day is still ahead (today included), else next", () => {
    expect(firstDue("monthly", 25, null, "2026-10-18")).toBe("2026-10-25");
    expect(firstDue("monthly", 18, null, "2026-10-18")).toBe("2026-10-18");
    expect(firstDue("monthly", 10, null, "2026-10-18")).toBe("2026-11-10");
    expect(firstDue("monthly", 10, null, "2026-12-18")).toBe("2027-01-10");
  });

  it("the 31st is the last day of a short month", () => {
    expect(firstDue("monthly", 31, null, "2026-11-01")).toBe("2026-11-30");
    expect(firstDue("monthly", 31, null, "2027-02-01")).toBe("2027-02-28");
    expect(firstDue("monthly", 30, null, "2028-02-01")).toBe("2028-02-29");
  });

  it("yearly: this year if still ahead, else next year", () => {
    expect(firstDue("yearly", 1, 3, "2026-10-18")).toBe("2027-03-01");
    expect(firstDue("yearly", 25, 12, "2026-10-18")).toBe("2026-12-25");
    expect(firstDue("yearly", 29, 2, "2027-01-01")).toBe("2027-02-28");
  });

  it("nextDueAfter moves on one period, never into the past, and ends a one-off bill", () => {
    const monthly = { cadence: "monthly" as const, dayOfMonth: 15, monthOfYear: null };
    expect(nextDueAfter(monthly, "2026-10-15", "2026-10-15")).toBe("2026-11-15");
    // paid very late: still the next one that has not passed
    expect(nextDueAfter(monthly, "2026-07-15", "2026-10-18")).toBe("2026-11-15");
    expect(
      nextDueAfter(
        { cadence: "yearly", dayOfMonth: 1, monthOfYear: 3 },
        "2027-03-01",
        "2027-03-01",
      ),
    ).toBe("2028-03-01");
    expect(
      nextDueAfter({ cadence: "once", dayOfMonth: 1, monthOfYear: 3 }, "2027-03-01", "2027-03-01"),
    ).toBeNull();
  });
});

const bill = (over: Partial<BillDto> = {}): BillDto => ({
  id: "b1",
  name: "ค่าไฟ",
  amountSatang: 125_000,
  cadence: "monthly",
  dayOfMonth: 19,
  monthOfYear: null,
  nextDueOn: "2026-10-19",
  remindDays: [1],
  remindHour: 9,
  snoozedOn: null,
  note: null,
  isActive: true,
  ...over,
});

describe("dueReminders", () => {
  const none = new Set<string>();

  it("one day before at the chosen hour", () => {
    const r = dueReminders([bill()], NOW, none);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: "b1:2026-10-19:1", kind: "before", daysBefore: 1 });
  });

  it("not before the hour; an hour the job missed is made up later the same day", () => {
    expect(dueReminders([bill({ remindHour: 20 })], NOW, none)).toEqual([]);
    expect(dueReminders([bill({ remindHour: 7 })], NOW, none)).toHaveLength(1);
  });

  it("not on the wrong day", () => {
    expect(dueReminders([bill({ nextDueOn: "2026-10-25" })], NOW, none)).toEqual([]);
  });

  it("several days before: only the one that is today", () => {
    const b = bill({ nextDueOn: "2026-10-21", remindDays: [3, 1, 0] });
    expect(dueReminders([b], NOW, none).map((r) => r.daysBefore)).toEqual([3]);
  });

  it("the day itself is a 'due' reminder", () => {
    const b = bill({ nextDueOn: "2026-10-18", remindDays: [0] });
    expect(dueReminders([b], NOW, none)[0]).toMatchObject({ kind: "due" });
  });

  it("already sent: nothing", () => {
    expect(dueReminders([bill()], NOW, new Set(["b1:2026-10-19:1"]))).toEqual([]);
  });

  it("the day after an unpaid due date: one 'overdue' nudge", () => {
    const b = bill({ nextDueOn: "2026-10-17", remindDays: [1] });
    expect(dueReminders([b], NOW, none)).toEqual([
      expect.objectContaining({ key: "b1:2026-10-17:overdue", kind: "overdue" }),
    ]);
    expect(dueReminders([bill({ nextDueOn: "2026-10-16" })], NOW, none)).toEqual([]);
  });

  it("a snooze brings one more reminder on its day", () => {
    const b = bill({ nextDueOn: "2026-10-20", remindDays: [1], snoozedOn: "2026-10-18" });
    expect(dueReminders([b], NOW, none).map((r) => r.kind)).toEqual(["snooze"]);
    expect(dueReminders([b], NOW, new Set(["b1:snooze:2026-10-18"]))).toEqual([]);
  });

  it("a switched-off bill reminds nothing", () => {
    expect(dueReminders([bill({ isActive: false })], NOW, none)).toEqual([]);
  });
});

describe("billReminderText", () => {
  const r = (
    kind: "before" | "due" | "overdue" | "snooze",
    daysBefore: number,
    over: Partial<BillDto> = {},
  ) => billReminderText({ key: "k", bill: bill(over), kind, daysBefore });

  it("says when and how much", () => {
    expect(r("before", 1)).toBe("พรุ่งนี้ครบกำหนดจ่ายค่าไฟ ประมาณ ฿1,250 (19/10/2569)");
    expect(r("before", 3)).toContain("อีก 3 วันครบกำหนดจ่ายค่าไฟ");
    expect(r("due", 0)).toContain("วันนี้ครบกำหนดจ่ายค่าไฟ");
    expect(r("overdue", -1)).toContain("เลยกำหนดจ่ายค่าไฟมาแล้ว");
    expect(r("snooze", 0)).toContain("เตือนอีกครั้ง");
  });

  it("leaves the amount out when there is none", () => {
    expect(r("before", 1, { amountSatang: null })).toBe("พรุ่งนี้ครบกำหนดจ่ายค่าไฟ (19/10/2569)");
  });
});

describe("cardBills", () => {
  const card = (over: Partial<Wallet> = {}): Wallet => ({
    id: "c1",
    name: "KBank",
    kind: "card",
    isDefault: false,
    openingSatang: 0,
    incomeSatang: 0,
    expenseSatang: 450_000,
    transferInSatang: 0,
    transferOutSatang: 0,
    debtInSatang: 0,
    debtOutSatang: 0,
    entryCount: 0,
    creditLimitSatang: null,
    statementDay: null,
    dueDay: 25,
    ...over,
  });

  it("a card with a due day becomes a read-only monthly bill for what is owed", () => {
    const [b] = cardBills([card()], "2026-10-18");
    expect(b).toMatchObject({
      id: "card:c1",
      name: "บัตร KBank",
      amountSatang: 450_000,
      nextDueOn: "2026-10-25",
      remindDays: [3, 1],
      fromCard: true,
    });
  });

  it("nothing for a card without a due day, a wallet that is not a card, or nothing owed → no amount", () => {
    expect(cardBills([card({ dueDay: null }), card({ kind: "bank" })], "2026-10-18")).toEqual([]);
    expect(cardBills([card({ expenseSatang: 0 })], "2026-10-18")[0]?.amountSatang).toBeNull();
  });
});

describe("parseBillText", () => {
  it("lists", () => {
    for (const t of ["บิล", "เตือนบิล", "Bills"])
      expect(parseBillText(t)).toEqual({ kind: "bills" });
  });

  it("a monthly bill with the defaults", () => {
    expect(parseBillText("บิล ใหม่ ค่าไฟ 1250 ทุกวันที่ 15")).toEqual({
      kind: "bill-new",
      name: "ค่าไฟ",
      amountSatang: 125_000,
      cadence: "monthly",
      dayOfMonth: 15,
      monthOfYear: null,
      remindDays: [1],
      remindHour: 9,
    });
  });

  it("reminder days, an hour, and a name with spaces", () => {
    expect(
      parseBillText("บิล ใหม่ บัตร KBank 5,000.50 ทุกวันที่ 25 เตือนก่อน 3,1 วัน เวลา 20:00"),
    ).toMatchObject({
      name: "บัตร KBank",
      amountSatang: 500_050,
      remindDays: [3, 1],
      remindHour: 20,
    });
  });

  it("yearly, one-off, and no amount", () => {
    expect(parseBillText("บิล ใหม่ ประกันรถ 12000 ทุกปี 1/3")).toMatchObject({
      cadence: "yearly",
      dayOfMonth: 1,
      monthOfYear: 3,
    });
    expect(parseBillText("บิล ใหม่ ค่าส่วนกลาง วันที่ 25/12")).toMatchObject({
      name: "ค่าส่วนกลาง",
      amountSatang: null,
      cadence: "once",
      dayOfMonth: 25,
      monthOfYear: 12,
    });
  });

  it("pays a bill", () => {
    expect(parseBillText("จ่ายบิล ค่าไฟ")).toEqual({ kind: "bill-pay", name: "ค่าไฟ" });
  });

  it.each([
    "บิล ใหม่",
    "บิล ใหม่ ค่าไฟ 1250", // no schedule
    "บิล ใหม่ ค่าไฟ ทุกวันที่ 40",
    "บิล ใหม่ ค่าไฟ ทุกวันที่ 15 เวลา 25:00",
    "บิล ใหม่ ค่าไฟ ทุกวันที่ 15 เตือนก่อน 99 วัน",
    "บิล ใหม่ ทุกวันที่ 15", // no name
  ])("%s shows the usage", (t) => {
    expect(parseBillText(t)).toEqual({ kind: "bill-new-usage" });
  });

  it.each(["บิล 500", "บิลค่าไฟ 500", "กาแฟ 50", "จ่ายบิล"])("%s is an ordinary message", (t) => {
    expect(parseBillText(t)).toBeNull();
  });

  it("works through parseCommand with Thai digits", () => {
    expect(parseCommand("บิล ใหม่ ค่าไฟ ๑๒๕๐ ทุกวันที่ ๑๕")).toMatchObject({
      kind: "bill-new",
      amountSatang: 125_000,
      dayOfMonth: 15,
    });
  });
});

describe("resolveBill and dueState", () => {
  const bills = [{ name: "ค่าไฟ" }, { name: "ค่าน้ำ" }, { name: "Netflix" }];

  it("resolves by exact name or a unique start; never guesses", () => {
    expect(resolveBill("netflix", bills)).toMatchObject({ ok: true });
    expect(resolveBill("ค่าไ", bills)).toMatchObject({ ok: true, bill: { name: "ค่าไฟ" } });
    expect(resolveBill("ค่า", bills)).toEqual({ ok: false, reason: "ambiguous" });
    expect(resolveBill("เน็ต", bills)).toEqual({ ok: false, reason: "none" });
  });

  it("late, soon (within 3 days, today included), later", () => {
    expect(dueState("2026-10-17", "2026-10-18")).toBe("overdue");
    expect(dueState("2026-10-18", "2026-10-18")).toBe("soon");
    expect(dueState("2026-10-21", "2026-10-18")).toBe("soon");
    expect(dueState("2026-10-22", "2026-10-18")).toBe("later");
  });
});
