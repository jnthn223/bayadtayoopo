import type { CurrentUser, Expense, Group } from "./types";
import { allocateCustomShares, generateId, isGroupAdmin } from "./utils";

export const QUICK_ADD_LAST_GROUP_PREFIX = "bayadtayoopo:quick-add:last-group";

export function quickAddLastGroupKey(userId: string): string {
  return `${QUICK_ADD_LAST_GROUP_PREFIX}:${userId}`;
}

export function isQuickAddPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/quick-add";
}

export function quickAddGroupsForUser(
  groups: Group[],
  userId: string,
): Group[] {
  return groups.filter((group) =>
    group.members.some(
      (member) => member.id === userId || member.uid === userId,
    ),
  );
}

export function resolveQuickAddGroupId(
  groups: Group[],
  userId: string,
  urlGroupId?: string | null,
  rememberedGroupId?: string | null,
): string | null {
  const available = quickAddGroupsForUser(groups, userId);
  const accessible = (groupId?: string | null) =>
    !!groupId && available.some((group) => group.id === groupId);

  if (accessible(urlGroupId)) return urlGroupId!;
  if (accessible(rememberedGroupId)) return rememberedGroupId!;
  return available[0]?.id ?? null;
}

export function buildQuickExpense({
  group,
  currentUser,
  amount,
  description,
  paidByMemberId,
  includedMemberIds,
  splitType = "equal",
  customAmounts = {},
  id = generateId(),
  now = new Date(),
}: {
  group: Group;
  currentUser: CurrentUser;
  amount: number;
  description: string;
  paidByMemberId?: string;
  includedMemberIds?: string[];
  splitType?: "equal" | "custom";
  customAmounts?: Record<string, number>;
  id?: string;
  now?: Date;
}): Expense {
  const currentMember = group.members.find(
    (member) =>
      member.id === currentUser.id || member.uid === currentUser.id,
  );
  if (!currentMember) throw new Error("You no longer have access to this group.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid amount.");
  }
  if (!description.trim()) throw new Error("Enter an expense name.");
  const memberIds = [
    ...new Set(includedMemberIds ?? group.members.map((member) => member.id)),
  ].filter((memberId) =>
    group.members.some((member) => member.id === memberId),
  );
  if (memberIds.length === 0) {
    throw new Error("This group has no members to split with.");
  }

  const payer = group.members.find(
    (member) => member.id === (paidByMemberId ?? currentMember.id),
  );
  if (!payer) throw new Error("Choose who paid this expense.");
  if (payer.id !== currentMember.id && !isGroupAdmin(group, currentMember)) {
    throw new Error("Only an admin can record an expense paid by another member.");
  }

  if (
    splitType === "custom" &&
    memberIds.some((memberId) => {
      const share = customAmounts[memberId] ?? 0;
      return !Number.isFinite(share) || share < 0;
    })
  ) {
    throw new Error("Custom shares must be valid, non-negative amounts.");
  }

  const allocation = allocateCustomShares(
    memberIds,
    amount,
    splitType === "custom" ? customAmounts : {},
  );
  const allocatedTotal = memberIds.reduce(
    (sum, memberId) => sum + (allocation[memberId] ?? 0),
    0,
  );
  if (splitType === "custom" && Math.abs(allocatedTotal - amount) > 0.01) {
    throw new Error("Custom shares must equal the expense total.");
  }
  const createdAt = now.toISOString();

  return {
    id,
    description: description.trim(),
    amount,
    paidBy: payer.id,
    createdBy: currentMember.id,
    splitType,
    splits: memberIds.map((memberId) => ({
      memberId,
      amount: allocation[memberId] ?? 0,
    })),
    date: createdAt.slice(0, 10),
    category: "other",
    createdAt,
  };
}

export function upsertExpense(group: Group, expense: Expense): Group {
  const exists = group.expenses.some((candidate) => candidate.id === expense.id);
  return {
    ...group,
    expenses: exists
      ? group.expenses.map((candidate) =>
          candidate.id === expense.id ? expense : candidate,
        )
      : [expense, ...group.expenses],
  };
}
