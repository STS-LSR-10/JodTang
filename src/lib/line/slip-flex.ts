import { categoryLabel } from "@/lib/category-emoji";
import type { LineMessage } from "@/lib/types";
import { PICK_CATEGORY_TEXT } from "./messages";

export interface CategoryChoice {
  id: string;
  name: string;
  icon?: string | null;
}

const MAX_QUICK_REPLIES = 13; // LINE limit
const MAX_LABEL = 20; // LINE limit

/** Quick Reply list for picking the right category of a pending slip. */
export function buildCategoryChooser(txId: string, categories: CategoryChoice[]): LineMessage {
  return {
    type: "text",
    text: PICK_CATEGORY_TEXT,
    quickReply: {
      items: categories.slice(0, MAX_QUICK_REPLIES).map((c) => ({
        type: "action",
        action: {
          type: "postback",
          label: categoryLabel(c.name, c.icon).slice(0, MAX_LABEL),
          data: `a=sk&id=${txId}&c=${c.id}`,
          displayText: c.name.slice(0, MAX_LABEL),
        },
      })),
    },
  };
}
