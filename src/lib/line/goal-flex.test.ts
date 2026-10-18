import { describe, expect, it } from "vitest";
import { goalProgress, type GoalDto } from "@/lib/goal";
import { buildGoalReachedCard, buildGoalsCard } from "./goal-flex";

const NOW = new Date("2026-10-18T05:00:00Z");
const goal = (over: Partial<GoalDto> & { savedSatang: number }): GoalDto => {
  const base = { targetSatang: 3_000_000, dueOn: null as string | null, ...over };
  return {
    id: "g1",
    name: "เที่ยวญี่ปุ่น",
    emoji: "🇯🇵",
    archived: false,
    ...base,
    ...goalProgress(base, NOW),
  } as GoalDto;
};

describe("buildGoalsCard", () => {
  it("shows the name, percent, saved of target and what is left", () => {
    const json = JSON.stringify(buildGoalsCard({ goals: [goal({ savedSatang: 1_200_000 })] }));
    expect(json).toContain("🇯🇵 เที่ยวญี่ปุ่น");
    expect(json).toContain("40%");
    expect(json).toContain("฿12,000 จาก ฿30,000");
    expect(json).toContain("เหลือ ฿18,000");
  });

  it("with a date: the monthly amount; late: says so; done: celebrates", () => {
    const withDate = JSON.stringify(
      buildGoalsCard({ goals: [goal({ savedSatang: 1_200_000, dueOn: "2027-01-16" })] }),
    );
    expect(withDate).toContain("เก็บเดือนละ ฿6,000");
    const late = JSON.stringify(
      buildGoalsCard({ goals: [goal({ savedSatang: 1_200_000, dueOn: "2026-10-01" })] }),
    );
    expect(late).toContain("เลยกำหนด");
    const done = JSON.stringify(buildGoalsCard({ goals: [goal({ savedSatang: 3_000_000 })] }));
    expect(done).toContain("ครบแล้ว");
  });

  it("only the manage link when it is https", () => {
    const g = [goal({ savedSatang: 0 })];
    expect(JSON.stringify(buildGoalsCard({ goals: g, manageUrl: "http://x" }))).not.toContain(
      "ดูกราฟและจัดการ",
    );
    expect(
      JSON.stringify(buildGoalsCard({ goals: g, manageUrl: "https://x.test/goals" })),
    ).toContain("ดูกราฟและจัดการ");
  });

  it("lists at most eight and says how many more", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      goal({ savedSatang: 0, name: `g${i}` } as never),
    );
    expect(JSON.stringify(buildGoalsCard({ goals: many }))).toContain("และอีก 2 เป้าหมาย");
  });
});

describe("buildGoalReachedCard", () => {
  it("congratulates with the goal and the amount", () => {
    const json = JSON.stringify(buildGoalReachedCard(goal({ savedSatang: 3_000_000 })));
    expect(json).toContain("ถึงเป้าแล้ว");
    expect(json).toContain("฿30,000");
  });
});
