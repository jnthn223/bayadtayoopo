import { describe, expect, it } from "vitest";
import type { Group } from "./types";
import {
  findSimilarPendingMember,
  memberNameSimilarity,
  normalizeMemberName,
} from "./memberNameMatch";

const group = {
  adminId: "joined",
  members: [
    { id: "andria", name: "Andria Mae", color: "#111" },
    { id: "joined", uid: "uid-1", name: "Jonathan", color: "#222" },
  ],
} as Group;

describe("member name matching", () => {
  it("normalizes punctuation, spacing, case, and accents", () => {
    expect(normalizeMemberName("  ÁNDRIA-Mae ")).toBe("andria mae");
  });

  it("suggests a close pending-member match", () => {
    expect(findSimilarPendingMember(group, "Andria May")?.id).toBe("andria");
  });

  it("suggests a first-name pending member for a full profile name", () => {
    const firstNameGroup = {
      ...group,
      members: [
        { id: "andria", name: "Andria", color: "#111" },
        group.members[1],
      ],
    } as Group;

    expect(findSimilarPendingMember(firstNameGroup, "Andria Dizon")?.id).toBe(
      "andria",
    );
  });

  it("does not treat a short fragment as a meaningful name match", () => {
    expect(memberNameSimilarity("Ann", "Ann Marie")).toBeLessThan(0.72);
  });

  it("never suggests an already joined member", () => {
    expect(findSimilarPendingMember(group, "Jonathan")).toBeUndefined();
  });

  it("rejects unrelated names", () => {
    expect(memberNameSimilarity("Angelica", "Andria Mae")).toBeLessThan(0.72);
  });
});
