import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands";
import { cumulative, goalProgress, parseGoalText, resolveGoal } from "./goal";

// 2026-10-18 in Bangkok
const NOW = new Date("2026-10-18T05:00:00Z");

describe("parseGoalText", () => {
  it.each(["เป้าหมาย", "กระปุก", "เป้าหมายออม", "Goals"])("%s lists the goals", (t) => {
    expect(parseGoalText(t)).toEqual({ kind: "goals" });
  });

  it("a new goal with a name that has spaces, an amount with a unit, and a date", () => {
    expect(parseGoalText("เป้าหมาย ใหม่ เที่ยว ญี่ปุ่น 30000 ภายใน 31/3")).toMatchObject({
      kind: "goal-new",
      name: "เที่ยว ญี่ปุ่น",
      targetSatang: 3_000_000,
      due: { kind: "dmy", day: 31, month: 3, year: null },
    });
    expect(parseGoalText("กระปุก ใหม่ รถ 5 แสน")).toMatchObject({
      name: "รถ",
      targetSatang: 50_000_000,
      due: null,
    });
    expect(parseGoalText("เป้าหมาย ใหม่ ทอง 1,000 ภายใน 90 วัน")?.kind).toBe("goal-new");
  });

  it("put in and take out", () => {
    expect(parseGoalText("ออม เที่ยวญี่ปุ่น 2000")).toEqual({
      kind: "goal-deposit",
      name: "เที่ยวญี่ปุ่น",
      amountSatang: 200_000,
    });
    expect(parseGoalText("ถอน เที่ยวญี่ปุ่น 500.50")).toEqual({
      kind: "goal-withdraw",
      name: "เที่ยวญี่ปุ่น",
      amountSatang: 50_050,
    });
  });

  it.each([
    "เป้าหมาย ใหม่ เที่ยว", // no amount
    "เป้าหมาย ใหม่ 5000", // no name
    "ออม 500", // no name
    "ถอน 500",
    "ออมสิน 500", // not "ออม <ชื่อ>"
    "ถอนเงิน 500",
    "ออม เที่ยว",
    "กาแฟ 50",
  ])("%s is not a goal command", (t) => {
    expect(parseGoalText(t)).toBeNull();
  });

  it("works through parseCommand with Thai digits", () => {
    expect(parseCommand("ออม เที่ยวญี่ปุ่น ๒๐๐๐")).toMatchObject({
      kind: "goal-deposit",
      amountSatang: 200_000,
    });
  });
});

describe("goalProgress", () => {
  const goal = (savedSatang: number, dueOn: string | null = null) => ({
    targetSatang: 3_000_000,
    savedSatang,
    dueOn,
  });

  it("percent, what is left and whether it is done", () => {
    expect(goalProgress(goal(1_200_000), NOW)).toMatchObject({
      percent: 40,
      remainingSatang: 1_800_000,
      done: false,
    });
    expect(goalProgress(goal(3_000_000), NOW)).toMatchObject({
      percent: 100,
      remainingSatang: 0,
      done: true,
    });
    expect(goalProgress(goal(3_300_000), NOW)).toMatchObject({
      percent: 110,
      remainingSatang: 0,
      done: true,
    });
    expect(goalProgress(goal(0), NOW)).toMatchObject({ percent: 0, done: false });
  });

  it("what a month must bring to make the date", () => {
    // ฿18,000 left, 90 days to go = 3 months
    const p = goalProgress(goal(1_200_000, "2027-01-16"), NOW);
    expect(p.monthlyNeededSatang).toBe(600_000);
    expect(p.overdue).toBe(false);
  });

  it("the last days still need the whole rest this month", () => {
    expect(goalProgress(goal(1_200_000, "2026-10-20"), NOW).monthlyNeededSatang).toBe(1_800_000);
  });

  it("a date that has passed is overdue; no date or done has no monthly figure", () => {
    expect(goalProgress(goal(1_200_000, "2026-10-01"), NOW)).toMatchObject({
      overdue: true,
      monthlyNeededSatang: null,
    });
    expect(goalProgress(goal(1_200_000), NOW).monthlyNeededSatang).toBeNull();
    expect(goalProgress(goal(3_000_000, "2027-01-16"), NOW).monthlyNeededSatang).toBeNull();
  });
});

describe("resolveGoal", () => {
  const goals = [{ name: "เที่ยวญี่ปุ่น" }, { name: "เที่ยวเกาหลี" }, { name: "Car" }];

  it("exact name, ignoring case; or a unique start", () => {
    expect(resolveGoal("car", goals)).toMatchObject({ ok: true, goal: { name: "Car" } });
    expect(resolveGoal("เที่ยวญี่", goals)).toMatchObject({
      ok: true,
      goal: { name: "เที่ยวญี่ปุ่น" },
    });
  });

  it("never guesses between several, and says when there is none", () => {
    expect(resolveGoal("เที่ยว", goals)).toEqual({ ok: false, reason: "ambiguous" });
    expect(resolveGoal("บ้าน", goals)).toEqual({ ok: false, reason: "none" });
    expect(resolveGoal("  ", goals)).toEqual({ ok: false, reason: "none" });
  });
});

describe("cumulative", () => {
  it("running total, oldest first, withdrawals taken off", () => {
    expect(
      cumulative([
        { amountSatang: -10_000, occurredAt: "2026-10-03T05:00:00Z" },
        { amountSatang: 50_000, occurredAt: "2026-10-01T05:00:00Z" },
        { amountSatang: 20_000, occurredAt: "2026-10-02T05:00:00Z" },
      ]).map((p) => p.totalSatang),
    ).toEqual([50_000, 70_000, 60_000]);
  });
});
