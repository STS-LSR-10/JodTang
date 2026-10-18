import { describe, expect, it } from "vitest";
import { dailyBudgetAlert } from "./daily-budget";
import {
  BASE_PALETTE,
  PERSONA_IDS,
  THEMES,
  THEME_IDS,
  applyTheme,
  budgetAlertLine,
  dailyOverLines,
  effectivePrefs,
  savedQuip,
} from "./personalize";

const card = {
  type: "flex",
  contents: {
    type: "bubble",
    header: {
      type: "box",
      backgroundColor: "#CCFBF1",
      contents: [
        { type: "text", text: "หัว", color: "#0B5D4F" },
        { type: "text", text: "รอง", color: "#3F6B63" },
        { type: "text", text: "ลิงก์", color: "#0F766E" },
      ],
    },
    body: {
      type: "box",
      contents: [
        { type: "text", text: "tip", color: "#0B5D4F" },
        { type: "text", text: "-฿5", color: "#E11D48" },
        { type: "text", text: "+฿5", color: "#059669" },
        { type: "button", color: "#0F766E" },
      ],
    },
  },
};

describe("applyTheme", () => {
  it("leaves the default theme untouched (same object)", () => {
    const list = [card];
    expect(applyTheme(list, "mint")).toBe(list);
  });

  it("recolours the header and the buttons but never income / expense colours", () => {
    const text = JSON.stringify(applyTheme([card], "ocean"));
    expect(text).toContain(THEMES.ocean.palette.soft);
    expect(text).toContain(THEMES.ocean.palette.primary);
    expect(text).not.toContain(BASE_PALETTE.soft);
    expect(text).not.toContain(BASE_PALETTE.primary);
    expect(text).toContain("#E11D48");
    expect(text).toContain("#059669");
  });

  it("does not change the input", () => {
    const before = JSON.stringify(card);
    applyTheme([card], "rose");
    expect(JSON.stringify(card)).toBe(before);
  });

  it("keeps the dark theme readable: light text on the band, dark text on white", () => {
    const out = applyTheme([card], "night")[0] as typeof card;
    const night = THEMES.night.palette;
    expect(out.contents.header.backgroundColor).toBe(night.soft);
    expect(out.contents.header.contents[0]?.color).toBe(night.headTitle);
    expect(out.contents.header.contents[2]?.color).toBe(night.headAccent);
    expect(out.contents.body.contents[0]?.color).toBe(night.bodyTitle);
    expect(out.contents.body.contents[3]?.color).toBe(night.primary);
  });

  it("every theme has all colours", () => {
    for (const id of THEME_IDS) {
      for (const value of Object.values(THEMES[id].palette))
        expect(value).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("persona lines", () => {
  it("polite adds nothing and keeps the original budget text", () => {
    expect(savedQuip("polite", "expense")).toBeNull();
    expect(budgetAlertLine("polite", { level: 80, scope: "รวม", figures: "x" })).toBeNull();
    expect(dailyOverLines("polite")).toBeUndefined();
  });

  it("friendly and cheer comment on saves; strict only on income", () => {
    expect(savedQuip("friendly", "expense", 0)).toBeTruthy();
    expect(savedQuip("cheer", "income", 0.99)).toBeTruthy();
    expect(savedQuip("strict", "expense")).toBeNull();
    expect(savedQuip("strict", "income", 0)).toBeTruthy();
  });

  it("every non-polite manner words both budget levels with the figures", () => {
    for (const persona of PERSONA_IDS.filter((p) => p !== "polite")) {
      for (const level of [80, 100] as const) {
        const line = budgetAlertLine(
          persona,
          { level, scope: "หมวดอาหาร", figures: "฿90 จาก ฿100" },
          0,
        );
        expect(line).toContain("฿90 จาก ฿100");
      }
    }
  });

  it("the daily scold follows the manner and always names the excess", () => {
    for (const persona of PERSONA_IDS) {
      for (const pick of [0, 0.5, 0.99]) {
        const text = dailyBudgetAlert({
          beforeSatang: 40_000,
          afterSatang: 62_000,
          limitSatang: 50_000,
          pick,
          persona,
        });
        expect(text).toContain("฿120");
      }
      const again = dailyBudgetAlert({
        beforeSatang: 62_000,
        afterSatang: 70_000,
        limitSatang: 50_000,
        persona,
      });
      expect(again).toContain("฿200");
    }
  });
});

describe("effectivePrefs", () => {
  it("free and unknown values read as the defaults; paid plans use the saved choice", () => {
    expect(effectivePrefs("free", { card_theme: "ocean", bot_persona: "strict" })).toEqual({
      theme: "mint",
      persona: "polite",
    });
    expect(effectivePrefs("plus", { card_theme: "ocean", bot_persona: "strict" })).toEqual({
      theme: "ocean",
      persona: "strict",
    });
    expect(effectivePrefs("ultimate", { card_theme: "nope", bot_persona: 3 })).toEqual({
      theme: "mint",
      persona: "polite",
    });
  });
});
