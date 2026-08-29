import { describe, expect, it } from "vitest";
import { ensureRequiredShareLinks } from "./requiredShareLinks";

describe("required share links", () => {
  const link = {
    label: "Join the group",
    url: "https://example.com/?joinGroupId=trip",
  };

  it("restores a required link removed from a custom message", () => {
    expect(ensureRequiredShareLinks("Tara!", [link])).toBe(
      "Tara!\n\nJoin the group: https://example.com/?joinGroupId=trip",
    );
  });

  it("does not duplicate a link already present in the message", () => {
    const message = `Custom copy\n${link.url}`;
    expect(ensureRequiredShareLinks(message, [link])).toBe(message);
  });
});
