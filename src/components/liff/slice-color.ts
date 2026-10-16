const FALLBACK_COLORS = ["#0F766E", "#0369A1", "#7C3AED", "#D97706", "#475569", "#DB2777"];

/** Category colour, or a palette fallback so every slice and legend swatch matches. */
export const sliceColor = (color: string | null, index: number): string =>
  color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? "#64748B";
