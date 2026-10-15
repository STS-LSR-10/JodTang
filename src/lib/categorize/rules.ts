import { normalizeThaiDigits } from "@/lib/parse/thai-number";
import type { TxType } from "@/lib/types";

export interface CategoryLite {
  id: string;
  /** null = system default category */
  user_id: string | null;
  type: TxType;
  name: string;
  keywords: string[];
  sort_order: number;
  is_hidden: boolean;
}

export interface MemoryLite {
  match_text: string;
  category_id: string;
}

export type CategorizeSource = "memory" | "keyword" | "fallback" | "none";

export interface CategorizeResult {
  categoryId: string | null;
  via: CategorizeSource;
}

const FALLBACK_NAME = "อื่นๆ";
const MIN_KEYWORD_LENGTH = 2;

export function normalizeText(text: string): string {
  return normalizeThaiDigits(text).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Rule-based categorization (steps 1, 2 and 4 of the chain; the LLM step comes later):
 * 1. the user's learned merchant memory, 2. category keywords (longest match wins,
 * the user's own categories beat system ones), 4. the "อื่นๆ" category of that type.
 */
export function categorizeByRules(input: {
  title: string;
  type: TxType;
  categories: CategoryLite[];
  memory: MemoryLite[];
}): CategorizeResult {
  const title = normalizeText(input.title);
  const usable = input.categories.filter((c) => c.type === input.type && !c.is_hidden);

  if (title) {
    // 1. merchant memory (must point at a category of the right type)
    const usableIds = new Set(usable.map((c) => c.id));
    let bestMemory: MemoryLite | null = null;
    for (const m of input.memory) {
      const key = normalizeText(m.match_text);
      if (!key || !usableIds.has(m.category_id) || !title.includes(key)) continue;
      if (!bestMemory || key.length > normalizeText(bestMemory.match_text).length) bestMemory = m;
    }
    if (bestMemory) return { categoryId: bestMemory.category_id, via: "memory" };

    // 2. keywords
    let best: { id: string; length: number; own: boolean } | null = null;
    for (const c of usable) {
      for (const raw of [...c.keywords, c.name]) {
        const key = normalizeText(raw);
        if (key.length < MIN_KEYWORD_LENGTH || !title.includes(key)) continue;
        const own = c.user_id !== null;
        if (!best || key.length > best.length || (key.length === best.length && own && !best.own)) {
          best = { id: c.id, length: key.length, own };
        }
      }
    }
    if (best) return { categoryId: best.id, via: "keyword" };
  }

  // 4. fallback
  const fallbacks = usable.filter((c) => c.name === FALLBACK_NAME);
  const fallback = fallbacks.find((c) => c.user_id !== null) ?? fallbacks[0];
  if (fallback) return { categoryId: fallback.id, via: "fallback" };
  return { categoryId: null, via: "none" };
}
