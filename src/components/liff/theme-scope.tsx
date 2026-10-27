"use client";

import { useLayoutEffect } from "react";

/**
 * Puts data-theme="pastel" on <html> while the signed-in pages are on screen (the pastel-green look,
 * see tokens.css) and takes it off when they go. On <html>, so the page background and
 * anything that floats above the page (sheets) pick the colours up too.
 */
export function ThemeScope() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "pastel";
    return () => {
      delete root.dataset.theme;
    };
  }, []);
  return null;
}
