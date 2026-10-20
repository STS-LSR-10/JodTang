import type { LineMessage } from "@/lib/types";
import { NOT_UNDERSTOOD_TEXT } from "./messages";

/** "Did not get that": the short text, with a button that opens the help cards. */
export function notUnderstood(): LineMessage {
  return {
    type: "text",
    text: NOT_UNDERSTOOD_TEXT,
    quickReply: {
      items: [
        {
          type: "action",
          action: { type: "message", label: "📖 ดูวิธีใช้", text: "วิธีใช้งาน" },
        },
      ],
    },
  };
}
