import { EXPENSE_CATEGORIES } from "./types";
import type { Category, SplitType } from "./types";

export interface OfflineExpenseDraft {
  id: string;
  groupId: string;
  userId: string;
  updatedAt: string;
  description: string;
  notes: string;
  amount: string;
  foreignCurrencyOpen: boolean;
  originalAmount: string;
  originalCurrency: string;
  paidBy: string;
  multiplePayers: boolean;
  contributionInputs: Record<string, string>;
  splitType: SplitType;
  category: Category;
  categoryDetail: string;
  customOverrides: Record<string, string>;
  itemDrafts: Array<{ id: string; name: string; amount: string; memberIds: string[] }>;
  includedMemberIds: string[];
  date: string;
  dueDate: string;
}

function storageKey(userId: string) {
  return `bayadtayoopo:offline-expense-drafts:${userId}`;
}

export function loadOfflineExpenseDrafts(userId: string): OfflineExpenseDraft[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): OfflineExpenseDraft[] => {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.id !== "string" ||
        typeof value.groupId !== "string" ||
        value.userId !== userId
      ) return [];
      const draft = value as Partial<OfflineExpenseDraft>;
      const stringRecord = (candidate: unknown): Record<string, string> =>
        candidate && typeof candidate === "object"
          ? Object.fromEntries(Object.entries(candidate).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
          : {};
      const splitType: SplitType = ["equal", "custom", "itemized"].includes(draft.splitType ?? "")
        ? draft.splitType as SplitType
        : "equal";
      const category: Category = EXPENSE_CATEGORIES.includes(draft.category as Category)
        ? draft.category as Category
        : "food";
      return [{
        id: draft.id!,
        groupId: draft.groupId!,
        userId,
        updatedAt: typeof draft.updatedAt === "string" ? draft.updatedAt : new Date(0).toISOString(),
        description: typeof draft.description === "string" ? draft.description : "",
        notes: typeof draft.notes === "string" ? draft.notes : "",
        amount: typeof draft.amount === "string" ? draft.amount : "",
        foreignCurrencyOpen: draft.foreignCurrencyOpen === true,
        originalAmount: typeof draft.originalAmount === "string" ? draft.originalAmount : "",
        originalCurrency: typeof draft.originalCurrency === "string" ? draft.originalCurrency : "USD",
        paidBy: typeof draft.paidBy === "string" ? draft.paidBy : userId,
        multiplePayers: draft.multiplePayers === true,
        contributionInputs: Object.keys(stringRecord(draft.contributionInputs)).length > 0 ? stringRecord(draft.contributionInputs) : { [userId]: "" },
        splitType,
        category,
        categoryDetail: typeof draft.categoryDetail === "string" ? draft.categoryDetail : "",
        customOverrides: stringRecord(draft.customOverrides),
        itemDrafts: Array.isArray(draft.itemDrafts) ? draft.itemDrafts.flatMap((item) =>
          item && typeof item.id === "string"
            ? [{
                id: item.id,
                name: typeof item.name === "string" ? item.name : "",
                amount: typeof item.amount === "string" ? item.amount : "",
                memberIds: Array.isArray(item.memberIds) ? item.memberIds.filter((id): id is string => typeof id === "string") : [],
              }]
            : [],
        ) : [],
        includedMemberIds: Array.isArray(draft.includedMemberIds) ? draft.includedMemberIds.filter((id): id is string => typeof id === "string") : [],
        date: typeof draft.date === "string" ? draft.date : new Date().toISOString().slice(0, 10),
        dueDate: typeof draft.dueDate === "string" ? draft.dueDate : "",
      }];
    });
  } catch {
    return [];
  }
}

export function saveOfflineExpenseDraft(draft: OfflineExpenseDraft): OfflineExpenseDraft[] {
  const current = loadOfflineExpenseDrafts(draft.userId);
  const next = [draft, ...current.filter((item) => item.id !== draft.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  localStorage.setItem(storageKey(draft.userId), JSON.stringify(next));
  return next;
}

export function deleteOfflineExpenseDraft(userId: string, draftId: string): OfflineExpenseDraft[] {
  const next = loadOfflineExpenseDrafts(userId).filter((draft) => draft.id !== draftId);
  localStorage.setItem(storageKey(userId), JSON.stringify(next));
  return next;
}

export function deleteOfflineExpenseDraftsForGroup(userId: string, groupId: string): OfflineExpenseDraft[] {
  const next = loadOfflineExpenseDrafts(userId).filter((draft) => draft.groupId !== groupId);
  localStorage.setItem(storageKey(userId), JSON.stringify(next));
  return next;
}
