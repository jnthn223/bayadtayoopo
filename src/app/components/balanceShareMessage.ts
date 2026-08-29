import type { Group, Member } from "./types";
import { formatCurrency } from "./utils";

export function buildBalanceShareMessage({
  group,
  member,
  balance,
  senderName,
  groupUrl,
}: {
  group: Group;
  member: Member;
  balance: number;
  senderName?: string;
  groupUrl: string;
}): string {
  const amount = formatCurrency(Math.abs(balance), group.currency);
  const balanceLine = balance < -0.005
    ? `Current amount to settle: ${amount}`
    : balance > 0.005
      ? `Current amount to receive: ${amount}`
      : "Your group balance is settled.";

  return [
    "💜 BayadTayoOpo",
    "",
    `Hi ${member.name}! 👋`,
    "",
    `Here’s a balance update for “${group.name}”:`,
    balanceLine,
    "",
    "Open the group to see what this balance covers, including expenses, receipts, and payment records:",
    groupUrl,
    ...(senderName ? ["", `Shared by ${senderName}.`] : []),
    "",
    "BayadTayoOpo — Ambagan without the awkward singilan.",
  ].join("\n");
}
