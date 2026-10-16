import type { CurrentUser, Group, Member } from "./types";
import { computeBalances, computeSettlements, getMemberById } from "./utils";

export interface OverallBalanceSource {
  group: Group;
  amount: number;
}

export interface OverallBalance {
  key: string;
  personUid: string;
  personName: string;
  person: Member;
  currency: string;
  /** Positive means the person owes the current user; negative means the user owes them. */
  amount: number;
  sources: OverallBalanceSource[];
}

function currentMember(group: Group, userId: string): Member | undefined {
  return [...group.members, ...(group.formerMembers ?? [])].find(
    (member) => member.uid === userId || member.id === userId,
  );
}

/**
 * Builds a read-only, cross-group summary. Groups remain the source of truth.
 * Pending members are deliberately excluded because names are not safe identities.
 */
export function buildOverallBalances(
  groups: Group[],
  user: Pick<CurrentUser, "id">,
): OverallBalance[] {
  const aggregated = new Map<string, OverallBalance>();

  for (const group of groups) {
    const me = currentMember(group, user.id);
    if (!me) continue;

    const relatedSettlements = computeSettlements(computeBalances(group)).filter(
      (settlement) => settlement.from === me.id || settlement.to === me.id,
    );

    for (const settlement of relatedSettlements) {
      const otherMemberId =
        settlement.from === me.id ? settlement.to : settlement.from;
      const person = getMemberById(group, otherMemberId);
      if (!person?.uid || person.uid === user.id) continue;

      const signedAmount =
        settlement.to === me.id ? settlement.amount : -settlement.amount;
      if (Math.abs(signedAmount) < 0.005) continue;

      const key = `${person.uid}:${group.currency}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.amount = Math.round((existing.amount + signedAmount) * 100) / 100;
        existing.sources.push({ group, amount: signedAmount });
      } else {
        aggregated.set(key, {
          key,
          personUid: person.uid,
          personName: person.name,
          person,
          currency: group.currency,
          amount: signedAmount,
          sources: [{ group, amount: signedAmount }],
        });
      }
    }
  }

  return [...aggregated.values()]
    .filter((balance) => Math.abs(balance.amount) >= 0.005)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}
