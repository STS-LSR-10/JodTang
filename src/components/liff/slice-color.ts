const FALLBACK_COLORS = [
  "#4FA77C",
  "#EDBA52",
  "#E8907C",
  "#9AD3B4",
  "#D9A441",
  "#76BF98",
  "#B8C98A",
  "#D9806A",
];

/** Category colour, or a palette fallback so every slice and legend swatch matches. */
export const sliceColor = (color: string | null, index: number): string =>
  color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? "#64748B";
