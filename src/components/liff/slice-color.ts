const FALLBACK_COLORS = [
  "#5F7D3A",
  "#D49B28",
  "#DE6449",
  "#9AB07E",
  "#B07B18",
  "#8DAF68",
  "#A98B5B",
  "#C74B33",
];

/** Category colour, or a palette fallback so every slice and legend swatch matches. */
export const sliceColor = (color: string | null, index: number): string =>
  color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? "#64748B";
