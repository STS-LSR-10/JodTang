import { describe, expect, it } from "vitest";
import { cleanNoteBody, noteCapacity, noteTitle } from "./note";

describe("cleanNoteBody", () => {
  it("keeps the person's lines, trims the edges and the ends of lines, and caps blank runs", () => {
    expect(cleanNoteBody("  ซื้อนม  \r\n\r\n\r\n\r\nไข่ \t\n")).toBe("ซื้อนม\n\nไข่");
  });
  it("is empty for blanks", () => {
    expect(cleanNoteBody(" \n \t ")).toBe("");
  });
});

describe("noteTitle", () => {
  it("is the first line, cut with … when long", () => {
    expect(noteTitle("รหัสไวไฟ\n1234")).toBe("รหัสไวไฟ");
    expect(noteTitle("ก".repeat(60), 10)).toBe(`${"ก".repeat(9)}…`);
  });
});

describe("noteCapacity", () => {
  it("grows with the plan", () => {
    expect([noteCapacity("free"), noteCapacity("plus"), noteCapacity("ultimate")]).toEqual([
      30, 500, 2000,
    ]);
  });
});
