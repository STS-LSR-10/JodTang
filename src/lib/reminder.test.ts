import { describe, expect, it } from "vitest";
import { isReminderDue, normalizeTime, parseTimeToMinutes, reminderText } from "./reminder";

// 2026-10-16 20:10 Bangkok
const AT_2010 = new Date("2026-10-16T13:10:00Z");

describe("parseTimeToMinutes / normalizeTime", () => {
  it.each([
    ["20:30", 1230],
    ["20:30:00", 1230],
    ["0:05", 5],
    ["23:59", 1439],
  ])("%s", (input, minutes) => {
    expect(parseTimeToMinutes(input)).toBe(minutes);
  });

  it.each(["", "24:00", "12:60", "abc", "9", null])("rejects %j", (input) => {
    expect(parseTimeToMinutes(input as string | null)).toBeNull();
  });

  it("normalizes to HH:MM", () => {
    expect(normalizeTime("7:05")).toBe("07:05");
    expect(normalizeTime("20:30:00")).toBe("20:30");
    expect(normalizeTime("nope")).toBeNull();
  });
});

describe("isReminderDue", () => {
  it("is due from the chosen time", () => {
    expect(isReminderDue({ now: AT_2010, time: "20:00", lastRemindedOn: null })).toBe(true);
    expect(isReminderDue({ now: AT_2010, time: "20:10", lastRemindedOn: null })).toBe(true);
  });

  it("not before the chosen time", () => {
    expect(isReminderDue({ now: AT_2010, time: "20:30", lastRemindedOn: null })).toBe(false);
  });

  it("still delivers a few hours late, but not much later", () => {
    expect(isReminderDue({ now: AT_2010, time: "18:30", lastRemindedOn: null })).toBe(true); // 1h40 late
    expect(isReminderDue({ now: AT_2010, time: "09:00", lastRemindedOn: null })).toBe(false); // 11h late
  });

  it("only once per Bangkok day", () => {
    expect(isReminderDue({ now: AT_2010, time: "20:00", lastRemindedOn: "2026-10-16" })).toBe(
      false,
    );
    expect(isReminderDue({ now: AT_2010, time: "20:00", lastRemindedOn: "2026-10-15" })).toBe(true);
  });

  it("ignores a missing or broken time", () => {
    expect(isReminderDue({ now: AT_2010, time: null, lastRemindedOn: null })).toBe(false);
    expect(isReminderDue({ now: AT_2010, time: "xx", lastRemindedOn: null })).toBe(false);
  });
});

describe("reminderText", () => {
  it("mentions the streak only when it is worth protecting", () => {
    expect(reminderText(AT_2010, 0)).not.toContain("ต่อเนื่อง");
    expect(reminderText(AT_2010, 1)).not.toContain("ต่อเนื่อง");
    expect(reminderText(AT_2010, 5)).toContain("ต่อเนื่อง 5 วัน");
  });

  it("rotates by day", () => {
    const a = reminderText(new Date("2026-10-15T13:00:00Z"), 0);
    const b = reminderText(new Date("2026-10-16T13:00:00Z"), 0);
    expect(a).not.toBe(b);
  });
});
