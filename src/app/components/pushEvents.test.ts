import { describe, expect, it } from "vitest";
import type { Group } from "./types";
import { collectPushEvents } from "./pushEvents";

const base: Group = {
  id: "trip",
  name: "Trip",
  members: [
    { id: "alice-member", uid: "alice", name: "Alice", color: "#111" },
    { id: "bob-member", uid: "bob", name: "Bob", color: "#222" },
  ],
  expenses: [],
  messages: [],
  payments: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  currency: "PHP",
};

describe("push event collection", () => {
  it("collects only events performed by the current user", () => {
    const after: Group = {
      ...base,
      messages: [
        {
          id: "alice-message",
          memberId: "alice-member",
          text: "Hello",
          createdAt: "2026-07-02T01:00:00.000Z",
        },
        {
          id: "bob-message",
          memberId: "bob-member",
          text: "Hi",
          createdAt: "2026-07-02T02:00:00.000Z",
        },
      ],
    };

    expect(collectPushEvents(base, after, "alice")).toEqual([
      {
        type: "chat_message",
        entityId: "alice-message",
        occurredAt: "2026-07-02T01:00:00.000Z",
      },
    ]);
  });

  it("collects payment lifecycle transitions", () => {
    const pending: Group = {
      ...base,
      payments: [
        {
          id: "pay",
          fromMemberId: "alice-member",
          toMemberId: "bob-member",
          amount: 100,
          method: "GCash",
          allocations: [],
          status: "pending",
          submittedAt: "2026-07-02T01:00:00.000Z",
          submittedBy: "alice-member",
        },
      ],
    };
    const confirmed: Group = {
      ...pending,
      payments: [
        {
          ...pending.payments![0],
          status: "confirmed",
          reviewedAt: "2026-07-02T02:00:00.000Z",
          reviewedBy: "bob-member",
        },
      ],
    };

    expect(collectPushEvents(base, pending, "alice")[0]?.type).toBe(
      "payment_submitted",
    );
    expect(collectPushEvents(pending, confirmed, "bob")[0]?.type).toBe(
      "payment_confirmed",
    );
  });

  it("collects balance offset request and approval transitions", () => {
    const pending: Group = {
      ...base,
      balanceOffsets: [
        {
          id: "offset",
          requesterMemberId: "alice-member",
          counterpartyMemberId: "bob-member",
          amount: 50,
          debitAllocations: [],
          creditAllocations: [],
          status: "pending",
          requestedAt: "2026-07-02T01:00:00.000Z",
          requestedBy: "alice-member",
        },
      ],
    };
    const confirmed: Group = {
      ...pending,
      balanceOffsets: [
        {
          ...pending.balanceOffsets![0],
          status: "confirmed",
          reviewedAt: "2026-07-02T02:00:00.000Z",
          reviewedBy: "bob-member",
        },
      ],
    };
    expect(collectPushEvents(base, pending, "alice")[0]?.type).toBe(
      "balance_offset_requested",
    );
    expect(collectPushEvents(pending, confirmed, "bob")[0]?.type).toBe(
      "balance_offset_confirmed",
    );
  });
});
