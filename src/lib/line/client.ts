import type { LineMessage } from "@/lib/types";

const API = "https://api.line.me/v2/bot";

export interface LineProfile {
  displayName?: string;
  pictureUrl?: string;
}

export function createLineClient(accessToken: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  return {
    /** Reply (max 5 messages). Throws with the HTTP status only — never the payload. */
    async reply(replyToken: string, messages: LineMessage[]): Promise<void> {
      const res = await fetch(`${API}/message/reply`, {
        method: "POST",
        headers,
        body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
      });
      if (!res.ok) throw new Error(`LINE reply failed: ${res.status}`);
    },

    async getProfile(lineUserId: string): Promise<LineProfile | null> {
      const res = await fetch(`${API}/profile/${encodeURIComponent(lineUserId)}`, { headers });
      if (!res.ok) return null;
      return (await res.json()) as LineProfile;
    },
  };
}

export type LineClient = ReturnType<typeof createLineClient>;
