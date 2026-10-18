import { describe, expect, it } from "vitest";
import { categoryLabel, EMOJI_CHOICES, emojiOf, isSingleEmoji, parseEmoji } from "./category-emoji";

describe("isSingleEmoji", () => {
  it.each(["🐱", "🏖️", "✈️", "👍🏽", "👨‍👩‍👧", "🇹🇭", "1️⃣", "⭐"])("%s is one emoji", (e) => {
    expect(isSingleEmoji(e)).toBe(true);
  });

  it.each(["", "a", "กข", "ค่า", "🐱🐶", "🐱a", "a🐱", " ", "tag", "utensils", "1", "#"])(
    "%j is not",
    (e) => {
      expect(isSingleEmoji(e)).toBe(false);
    },
  );

  it("refuses something very long even if it is all emoji joined", () => {
    expect(isSingleEmoji("👨‍👩‍👧‍👦‍👨‍👩‍👧‍👦")).toBe(false);
  });
});

describe("parseEmoji", () => {
  it("accepts one emoji, trimmed", () => {
    expect(parseEmoji(" 🐱 ")).toEqual({ ok: true, emoji: "🐱" });
  });

  it("empty, null and undefined clear it", () => {
    expect(parseEmoji("")).toEqual({ ok: true, emoji: null });
    expect(parseEmoji("   ")).toEqual({ ok: true, emoji: null });
    expect(parseEmoji(null)).toEqual({ ok: true, emoji: null });
    expect(parseEmoji(undefined)).toEqual({ ok: true, emoji: null });
  });

  it("refuses text, several emoji and non-strings", () => {
    expect(parseEmoji("ab")).toEqual({ ok: false });
    expect(parseEmoji("🐱🐶")).toEqual({ ok: false });
    expect(parseEmoji(42)).toEqual({ ok: false });
    expect(parseEmoji({})).toEqual({ ok: false });
  });
});

describe("emojiOf and categoryLabel", () => {
  it("reads an emoji out of icon and ignores icon names", () => {
    expect(emojiOf("🐱")).toBe("🐱");
    expect(emojiOf("utensils")).toBeNull();
    expect(emojiOf("tag")).toBeNull();
    expect(emojiOf(null)).toBeNull();
    expect(emojiOf(undefined)).toBeNull();
  });

  it("puts the emoji in front of the name", () => {
    expect(categoryLabel("ค่าอาหารแมว", "🐱")).toBe("🐱 ค่าอาหารแมว");
    expect(categoryLabel("อาหาร", "utensils")).toBe("อาหาร");
    expect(categoryLabel("อาหาร", null)).toBe("อาหาร");
  });
});

describe("EMOJI_CHOICES", () => {
  it("are all single emoji with no repeats", () => {
    expect(EMOJI_CHOICES.every(isSingleEmoji)).toBe(true);
    expect(new Set(EMOJI_CHOICES).size).toBe(EMOJI_CHOICES.length);
  });
});
