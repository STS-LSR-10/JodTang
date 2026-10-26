import type { Config } from "tailwindcss";

// Tokens live in src/styles/tokens.css and docs/design-tokens.md
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "var(--primary)", soft: "var(--primary-soft)" },
        accent: "var(--accent)",
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        expense: "var(--expense)",
        income: "var(--income)",
        background: "var(--background)",
        surface: "var(--surface)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        border: "var(--border)",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "16px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.06), 0 1px 3px rgb(15 23 42 / 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-noto-sans-thai)", "Noto Sans Thai", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
