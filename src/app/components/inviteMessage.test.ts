import { describe, expect, it } from "vitest";
import type { Group, Member } from "./types";
import { buildInviteMessage } from "./inviteMessage";

const alice: Member = { id: "alice", name: "Alice", color: "#111111" };
const bob: Member = {
  id: "bob",
  name: "Bob",
  color: "#222222",
  claimCode: "claim-bob",
};
const group: Group = {
  id: "trip",
  name: "Baguio Trip",
  members: [alice, bob],
  expenses: [
    {
      id: "hotel",
      description: "Hotel",
      amount: 1_000,
      paidBy: "alice",
      splitType: "equal",
      splits: [
        { memberId: "alice", amount: 500 },
        { memberId: "bob", amount: 500 },
      ],
      date: "2026-08-10",
      category: "accommodation",
    },
  ],
  createdAt: "2026-08-10",
  currency: "PHP",
};

describe("invite messages", () => {
  it("brands and personalizes a pending-member invite with their balance", () => {
    const message = buildInviteMessage({
      group,
      member: bob,
      joinUrl: "https://example.com/personal",
      includeQrNote: true,
    });

    expect(message).toContain("Hi Bob!");
    expect(message).toMatch(/^💜 BayadTayoOpo/);
    expect(message).toContain("Baguio Trip");
    expect(message).toContain("Current amount to settle: ₱500.00");
    expect(message).toContain("1 expense is already linked to your name");
    expect(message).toContain("only for Bob");
    expect(message).toContain("BayadTayoOpo — Ambagan without the awkward singilan");
    expect(message).toContain("attached QR code");
  });

  it("does not expose a personal balance in a general invite", () => {
    const message = buildInviteMessage({
      group,
      joinUrl: "https://example.com/general",
    });

    expect(message).toContain("join “Baguio Trip”");
    expect(message).toMatch(/^💜 BayadTayoOpo/);
    expect(message).not.toContain("Current amount");
    expect(message).not.toContain("please don’t forward");
  });

  it("optionally includes every active member balance in a general invite", () => {
    const message = buildInviteMessage({
      group,
      joinUrl: "https://example.com/general",
      includeAllBalances: true,
    });

    expect(message).toContain("Current member balances:");
    expect(message).toContain("• Alice: ₱500.00 to receive");
    expect(message).toContain("• Bob: ₱500.00 to settle");
  });

  it("can omit the balance from a personal invite", () => {
    const message = buildInviteMessage({
      group,
      member: bob,
      joinUrl: "https://example.com/personal",
      includeBalance: false,
    });

    expect(message).not.toContain("Current amount");
    expect(message).toContain("1 expense is already linked to your name");
  });
});
