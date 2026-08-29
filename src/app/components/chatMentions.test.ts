import { describe, expect, it } from "vitest";
import type { Member } from "./types";
import {
  findMentionRange,
  getMentionedMemberIds,
  insertMention,
  parseChatMentions,
} from "./chatMentions";

const members = [
  { id: "angelica", name: "Angelica Zaragoza", color: "#fff" },
  { id: "andria", name: "Andria", color: "#000" },
] as Member[];

describe("chat mentions", () => {
  it("finds and replaces the active mention at the cursor", () => {
    const range = findMentionRange("Hello @ange");
    expect(range?.query).toBe("ange");
    expect(insertMention("Hello @ange", range!, "Angelica Zaragoza")).toEqual({
      text: "Hello @Angelica Zaragoza ",
      cursor: 25,
    });
  });

  it("extracts member IDs and preserves text around mentions", () => {
    const text = "Hi @Angelica Zaragoza, ask @Andria!";
    expect(getMentionedMemberIds(text, members)).toEqual([
      "angelica",
      "andria",
    ]);
    expect(parseChatMentions(text, members).filter((part) => part.memberIds.length))
      .toHaveLength(2);
  });

  it("does not treat an email address as a mention", () => {
    expect(getMentionedMemberIds("Email me@Andria.com", members)).toEqual([]);
  });

  it("does not crash on malformed legacy message text", () => {
    expect(parseChatMentions(undefined as unknown as string, members)).toEqual([
      { text: "", memberIds: [] },
    ]);
  });
});
