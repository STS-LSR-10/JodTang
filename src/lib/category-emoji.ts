/** Custom categories a person may keep (a guard against runaway creation). */
export const MAX_CUSTOM_CATEGORIES = 50;

const EMOJI_START = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]️?⃣)/u;

function graphemes(text: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => {
        segment(input: string): Iterable<{ segment: string }>;
      };
    }
  ).Segmenter;
  if (!Segmenter) return [...text];
  return [...new Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(
    (s) => s.segment,
  );
}

/** True for exactly one emoji (a flag, a family, a thumbs-up with a skin tone... counts as one). */
export function isSingleEmoji(text: string): boolean {
  if (text.length === 0 || text.length > 16) return false;
  const parts = graphemes(text);
  return parts.length === 1 && EMOJI_START.test(text);
}

export type EmojiInput = { ok: true; emoji: string | null } | { ok: false };

/**
 * What a person typed or picked as a category's emoji. Empty clears it (null). Anything that is
 * not exactly one emoji is refused, so the column never holds free text.
 */
export function parseEmoji(input: unknown): EmojiInput {
  if (input === null || input === undefined) return { ok: true, emoji: null };
  if (typeof input !== "string") return { ok: false };
  const text = input.trim();
  if (text === "") return { ok: true, emoji: null };
  return isSingleEmoji(text) ? { ok: true, emoji: text } : { ok: false };
}

/** The emoji stored in `categories.icon`, or null for a name like "utensils" or "tag". */
export function emojiOf(icon: string | null | undefined): string | null {
  return icon && isSingleEmoji(icon) ? icon : null;
}

/** "🐱 ค่าอาหารแมว", or just the name when the category has no emoji. */
export function categoryLabel(name: string, icon: string | null | undefined): string {
  const emoji = emojiOf(icon);
  return emoji ? `${emoji} ${name}` : name;
}

/** Emoji offered in the picker: pets, food, play, travel, health, home and money. */
export const EMOJI_CHOICES: readonly string[] = [
  "🐱",
  "🐶",
  "🐟",
  "🐦",
  "🐾",
  "🍜",
  "🍚",
  "🍗",
  "🧋",
  "☕",
  "🍺",
  "🍰",
  "🥗",
  "🛒",
  "🎮",
  "🎬",
  "🎧",
  "📚",
  "🎁",
  "🎉",
  "🏖️",
  "✈️",
  "🚗",
  "🚌",
  "⛽",
  "🛵",
  "🏠",
  "💡",
  "💧",
  "📱",
  "🧴",
  "👕",
  "👟",
  "💊",
  "🏥",
  "🏋️",
  "✂️",
  "🧸",
  "👶",
  "🎓",
  "💰",
  "💳",
  "🏦",
  "📈",
  "🧾",
  "🔧",
  "🌱",
  "⭐",
];
