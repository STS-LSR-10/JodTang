"use client";

import { useLayoutEffect } from "react";

/**
 * Puts data-theme="olive" on <html> while the signed-in pages are on screen (the olive-and-turmeric
 * look, see tokens.css) and takes it off when they go. On <html>, so the page background and
 * anything that floats above the page (sheets) pick the colours up too.
 */
export function ThemeScope() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "olive";
    return () => {
      delete root.dataset.theme;
    };
  }, []);
  return null;
}
