import { describe, expect, it } from "vitest";
import type {
  ChatMessage,
  DeletedExpense,
  Expense,
  Group,
  GroupPayment,
  Member,
} from "./types";
import { compactGroupHistory, mergeGroupChanges } from "./groupMerge";

const members: Member[] = [
  { id: "alice", uid: "alice", name: "Alice", color: "#111111" },
  { id: "bob", uid: "bob", name: "Bob", color: "#222222" },
];

function expense(id: string, amount = 30): Expense {
  return {
    id,
    description: id,
    amount,
    paidBy: "alice",
    createdBy: "alice",
    splitType: "equal",
    category: "food",
    date: "2026-01-01T00:00:00.000Z",
    splits: [
      { memberId: "alice", amount: amount / 2 },
      { memberId: "bob", amount: amount / 2 },
    ],
  };
}

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    name: "Trip",
    adminId: "alice",
    members,
    expenses: [expense("expense-1")],
    createdAt: "2026-01-01T00:00:00.000Z",
    currency: "PHP",
    ...overrides,
  };
}

describe("group merge business logic", () => {
  it("applies local scalar changes while preserving latest concurrent additions", () => {
    const base = group({ avatarSeed: "old-avatar" });
    const changed = group({
      name: "Beach Trip",
      currency: "USD",
      avatarSeed: "new-avatar",
    });
    const latest = group({
      members: [
        ...members,
        { id: "carol", uid: "carol", name: "Carol", color: "#333333" },
      ],
      expenses: [expense("expense-1"), expense("expense-2", 50)],
    });

    expect(mergeGroupChanges(base, changed, latest)).toMatchObject({
      name: "Beach Trip",
      currency: "USD",
      avatarSeed: "new-avatar",
      members: [
        { id: "alice" },
        { id: "bob" },
        { id: "carol" },
      ],
      expenses: [{ id: "expense-1" }, { id: "expense-2" }],
    });
  });

  it("keeps latest additions when local changes delete an older item", () => {
    const base = group({ expenses: [expense("expense-1"), expense("expense-2")] });
    const changed = group({ expenses: [expense("expense-2")] });
    const latest = group({
      expenses: [expense("expense-1"), expense("expense-2"), expense("expense-3")],
    });

    expect(mergeGroupChanges(base, changed, latest).expenses.map((item) => item.id))
      .toEqual(["expense-2", "expense-3"]);
  });

  it("persists admin promotions and demotions during sync", () => {
    const base = group({ adminIds: ["alice"] });
    const promoted = group({ adminIds: ["alice", "bob"] });

    expect(
      mergeGroupChanges(base, promoted, base).adminIds,
    ).toEqual(["alice", "bob"]);
    expect(
      mergeGroupChanges(promoted, base, promoted).adminIds,
    ).toEqual(["alice"]);
  });

  it("appends local messages and deleted expense records without dropping latest records", () => {
    const base = group({
      messages: [message("message-1", 1)],
      deletedExpenses: [deletedExpense("expense-1", 1)],
    });
    const changed = group({
      messages: [message("message-1", 1), message("message-2", 2)],
      deletedExpenses: [
        deletedExpense("expense-1", 1),
        deletedExpense("expense-2", 2),
      ],
    });
    const latest = group({
      messages: [message("message-1", 1), message("message-3", 3)],
      deletedExpenses: [
        deletedExpense("expense-1", 1),
        deletedExpense("expense-3", 3),
      ],
    });

    const merged = mergeGroupChanges(base, changed, latest);

    expect(merged.messages?.map((item) => item.id)).toEqual([
      "message-1",
      "message-2",
      "message-3",
    ]);
    expect(merged.deletedExpenses?.map((item) => item.expenseId)).toEqual([
      "expense-1",
      "expense-2",
      "expense-3",
    ]);
  });

  it("merges payment ledger additions and status changes by payment ID", () => {
    const original = payment("payment-1");
    const confirmed = { ...original, status: "confirmed" as const };
    const concurrent = payment("payment-2");

    const merged = mergeGroupChanges(
      group({ payments: [original] }),
      group({ payments: [confirmed] }),
      group({ payments: [original, concurrent] }),
    );

    expect(merged.payments).toEqual([confirmed, concurrent]);
  });

  it("merges balance offset additions and approvals by offset ID", () => {
    const pending = {
      id: "offset-1",
      requesterMemberId: "alice",
      counterpartyMemberId: "bob",
      amount: 10,
      debitAllocations: [],
      creditAllocations: [],
      status: "pending" as const,
      requestedAt: timestamp(1),
      requestedBy: "alice",
    };
    const confirmed = {
      ...pending,
      status: "confirmed" as const,
      reviewedAt: timestamp(2),
      reviewedBy: "bob",
    };
    const concurrent = { ...pending, id: "offset-2" };
    const merged = mergeGroupChanges(
      group({ balanceOffsets: [pending] }),
      group({ balanceOffsets: [confirmed] }),
      group({ balanceOffsets: [pending, concurrent] }),
    );
    expect(merged.balanceOffsets).toEqual([confirmed, concurrent]);
  });

  it("persists rewritten chat member references during a member merge", () => {
    const original = message("message-1", 1);
    const reassigned = {
      ...original,
      memberId: "bob",
      mentionedMemberIds: ["bob"],
      replyToMessageId: "message-earlier",
    };
    const concurrent = message("message-2", 2);

    const merged = mergeGroupChanges(
      group({ messages: [original] }),
      group({ messages: [reassigned] }),
      group({ messages: [original, concurrent] }),
    );

    expect(merged.messages).toEqual([reassigned, concurrent]);
    expect(merged.messages?.[0].replyToMessageId).toBe("message-earlier");
  });

  it("caps chat and deleted expense history to the latest records", () => {
    const compacted = compactGroupHistory(
      group({
        messages: Array.from({ length: 205 }, (_, index) =>
          message(`message-${index}`, index),
        ),
        deletedExpenses: Array.from({ length: 105 }, (_, index) =>
          deletedExpense(`expense-${index}`, index),
        ),
      }),
    );

    expect(compacted.messages).toHaveLength(200);
    expect(compacted.messages?.[0].id).toBe("message-5");
    expect(compacted.messages?.at(-1)?.id).toBe("message-204");
    expect(compacted.deletedExpenses).toHaveLength(100);
    expect(compacted.deletedExpenses?.[0].expenseId).toBe("expense-5");
    expect(compacted.deletedExpenses?.at(-1)?.expenseId).toBe("expense-104");
  });
});

function message(id: string, minute: number): ChatMessage {
  return {
    id,
    memberId: "alice",
    text: id,
    createdAt: timestamp(minute),
  };
}

function deletedExpense(expenseId: string, minute: number): DeletedExpense {
  return {
    expenseId,
    description: expenseId,
    amount: 10,
    deletedBy: "alice",
    reason: "duplicate",
    deletedAt: timestamp(minute),
  };
}

function payment(id: string): GroupPayment {
  return {
    id,
    fromMemberId: "bob",
    toMemberId: "alice",
    amount: 10,
    method: "GCash",
    allocations: [
      {
        expenseId: "expense-1",
        expenseDescription: "expense-1",
        amount: 10,
      },
    ],
    status: "pending",
    submittedAt: "2026-01-02T00:00:00.000Z",
    submittedBy: "bob",
  };
}

function timestamp(minute: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();
}
