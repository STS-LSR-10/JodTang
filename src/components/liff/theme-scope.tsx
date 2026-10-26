"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

/** The pages drawn in the olive-and-turmeric look (see tokens.css). */
const OLIVE_PAGES = ["/summary", "/analytics", "/budgets"];

/**
 * Puts data-theme="olive" on <html> while one of the olive pages (and the bottom bar under it) is
 * on screen, and takes it off again elsewhere. On <html>, so the page background and anything that
 * floats above the page (sheets) pick the colours up too.
 */
export function ThemeScope() {
  const pathname = usePathname();
  const olive = OLIVE_PAGES.some((p) => pathname === p || pathname?.startsWith(`${p}/`));
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (olive) root.dataset.theme = "olive";
    else delete root.dataset.theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [olive]);
  return null;
}
