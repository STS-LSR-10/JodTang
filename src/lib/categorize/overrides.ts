import type { CategoryLite } from "./rules";

export interface CategoryDetail extends CategoryLite {
  icon: string | null;
  color: string | null;
}

export interface CategoryOverride {
  category_id: string;
  keywords: string[] | null;
  is_hidden: boolean | null;
  sort_order: number | null;
}

/**
 * Apply a user's overrides to shared system categories. The user's own categories are
 * never overridden (they are edited in place). Null override fields keep the original value.
 */
export function applyOverrides(
  categories: CategoryDetail[],
  overrides: CategoryOverride[],
): CategoryDetail[] {
  const byId = new Map(overrides.map((o) => [o.category_id, o]));
  return categories.map((c) => {
    const o = c.user_id === null ? byId.get(c.id) : undefined;
    if (!o) return c;
    return {
      ...c,
      keywords: o.keywords ?? c.keywords,
      is_hidden: o.is_hidden ?? c.is_hidden,
      sort_order: o.sort_order ?? c.sort_order,
    };
  });
}
