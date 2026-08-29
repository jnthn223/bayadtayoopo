import type { Group, Member } from "./types";
import {
  computeProjectedBalances,
  formatCurrency,
  getExpensePayerId,
} from "./utils";

export interface InviteDetails {
  balance?: number;
  linkedExpenseCount?: number;
}

export function getMemberInviteDetails(
  group: Group,
  memberId: string,
): InviteDetails {
  const balance = computeProjectedBalances(group).find(
    (item) => item.memberId === memberId,
  )?.net;
  const linkedExpenseCount = group.expenses.filter(
    (expense) =>
      getExpensePayerId(expense) === memberId ||
      expense.splits.some((split) => split.memberId === memberId),
  ).length;
  return { balance, linkedExpenseCount };
}

export function buildInviteMessage({
  group,
  joinUrl,
  member,
  includeBalance = true,
  includeAllBalances = false,
  includeQrNote = false,
}: {
  group: Group;
  joinUrl: string;
  member?: Member;
  includeBalance?: boolean;
  includeAllBalances?: boolean;
  includeQrNote?: boolean;
}): string {
  const lines = [
    "💜 BayadTayoOpo",
    "",
    ...(member
      ? [
        `Hi ${member.name}! 👋`,
        "",
        `You’re invited to claim your place in “${group.name}” on BayadTayoOpo.`,
      ]
      : [
        "Tara, bayad tayo! 👋",
        "",
        `You’re invited to join “${group.name}” on BayadTayoOpo.`,
      ]),
  ];

  if (member) {
    const { balance, linkedExpenseCount } = getMemberInviteDetails(
      group,
      member.id,
    );
    if (includeBalance && typeof balance === "number") {
      if (balance < -0.005) {
        lines.push(
          "",
          `Current amount to settle: ${formatCurrency(Math.abs(balance), group.currency)}`,
        );
      } else if (balance > 0.005) {
        lines.push(
          "",
          `Current amount to receive: ${formatCurrency(balance, group.currency)}`,
        );
      }
    }
    if (linkedExpenseCount && linkedExpenseCount > 0) {
      lines.push(
        `${linkedExpenseCount} expense${linkedExpenseCount === 1 ? " is" : "s are"} already linked to your name.`,
      );
    }
  }

  if (!member && includeAllBalances) {
    const activeMemberIds = new Set(group.members.map((item) => item.id));
    const balances = computeProjectedBalances(group).filter((balance) =>
      activeMemberIds.has(balance.memberId),
    );
    lines.push("", "Current member balances:");
    for (const balance of balances) {
      if (balance.net < -0.005) {
        lines.push(
          `• ${balance.memberName}: ${formatCurrency(Math.abs(balance.net), group.currency)} to settle`,
        );
      } else if (balance.net > 0.005) {
        lines.push(
          `• ${balance.memberName}: ${formatCurrency(balance.net, group.currency)} to receive`,
        );
      } else {
        lines.push(`• ${balance.memberName}: Settled`);
      }
    }
  }

  lines.push(
    "",
    "See shared expenses, balances, receipts, payment instructions, and payment proofs in one place.",
    "",
    member ? `Claim your personal invite: ${joinUrl}` : `Join the group: ${joinUrl}`,
  );

  if (includeQrNote) lines.push("Or scan the attached QR code.");
  if (member) {
    lines.push("", `This link is only for ${member.name}—please don’t forward it.`);
  }

  lines.push("", "BayadTayoOpo — Ambagan without the awkward singilan.");
  return lines.join("\n");
}
