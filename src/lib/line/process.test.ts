import { describe, expect, it } from "vitest";
import { typingChatId } from "./process";
import type { LineEvent } from "./handlers";

const ev = (type: string, source: unknown) => ({ type, source }) as unknown as LineEvent;

describe("typingChatId (who gets the 'typing' dots)", () => {
  it("messages and button taps in a 1:1 chat do", () => {
    expect(typingChatId(ev("message", { type: "user", userId: "U1" }))).toBe("U1");
    expect(typingChatId(ev("postback", { type: "user", userId: "U1" }))).toBe("U1");
  });
  it("groups, rooms and other events do not", () => {
    expect(typingChatId(ev("message", { type: "group", groupId: "C1", userId: "U1" }))).toBeNull();
    expect(typingChatId(ev("message", { type: "room", roomId: "R1", userId: "U1" }))).toBeNull();
    expect(typingChatId(ev("follow", { type: "user", userId: "U1" }))).toBeNull();
    expect(typingChatId(ev("message", { type: "user" }))).toBeNull();
  });
});
