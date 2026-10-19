import { describe, expect, it } from "vitest";
import { parseCommand } from "@/lib/commands";
import { applyTheme } from "@/lib/personalize";
import {
  buildGroupHelpCard,
  buildHelpCarousel,
  buildWelcomeCard,
  HELP_SECTIONS,
} from "./help-flex";

const json = (m: unknown) => JSON.stringify(m);
const bubbles = (m: unknown) => (m as { contents: { contents: unknown[] } }).contents.contents;

/** Commands that only show something: safe to run from a button. */
const READ_ONLY = new Set([
  "summary",
  "category-spend",
  "recent",
  "year-summary",
  "compare-months",
  "forecast",
  "wallets",
  "cards",
  "debts",
  "daily-budget",
  "points",
  "my-code",
  "bills",
  "goals",
]);

describe("help carousel", () => {
  it("has a card per kind of thing, within LINE's limit, plus the shortcuts", () => {
    const card = buildHelpCarousel({ plan: "free", appUrl: "https://x.test" });
    expect(card.type).toBe("flex");
    expect((card.contents as { type: string }).type).toBe("carousel");
    expect(bubbles(card)).toHaveLength(HELP_SECTIONS.length + 1);
    expect(bubbles(card).length).toBeLessThanOrEqual(12);
    expect(json(card).length).toBeLessThan(50_000); // LINE's flex message size limit
  });

  it("every button sends a real read-only command (and never a recording or deleting one)", () => {
    for (const section of HELP_SECTIONS) {
      for (const item of section.items) {
        if (!item.send) continue;
        const command = parseCommand(item.send);
        expect(command, `"${item.send}" is not a command`).not.toBeNull();
        expect(READ_ONLY.has(command!.kind), `${item.send} is ${command!.kind}`).toBe(true);
      }
    }
    // the examples that record, delete or edit are never buttons
    for (const cmd of [
      "กาแฟ 30",
      "ลบล่าสุด",
      "แก้ล่าสุด 45",
      "ใช้รหัส ABCD1234",
      "งบวัน 500",
      "ออม เที่ยวญี่ปุ่น 2000",
    ]) {
      const item = HELP_SECTIONS.flatMap((s) => s.items).find((i) => i.cmd === cmd);
      expect(item, cmd).toBeDefined();
      expect(item!.send, cmd).toBeUndefined();
    }
  });

  it("only what the plan has can be tapped; the rest is dimmed with its badge", () => {
    const taps = (plan: "free" | "plus" | "ultimate") =>
      (json(buildHelpCarousel({ plan })).match(/"type":"message"/g) ?? []).length;
    expect(taps("free")).toBeGreaterThan(0);
    expect(taps("plus")).toBeGreaterThan(taps("free"));
    expect(taps("ultimate")).toBeGreaterThan(taps("plus"));

    const free = json(buildHelpCarousel({ plan: "free" }));
    expect(free).toContain("Pro");
    expect(free).toContain("Ultimate");
    expect(free).not.toContain("Pro ✓"); // Free has no Pro things to tick
    expect(json(buildHelpCarousel({ plan: "plus" }))).toContain("Pro ✓");
    expect(json(buildHelpCarousel({ plan: "ultimate" }))).toContain("Ultimate ✓");
  });

  it("a Free user cannot tap a Professional command (it would only bounce)", () => {
    const free = json(buildHelpCarousel({ plan: "free" }));
    const sends = (j: string, text: string) =>
      j.includes(`"type":"message","label":"${text}","text":"${text}"`);
    expect(sends(free, "สรุปปี")).toBe(false);
    expect(sends(free, "สรุปวันนี้")).toBe(true);
    expect(sends(json(buildHelpCarousel({ plan: "plus" })), "สรุปปี")).toBe(true);
  });

  it("the shortcuts open the app pages, or say where to find the menu when the URL is unknown", () => {
    expect(json(buildHelpCarousel({ plan: "free", appUrl: "https://x.test" }))).toContain(
      "https://x.test/upgrade",
    );
    const none = json(buildHelpCarousel({ plan: "free" }));
    expect(none).not.toContain("undefined");
    expect(none).toContain("เมนูด้านล่าง");
  });

  it("every example is short enough to fit a phone card and has a description", () => {
    for (const section of HELP_SECTIONS) {
      expect(section.items.length).toBeLessThanOrEqual(10);
      for (const item of section.items) {
        expect(item.cmd.length, item.cmd).toBeLessThanOrEqual(40);
        expect(item.desc.length, item.desc).toBeGreaterThan(3);
      }
    }
  });

  it("follows the person's colour theme", () => {
    const themed = json(applyTheme([buildHelpCarousel({ plan: "plus" })], "ocean"));
    expect(themed).toContain("#E0F2FE");
    expect(themed).not.toContain("#CCFBF1");
  });
});

describe("welcome and group cards", () => {
  it("the welcome card shows examples and a button to the full guide", () => {
    const card = json(buildWelcomeCard({ appUrl: "https://x.test" }));
    expect(card).toContain("กาแฟ 30");
    expect(card).toContain('"text":"ช่วยเหลือ"');
    expect(card).toContain("https://x.test/summary");
    expect(json(buildWelcomeCard({}))).not.toContain("undefined");
  });

  it("the group card lists the commands and has no buttons that talk in the group", () => {
    const card = json(buildGroupHelpCard());
    expect(card).toContain("จด ข้าวเที่ยง 350");
    expect(card).toContain("ปิดสมุดกลุ่ม");
    expect(card).not.toContain('"type":"message"');
  });
});
