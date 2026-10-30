import { describe, expect, it } from "vitest";
import { badge, bar, barColor, BAR_COLORS, cardHeader, pillFooter } from "./card-style";

const json = (x: unknown) => JSON.stringify(x);

describe("cardHeader", () => {
  it("has the title, each line under it and the emoji on the right", () => {
    const out = json(cardHeader("สรุปเดือนนี้", ["1 ต.ค. – 31 ต.ค.", "เทียบ ก.ย."], "📅"));
    expect(out).toContain('"text":"สรุปเดือนนี้"');
    expect(out).toContain("1 ต.ค. – 31 ต.ค.");
    expect(out).toContain("เทียบ ก.ย.");
    expect(out).toContain('"text":"📅"');
  });
});

describe("pillFooter", () => {
  it("is left out without an https link", () => {
    expect(pillFooter("ดูกราฟในแอป 📈", undefined)).toBeUndefined();
    expect(pillFooter("ดูกราฟในแอป 📈", "http://localhost/x")).toBeUndefined();
  });

  it("shows the label with its emoji but keeps the button label plain and within LINE's 20 characters", () => {
    const out = json(pillFooter("ดูกราฟในแอป 📈", "https://liff.line.me/1/analytics"));
    expect(out).toContain('"text":"ดูกราฟในแอป 📈"');
    expect(out).toContain('"label":"ดูกราฟในแอป"');
    expect(out).toContain('"uri":"https://liff.line.me/1/analytics"');
    const long = json(
      pillFooter("ดูรายละเอียดทั้งหมดในแอปพลิเคชันได้ที่นี่เลย ➡️", "https://x.test"),
    );
    const label = /"label":"([^"]*)"/.exec(long)?.[1] ?? "";
    expect(label.length).toBeLessThanOrEqual(20);
  });
});

describe("bar", () => {
  it("is as wide as the share, with a sliver for a tiny one and never past the track", () => {
    expect(json(bar(75, "#fff"))).toContain('"width":"75%"');
    expect(json(bar(0, "#fff"))).toContain('"width":"3%"');
    expect(json(bar(180, "#fff"))).toContain('"width":"100%"');
  });
});

describe("barColor", () => {
  it("hands out the palette in turn", () => {
    expect(barColor(0)).toBe(BAR_COLORS[0]);
    expect(barColor(BAR_COLORS.length)).toBe(BAR_COLORS[0]);
    expect(barColor(1)).not.toBe(barColor(0));
  });
});

describe("badge", () => {
  it("is a tinted tag", () => {
    const out = json(badge("ใหม่", "#E11D48", "#FDE4E8"));
    expect(out).toContain('"text":"ใหม่"');
    expect(out).toContain('"backgroundColor":"#FDE4E8"');
  });
});
