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

    /** Push (outside a reply). Counts against the OA's monthly push quota — use sparingly. */
    async push(lineUserId: string, messages: LineMessage[]): Promise<void> {
      const res = await fetch(`${API}/message/push`, {
        method: "POST",
        headers,
        body: JSON.stringify({ to: lineUserId, messages: messages.slice(0, 5) }),
      });
      if (!res.ok) throw new Error(`LINE push failed: ${res.status}`);
    },

    /** A member's profile in a group (the person does not have to be a friend of the bot). */
    async getGroupMemberProfile(groupId: string, lineUserId: string): Promise<LineProfile | null> {
      const res = await fetch(
        `${API}/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(lineUserId)}`,
        { headers },
      );
      if (!res.ok) return null;
      return (await res.json()) as LineProfile;
    },

    async getProfile(lineUserId: string): Promise<LineProfile | null> {
      const res = await fetch(`${API}/profile/${encodeURIComponent(lineUserId)}`, { headers });
      if (!res.ok) return null;
      return (await res.json()) as LineProfile;
    },
  };
}

export type LineClient = ReturnType<typeof createLineClient>;
