import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteOfflineExpenseDraft, deleteOfflineExpenseDraftsForGroup, loadOfflineExpenseDrafts, saveOfflineExpenseDraft, type OfflineExpenseDraft } from "./offlineExpenseDrafts";

const values = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
});

function draft(id: string, updatedAt: string): OfflineExpenseDraft {
  return {
    id, groupId: "group", userId: "user", updatedAt, description: id, notes: "", amount: "100",
    foreignCurrencyOpen: false, originalAmount: "", originalCurrency: "USD", paidBy: "user",
    multiplePayers: false, contributionInputs: { user: "" }, splitType: "equal", category: "food",
    categoryDetail: "", customOverrides: {}, itemDrafts: [], includedMemberIds: ["user", "friend"],
    date: "2026-10-28", dueDate: "",
  };
}

describe("offline expense drafts", () => {
  beforeEach(() => values.clear());

  it("saves, updates, sorts, and deletes drafts without mixing users", () => {
    saveOfflineExpenseDraft(draft("older", "2026-10-28T01:00:00.000Z"));
    saveOfflineExpenseDraft(draft("newer", "2026-10-28T02:00:00.000Z"));
    expect(loadOfflineExpenseDrafts("user").map((item) => item.id)).toEqual(["newer", "older"]);

    saveOfflineExpenseDraft({ ...draft("older", "2026-10-28T03:00:00.000Z"), description: "Updated" });
    expect(loadOfflineExpenseDrafts("user").map((item) => item.description)).toEqual(["Updated", "newer"]);
    expect(loadOfflineExpenseDrafts("another-user")).toEqual([]);

    deleteOfflineExpenseDraft("user", "older");
    expect(loadOfflineExpenseDrafts("user").map((item) => item.id)).toEqual(["newer"]);
  });

  it("repairs partial drafts instead of crashing the expense screen", () => {
    values.set("bayadtayoopo:offline-expense-drafts:user", JSON.stringify([
      { id: "partial", groupId: "group", userId: "user", itemDrafts: [{}] },
    ]));
    expect(loadOfflineExpenseDrafts("user")[0]).toMatchObject({
      id: "partial",
      description: "",
      amount: "",
      splitType: "equal",
      category: "food",
      itemDrafts: [],
    });
  });

  it("can recover one broken group without deleting drafts for another group", () => {
    saveOfflineExpenseDraft(draft("one", "2026-10-28T01:00:00.000Z"));
    saveOfflineExpenseDraft({ ...draft("two", "2026-10-28T02:00:00.000Z"), groupId: "another-group" });
    expect(deleteOfflineExpenseDraftsForGroup("user", "group").map((item) => item.id)).toEqual(["two"]);
  });
});
