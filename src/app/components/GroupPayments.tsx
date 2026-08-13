import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Paperclip,
  RotateCcw,
  X,
} from "lucide-react";
import type {
  Group,
  BalanceOffset,
  GroupPayment,
  Member,
  PaymentAllocation,
  Settlement,
} from "./types";
import {
  allocatePaymentToExpenses,
  buildBalanceOffsetPreview,
  createBalanceOffset,
  formatCurrency,
  generateId,
  getExpensePayerId,
  getMemberById,
  getOutstandingExpenseShares,
} from "./utils";
import {
  deletePaymentImage,
  savePaymentImage,
} from "../../lib/paymentImageService";
import { UserAvatar } from "./UserAvatar";

interface Props {
  group: Group;
  currentMember?: Member;
  settlements: Settlement[];
  focusedPaymentId?: string;
  onUpdate: (group: Group) => Promise<void> | void;
  viewPaymentImage: (imageId: string, title: string) => void;
}

interface PaymentDraft {
  fromMemberId: string;
  toMemberId: string;
  maximumAmount: number;
  flow: "expense" | "full" | "custom" | "correction";
  expenseId?: string;
  expenseDescription?: string;
  payment?: GroupPayment;
  confirmImmediately?: boolean;
}

function paymentStatusLabel(payment: GroupPayment, currentMemberId?: string) {
  switch (payment.status) {
    case "pending":
      return payment.toMemberId === currentMemberId
        ? "Review payment"
        : "Awaiting confirmation";
    case "confirmed":
      return "Confirmed";
    case "rejected":
      return "Needs correction";
    case "cancelled":
      return "Cancelled";
    case "reversed":
      return "Reversed";
  }
}

function paymentStatusClass(status: GroupPayment["status"]) {
  switch (status) {
    case "confirmed":
      return "bg-green-100 text-green-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "rejected":
    case "reversed":
      return "bg-destructive/10 text-destructive";
    case "cancelled":
      return "bg-muted text-muted-foreground";
  }
}

function paymentActivityTimestamp(payment: GroupPayment): {
  label: string;
  value: string;
} {
  switch (payment.status) {
    case "confirmed":
      return {
        label: "Confirmed",
        value: payment.reviewedAt ?? payment.submittedAt,
      };
    case "rejected":
      return {
        label: "Reviewed",
        value: payment.reviewedAt ?? payment.submittedAt,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        value: payment.cancelledAt ?? payment.submittedAt,
      };
    case "reversed":
      return {
        label: "Reversed",
        value: payment.reversedAt ?? payment.reviewedAt ?? payment.submittedAt,
      };
    case "pending":
      return { label: "Submitted", value: payment.submittedAt };
  }
}

function formatPaymentDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function offsetStatusLabel(offset: BalanceOffset, memberId?: string) {
  if (offset.status === "pending") {
    return offset.counterpartyMemberId === memberId
      ? "Review offset"
      : "Awaiting approval";
  }
  if (offset.status === "confirmed") return "Balance applied";
  if (offset.status === "rejected") return "Rejected";
  return "Cancelled";
}

function offsetTimestamp(offset: BalanceOffset) {
  if (offset.status === "cancelled") {
    return { label: "Cancelled", value: offset.cancelledAt ?? offset.requestedAt };
  }
  if (offset.status === "confirmed") {
    return { label: "Approved", value: offset.reviewedAt ?? offset.requestedAt };
  }
  if (offset.status === "rejected") {
    return { label: "Reviewed", value: offset.reviewedAt ?? offset.requestedAt };
  }
  return { label: "Requested", value: offset.requestedAt };
}

export function GroupPayments({
  group,
  currentMember,
  settlements,
  focusedPaymentId,
  onUpdate,
  viewPaymentImage,
}: Props) {
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [method, setMethod] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [note, setNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [saving, setSaving] = useState(false);
  const [chooseExpenses, setChooseExpenses] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedPaymentIds, setExpandedPaymentIds] = useState<Set<string>>(
    new Set(),
  );
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [offsetDraft, setOffsetDraft] = useState<{
    counterparty: Member;
    expenseId: string;
    expenseDescription: string;
    amount: number;
  } | null>(null);
  const [offsetError, setOffsetError] = useState("");

  const memberId = currentMember?.id;
  const relevantPayments = useMemo(
    () =>
      [...(group.payments ?? [])]
        .filter(
          (payment) =>
            payment.fromMemberId === memberId ||
            payment.toMemberId === memberId,
        )
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [group.payments, memberId],
  );
  const activePayments = relevantPayments.filter(
    (payment) => payment.status === "pending" || payment.status === "rejected",
  );
  const historicalPayments = relevantPayments.filter(
    (payment) =>
      payment.status === "confirmed" ||
      payment.status === "cancelled" ||
      payment.status === "reversed",
  );
  const relevantOffsets = useMemo(
    () =>
      [...(group.balanceOffsets ?? [])]
        .filter(
          (offset) =>
            offset.requesterMemberId === memberId ||
            offset.counterpartyMemberId === memberId,
        )
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [group.balanceOffsets, memberId],
  );
  const visiblePayments = paymentHistoryOpen
    ? [...activePayments, ...historicalPayments]
    : activePayments;
  const expensePaymentOptions = useMemo(
    () =>
      memberId
        ? getOutstandingExpenseShares(group, memberId).flatMap((share) => {
            const expense = group.expenses.find(
              (candidate) => candidate.id === share.expenseId,
            );
            if (!expense) return [];
            const recipientId = getExpensePayerId(expense);
            if (recipientId === memberId) return [];
            const recipient = getMemberById(group, recipientId);
            return recipient ? [{ ...share, recipientId, recipient }] : [];
          })
        : [],
    [group, memberId],
  );

  const draftAmount = Math.round((parseFloat(amountInput) || 0) * 100) / 100;
  const draftAllocations = useMemo(
    () =>
      draft
        ? allocatePaymentToExpenses(
            group,
            draft.fromMemberId,
            draftAmount,
            chooseExpenses ? [...selectedExpenseIds] : undefined,
          )
        : [],
    [chooseExpenses, draft, draftAmount, group, selectedExpenseIds],
  );
  const outstandingExpenseShares = useMemo(
    () => (draft ? getOutstandingExpenseShares(group, draft.fromMemberId) : []),
    [draft, group],
  );
  const draftRecipient = draft
    ? getMemberById(group, draft.toMemberId)
    : undefined;
  const offsetPreview = useMemo(
    () =>
      offsetDraft && memberId
        ? buildBalanceOffsetPreview(
            group,
            memberId,
            offsetDraft.counterparty.id,
            offsetDraft.amount,
            offsetDraft.expenseId,
          )
        : undefined,
    [group, memberId, offsetDraft],
  );

  function resetPaymentForm(recipient?: Member) {
    setMethod(recipient?.paymentInstructions?.method ?? "");
    setReferenceNumber("");
    setNote("");
    setProofFile(null);
    setPaymentError("");
  }

  function openExpensePayment(option: (typeof expensePaymentOptions)[number]) {
    if (!memberId || !option.expenseId) return;
    setDraft({
      fromMemberId: memberId,
      toMemberId: option.recipientId,
      maximumAmount: option.amount,
      flow: "expense",
      expenseId: option.expenseId,
      expenseDescription: option.expenseDescription,
    });
    setAmountInput(option.amount.toFixed(2));
    resetPaymentForm(option.recipient);
    setChooseExpenses(true);
    setSelectedExpenseIds(new Set([option.expenseId]));
  }

  function openBalanceOffset(
    option: (typeof expensePaymentOptions)[number],
  ) {
    if (!option.expenseId) return;
    const preview = memberId
      ? buildBalanceOffsetPreview(
          group,
          memberId,
          option.recipientId,
          option.amount,
          option.expenseId,
        )
      : undefined;
    if (!preview) return;
    setOffsetDraft({
      counterparty: option.recipient,
      expenseId: option.expenseId,
      expenseDescription: option.expenseDescription,
      amount: preview.amount,
    });
    setOffsetError("");
  }

  async function submitBalanceOffset() {
    if (!offsetDraft || !currentMember) return;
    const offset = createBalanceOffset(
      group,
      currentMember.id,
      offsetDraft.counterparty.id,
      offsetDraft.amount,
      new Date().toISOString(),
      offsetDraft.expenseId,
    );
    if (!offset) {
      setOffsetError("The available reciprocal balance has changed. Please try again.");
      return;
    }
    try {
      setSaving(true);
      await onUpdate({
        ...group,
        balanceOffsets: [...(group.balanceOffsets ?? []), offset],
      });
      setOffsetDraft(null);
    } catch (error) {
      setOffsetError(
        error instanceof Error ? error.message : "Unable to request the balance offset.",
      );
    } finally {
      setSaving(false);
    }
  }

  function updateBalanceOffset(
    offsetId: string,
    update: (offset: BalanceOffset) => BalanceOffset,
  ) {
    onUpdate({
      ...group,
      balanceOffsets: (group.balanceOffsets ?? []).map((offset) =>
        offset.id === offsetId ? update(offset) : offset,
      ),
    });
  }

  function approveBalanceOffset(offset: BalanceOffset) {
    if (!currentMember || offset.counterpartyMemberId !== currentMember.id) return;
    const stillValid = buildBalanceOffsetPreview(
      {
        ...group,
        balanceOffsets: (group.balanceOffsets ?? []).filter(
          (candidate) => candidate.id !== offset.id,
        ),
      },
      offset.requesterMemberId,
      offset.counterpartyMemberId,
      offset.amount,
      offset.debitAllocations[0]?.expenseId,
    );
    if (!stillValid || stillValid.amount + 0.005 < offset.amount) {
      window.alert("This offset no longer matches the outstanding expenses.");
      return;
    }
    updateBalanceOffset(offset.id, (item) => ({
      ...item,
      status: "confirmed",
      reviewedAt: new Date().toISOString(),
      reviewedBy: currentMember.id,
      rejectionReason: undefined,
    }));
  }

  function rejectBalanceOffset(offset: BalanceOffset) {
    if (!currentMember || offset.counterpartyMemberId !== currentMember.id) return;
    const reason = window.prompt("Why are you rejecting this balance offset?")?.trim();
    if (!reason) return;
    updateBalanceOffset(offset.id, (item) => ({
      ...item,
      status: "rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: currentMember.id,
      rejectionReason: reason,
    }));
  }

  function cancelBalanceOffset(offset: BalanceOffset) {
    if (!currentMember || offset.requesterMemberId !== currentMember.id) return;
    if (!window.confirm("Cancel this pending balance offset?")) return;
    updateBalanceOffset(offset.id, (item) => ({
      ...item,
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledBy: currentMember.id,
    }));
  }

  function openPayment(
    settlement: Settlement,
    confirmImmediately = false,
    useFullAmount = true,
  ) {
    const recipient = getMemberById(group, settlement.to);
    setDraft({
      fromMemberId: settlement.from,
      toMemberId: settlement.to,
      maximumAmount: settlement.amount,
      flow: useFullAmount ? "full" : "custom",
      confirmImmediately,
    });
    setAmountInput(useFullAmount ? settlement.amount.toFixed(2) : "");
    setMethod(
      recipient?.paymentInstructions?.method ??
        (confirmImmediately ? "Cash / other" : ""),
    );
    setReferenceNumber("");
    setNote("");
    setProofFile(null);
    setChooseExpenses(false);
    setSelectedExpenseIds(new Set());
    setPaymentError("");
  }

  function openCorrection(payment: GroupPayment) {
    const currentOutstanding =
      settlements.find(
        (settlement) =>
          settlement.from === payment.fromMemberId &&
          settlement.to === payment.toMemberId,
      )?.amount ?? payment.amount;
    setDraft({
      fromMemberId: payment.fromMemberId,
      toMemberId: payment.toMemberId,
      maximumAmount: Math.max(currentOutstanding, payment.amount),
      flow: "correction",
      payment,
    });
    setAmountInput(payment.amount.toFixed(2));
    setMethod(payment.method);
    setReferenceNumber(payment.referenceNumber ?? "");
    setNote(payment.note ?? "");
    setProofFile(null);
    setChooseExpenses(false);
    setSelectedExpenseIds(new Set());
    setPaymentError("");
  }

  function closeDraft() {
    if (saving) return;
    setDraft(null);
    setPaymentError("");
  }

  function updatePayment(
    paymentId: string,
    update: (payment: GroupPayment) => GroupPayment,
  ) {
    onUpdate({
      ...group,
      payments: (group.payments ?? []).map((payment) =>
        payment.id === paymentId ? update(payment) : payment,
      ),
    });
  }

  function confirmPayment(payment: GroupPayment) {
    if (!currentMember || payment.toMemberId !== currentMember.id) return;
    const reviewedAt = new Date().toISOString();
    updatePayment(payment.id, (item) => ({
      ...item,
      status: "confirmed",
      reviewedAt,
      reviewedBy: currentMember.id,
      rejectionReason: undefined,
    }));
  }

  function rejectPayment(payment: GroupPayment) {
    if (!currentMember || payment.toMemberId !== currentMember.id) return;
    const rejectionReason = window
      .prompt("What needs to be corrected?")
      ?.trim();
    if (!rejectionReason) return;
    const reviewedAt = new Date().toISOString();
    updatePayment(payment.id, (item) => ({
      ...item,
      status: "rejected",
      reviewedAt,
      reviewedBy: currentMember.id,
      rejectionReason,
    }));
  }

  function cancelPayment(payment: GroupPayment) {
    if (!currentMember || payment.fromMemberId !== currentMember.id) return;
    if (!window.confirm("Cancel this pending payment?")) return;
    updatePayment(payment.id, (item) => ({
      ...item,
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledBy: currentMember.id,
    }));
  }

  function reversePayment(payment: GroupPayment) {
    if (!currentMember || payment.toMemberId !== currentMember.id) return;
    const reversalReason = window
      .prompt("Why are you reversing this confirmed payment?")
      ?.trim();
    if (!reversalReason) return;
    updatePayment(payment.id, (item) => ({
      ...item,
      status: "reversed",
      reversedAt: new Date().toISOString(),
      reversedBy: currentMember.id,
      reversalReason,
    }));
  }

  async function savePayment() {
    if (!draft || !currentMember) return;
    if (draftAmount <= 0) {
      setPaymentError("Enter an amount greater than zero");
      return;
    }
    if (draftAmount - draft.maximumAmount > 0.005) {
      setPaymentError(
        `The maximum remaining amount is ${formatCurrency(
          draft.maximumAmount,
          group.currency,
        )}`,
      );
      return;
    }
    if (!method.trim()) {
      setPaymentError("Enter the payment method used");
      return;
    }
    if (chooseExpenses) {
      if (selectedExpenseIds.size === 0) {
        setPaymentError("Choose at least one expense");
        return;
      }
      const selectedTotal = outstandingExpenseShares
        .filter(
          (allocation) =>
            !!allocation.expenseId &&
            selectedExpenseIds.has(allocation.expenseId),
        )
        .reduce((sum, allocation) => sum + allocation.amount, 0);
      if (draftAmount - selectedTotal > 0.005) {
        setPaymentError(
          `The selected expenses have ${formatCurrency(
            selectedTotal,
            group.currency,
          )} remaining`,
        );
        return;
      }
    }

    setSaving(true);
    setPaymentError("");
    let newProofImageId: string | undefined;
    try {
      if (proofFile) {
        newProofImageId = generateId();
        await savePaymentImage(
          group.id,
          newProofImageId,
          currentMember.uid ?? currentMember.id,
          "payment-proof",
          proofFile,
        );
      }

      const now = new Date().toISOString();
      const previous = draft.payment;
      const nextPayment: GroupPayment = {
        id: previous?.id ?? generateId(),
        fromMemberId: draft.fromMemberId,
        toMemberId: draft.toMemberId,
        amount: draftAmount,
        method: method.trim(),
        referenceNumber: referenceNumber.trim() || undefined,
        note: note.trim() || undefined,
        proofImageId: newProofImageId ?? previous?.proofImageId,
        allocations: draftAllocations,
        status: draft.confirmImmediately ? "confirmed" : "pending",
        submittedAt: now,
        submittedBy: currentMember.id,
        reviewedAt: draft.confirmImmediately ? now : undefined,
        reviewedBy: draft.confirmImmediately ? currentMember.id : undefined,
      };

      await onUpdate({
        ...group,
        payments: previous
          ? (group.payments ?? []).map((payment) =>
              payment.id === previous.id ? nextPayment : payment,
            )
          : [...(group.payments ?? []), nextPayment],
      });

      if (
        newProofImageId &&
        previous?.proofImageId &&
        previous.proofImageId !== newProofImageId
      ) {
        deletePaymentImage(group.id, previous.proofImageId).catch(() => {});
      }
      setDraft(null);
    } catch (error) {
      if (newProofImageId) {
        deletePaymentImage(group.id, newProofImageId).catch(() => {});
      }
      setPaymentError(
        error instanceof Error ? error.message : "Unable to save the payment",
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleAllocations(paymentId: string) {
    setExpandedPaymentIds((current) => {
      const next = new Set(current);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  }

  return (
    <>
      {relevantOffsets.length > 0 && (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">Balance offset activity</p>
          {relevantOffsets.map((offset) => {
            const requester = getMemberById(group, offset.requesterMemberId);
            const counterparty = getMemberById(
              group,
              offset.counterpartyMemberId,
            );
            const isRequester = offset.requesterMemberId === memberId;
            const isCounterparty = offset.counterpartyMemberId === memberId;
            const timestamp = offsetTimestamp(offset);
            const offsetOpen = expandedPaymentIds.has(offset.id);
            return (
              <article
                key={offset.id}
                id={`payment-${offset.id}`}
                className={`space-y-3 rounded-2xl border bg-card p-4 scroll-mt-4 ${
                  focusedPaymentId === offset.id
                    ? "border-primary ring-4 ring-primary/15"
                    : "border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={requester?.name ?? "Unknown"}
                    color={requester?.color ?? "var(--primary)"}
                    seed={requester?.avatarSeed}
                    uid={requester?.uid}
                    photoVersion={requester?.profileImageVersion}
                    className="h-10 w-10 shrink-0 rounded-full"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {isRequester ? "You" : requester?.name ?? "Someone"}{" "}
                      requested a balance offset with{" "}
                      {isCounterparty ? "you" : counterparty?.name ?? "a member"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      No money transfer · mutual expenses
                    </p>
                    <time
                      dateTime={timestamp.value}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                    >
                      <Clock3 size={11} aria-hidden="true" />
                      {timestamp.label} · {formatPaymentDateTime(timestamp.value)}
                    </time>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(offset.amount, group.currency)}
                    </p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${paymentStatusClass(
                        offset.status === "confirmed"
                          ? "confirmed"
                          : offset.status === "pending"
                            ? "pending"
                            : offset.status,
                      )}`}
                    >
                      {offsetStatusLabel(offset, memberId)}
                    </span>
                  </div>
                </div>

                {offset.rejectionReason && (
                  <p className="text-xs text-destructive">
                    Rejection reason: {offset.rejectionReason}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => toggleAllocations(offset.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                >
                  {offsetOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  See what this offset covers
                </button>

                {offsetOpen && (
                  <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-foreground">
                        Settles {requester?.name ?? "requester"}’s expenses
                      </p>
                      <AllocationList
                        allocations={offset.debitAllocations}
                        currency={group.currency}
                      />
                    </div>
                    <div className="border-t border-border pt-3">
                      <p className="mb-1.5 text-xs font-semibold text-foreground">
                        Deducted from {counterparty?.name ?? "counterparty"}’s balance
                      </p>
                      <AllocationList
                        allocations={offset.creditAllocations}
                        currency={group.currency}
                      />
                    </div>
                  </div>
                )}

                {offset.status === "pending" && isCounterparty && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => approveBalanceOffset(offset)}
                      className="rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white"
                    >
                      Approve offset
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectBalanceOffset(offset)}
                      className="rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {offset.status === "pending" && isRequester && (
                  <button
                    type="button"
                    onClick={() => cancelBalanceOffset(offset)}
                    className="w-full rounded-xl bg-muted py-2.5 text-sm font-medium text-muted-foreground"
                  >
                    Cancel offset request
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      {relevantPayments.length > 0 && (
        <section className="space-y-3">
          {activePayments.length > 0 && (
            <p className="text-sm text-muted-foreground">Payment activity</p>
          )}
          {historicalPayments.length > 0 && (
            <button
              type="button"
              onClick={() => setPaymentHistoryOpen((current) => !current)}
              className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left"
              aria-expanded={paymentHistoryOpen}
            >
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Payment history
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {historicalPayments.length} completed{" "}
                  {historicalPayments.length === 1 ? "record" : "records"}
                </span>
              </span>
              {paymentHistoryOpen ? (
                <ChevronUp size={17} className="text-muted-foreground" />
              ) : (
                <ChevronDown size={17} className="text-muted-foreground" />
              )}
            </button>
          )}
          {visiblePayments.map((payment) => {
            const fromMember = getMemberById(group, payment.fromMemberId);
            const toMember = getMemberById(group, payment.toMemberId);
            const isSender = payment.fromMemberId === memberId;
            const isRecipient = payment.toMemberId === memberId;
            const allocationsOpen = expandedPaymentIds.has(payment.id);
            const activityTimestamp = paymentActivityTimestamp(payment);

            return (
              <article
                key={payment.id}
                id={`payment-${payment.id}`}
                className={`rounded-2xl border bg-card p-4 space-y-3 scroll-mt-4 transition-all ${
                  focusedPaymentId === payment.id
                    ? "border-primary ring-4 ring-primary/15"
                    : "border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={fromMember?.name ?? "Unknown"}
                    color={fromMember?.color ?? "var(--primary)"}
                    seed={fromMember?.avatarSeed}
                    uid={fromMember?.uid}
                    photoVersion={fromMember?.profileImageVersion}
                    className="w-10 h-10 rounded-full shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {isSender ? "You" : (fromMember?.name ?? "Unknown")} paid{" "}
                      {isRecipient ? "you" : (toMember?.name ?? "Unknown")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {payment.method}
                      {payment.referenceNumber
                        ? ` · Ref ${payment.referenceNumber}`
                        : ""}
                    </p>
                    <time
                      dateTime={activityTimestamp.value}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                    >
                      <Clock3 size={11} aria-hidden="true" />
                      {activityTimestamp.label} ·{" "}
                      {formatPaymentDateTime(activityTimestamp.value)}
                    </time>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(payment.amount, group.currency)}
                    </p>
                    <span
                      className={`inline-flex mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${paymentStatusClass(
                        payment.status,
                      )}`}
                    >
                      {paymentStatusLabel(payment, memberId)}
                    </span>
                  </div>
                </div>

                {payment.note && (
                  <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {payment.note}
                  </p>
                )}
                {payment.rejectionReason && (
                  <p className="text-xs text-destructive">
                    Correction requested: {payment.rejectionReason}
                  </p>
                )}
                {payment.reversalReason && (
                  <p className="text-xs text-destructive">
                    Reversal reason: {payment.reversalReason}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAllocations(payment.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                  >
                    {allocationsOpen ? (
                      <ChevronUp size={13} />
                    ) : (
                      <ChevronDown size={13} />
                    )}
                    See what this payment covers
                  </button>
                  {payment.proofImageId && (
                    <button
                      type="button"
                      onClick={() =>
                        viewPaymentImage(payment.proofImageId!, "Payment proof")
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                    >
                      <Paperclip size={13} />
                      View proof
                    </button>
                  )}
                </div>

                {allocationsOpen && (
                  <AllocationList
                    allocations={payment.allocations}
                    currency={group.currency}
                  />
                )}

                {payment.status === "pending" && isRecipient && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => confirmPayment(payment)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white"
                    >
                      <Check size={15} />
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectPayment(payment)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white"
                    >
                      <X size={15} />
                      Reject
                    </button>
                  </div>
                )}
                {payment.status === "pending" && isSender && (
                  <button
                    type="button"
                    onClick={() => cancelPayment(payment)}
                    className="w-full rounded-xl bg-muted py-2.5 text-sm font-medium text-muted-foreground"
                  >
                    Cancel pending payment
                  </button>
                )}
                {payment.status === "rejected" && isSender && (
                  <button
                    type="button"
                    onClick={() => openCorrection(payment)}
                    className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
                  >
                    Correct and resubmit
                  </button>
                )}
                {payment.status === "confirmed" && isRecipient && (
                  <button
                    type="button"
                    onClick={() => reversePayment(payment)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-muted py-2.5 text-sm font-medium text-muted-foreground"
                  >
                    <RotateCcw size={14} />
                    Reverse payment
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      {expensePaymentOptions.length > 0 && (
        <section className="space-y-3">
          <div>
            <p className="text-base font-semibold text-foreground">
              What would you like to pay?
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose one expense now, or make one payment toward everything you owe below.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Pay a specific expense
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick an expense and pay its exact unpaid amount.
            </p>
          </div>
          {expensePaymentOptions.map((option) => {
            const balanceOffset = memberId
              ? buildBalanceOffsetPreview(
                  group,
                  memberId,
                  option.recipientId,
                  option.amount,
                  option.expenseId,
                )
              : undefined;
            return (
              <article
                key={option.expenseId}
                className="rounded-2xl border border-border bg-card p-4"
              >
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={option.recipient.name}
                  color={option.recipient.color}
                  seed={option.recipient.avatarSeed}
                  uid={option.recipient.uid}
                  photoVersion={option.recipient.profileImageVersion}
                  className="h-10 w-10 shrink-0 rounded-full"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {option.expenseDescription}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Pay {option.recipient.name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(option.amount, group.currency)}
                  </p>
                </div>
              </div>
              <div className={`mt-3 grid gap-2 ${balanceOffset ? "grid-cols-2" : "grid-cols-1"}`}>
                <button
                  type="button"
                  onClick={() => openExpensePayment(option)}
                  className="rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground"
                >
                  Pay expense
                </button>
                {balanceOffset && (
                  <button
                    type="button"
                    onClick={() => openBalanceOffset(option)}
                    className="rounded-xl border border-primary py-2.5 text-xs font-semibold text-primary"
                  >
                    Use balance owed to you
                  </button>
                )}
              </div>
              {balanceOffset && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {formatCurrency(balanceOffset.availableCredit, group.currency)} currently owed to you by {option.recipient.name}
                </p>
              )}
            </article>
            );
          })}
        </section>
      )}

      {settlements.length > 0 && (
        <section className="space-y-3 mt-2">
          <div>
            <p className="text-sm font-medium text-foreground">
              Make one payment
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pay everything you owe, or enter a smaller amount. We’ll show which expenses it covers.
            </p>
          </div>
          {settlements.map((settlement) => {
            const fromMember = getMemberById(group, settlement.from);
            const toMember = getMemberById(group, settlement.to);
            const isSender = settlement.from === memberId;
            const isRecipient = settlement.to === memberId;
            const confirmedInstallments = (group.payments ?? [])
              .filter(
                (payment) =>
                  payment.fromMemberId === settlement.from &&
                  payment.toMemberId === settlement.to &&
                  payment.status === "confirmed",
              )
              .reduce((sum, payment) => sum + payment.amount, 0);
            const pendingInstallments = (group.payments ?? [])
              .filter(
                (payment) =>
                  payment.fromMemberId === settlement.from &&
                  payment.toMemberId === settlement.to &&
                  payment.status === "pending",
              )
              .reduce((sum, payment) => sum + payment.amount, 0);

            return (
              <article
                key={`${settlement.from}-${settlement.to}`}
                className="rounded-2xl border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={settlement.fromName}
                    color={fromMember?.color ?? "var(--primary)"}
                    seed={fromMember?.avatarSeed}
                    uid={fromMember?.uid}
                    photoVersion={fromMember?.profileImageVersion}
                    className="w-10 h-10 rounded-full shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {isSender ? (
                        <>
                          <span>You owe </span>
                          <span style={{ color: toMember?.color }}>
                            {settlement.toName}
                          </span>
                        </>
                      ) : isRecipient ? (
                        <>
                          <span style={{ color: fromMember?.color }}>
                            {settlement.fromName}
                          </span>
                          <span> owes you</span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: fromMember?.color }}>
                            {settlement.fromName}
                          </span>{" "}
                          <span className="text-muted-foreground">owes</span>{" "}
                          <span style={{ color: toMember?.color }}>
                            {settlement.toName}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {confirmedInstallments > 0
                        ? `${formatCurrency(
                            confirmedInstallments,
                            group.currency,
                          )} confirmed · ${formatCurrency(
                            settlement.amount,
                            group.currency,
                          )} remaining`
                        : pendingInstallments > 0
                          ? `${formatCurrency(
                              pendingInstallments,
                              group.currency,
                            )} awaiting confirmation`
                          : isRecipient
                            ? "No payment received yet"
                            : "Unpaid balance"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(settlement.amount, group.currency)}
                  </p>
                </div>

                {isSender && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openPayment(settlement)}
                      className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
                    >
                      Pay full balance
                    </button>
                    <button
                      type="button"
                      onClick={() => openPayment(settlement, false, false)}
                      className="rounded-xl border border-primary py-2.5 text-sm font-semibold text-primary"
                    >
                      Enter another amount
                    </button>
                  </div>
                )}
                {isRecipient && (
                  <button
                    type="button"
                    onClick={() => openPayment(settlement, true)}
                    className="w-full rounded-xl border border-green-600 bg-green-50 py-2.5 text-sm font-semibold text-green-700"
                  >
                    I already received money
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      <Dialog.Root
        open={!!offsetDraft}
        onOpenChange={(open) => !open && !saving && setOffsetDraft(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-[60] max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Use balance owed to you
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  No money moves. {offsetDraft?.counterparty.name} must approve before both expense sides are marked settled.
                </Dialog.Description>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setOffsetDraft(null)}
                className="rounded-full p-2 hover:bg-muted disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {offsetDraft && offsetPreview && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-primary/20 bg-accent p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Offset amount</span>
                    <span className="text-lg font-semibold text-foreground">
                      {formatCurrency(offsetPreview.amount, group.currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {offsetDraft.counterparty.name} owes you now
                    </span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(offsetPreview.availableCredit, group.currency)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">Still owed after approval</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(offsetPreview.remainingCredit, group.currency)}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-foreground">
                      This settles your share
                    </p>
                    <AllocationList
                      allocations={offsetPreview.debitAllocations}
                      currency={group.currency}
                    />
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="mb-1.5 text-xs font-semibold text-foreground">
                      Deducted from {offsetDraft.counterparty.name}’s outstanding expenses
                    </p>
                    <AllocationList
                      allocations={offsetPreview.creditAllocations}
                      currency={group.currency}
                    />
                  </div>
                </div>

                {offsetError && (
                  <p className="text-xs text-destructive">{offsetError}</p>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submitBalanceOffset()}
                  className="w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {saving ? "Requesting…" : `Request approval from ${offsetDraft.counterparty.name}`}
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={!!draft}
        onOpenChange={(open) => !open && closeDraft()}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-[60] max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  {draft?.confirmImmediately
                    ? "Confirm money received"
                    : draft?.payment
                      ? "Correct payment"
                      : draft?.flow === "expense"
                        ? `Pay for ${draft.expenseDescription}`
                        : `Pay ${draftRecipient?.name ?? "your balance"}`}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground mt-1">
                  {draft?.confirmImmediately
                    ? `Use this only if ${getMemberById(group, draft.fromMemberId)?.name ?? "this member"} has already paid you outside BayadTayoOpo.`
                    : draft?.flow === "expense"
                    ? `Pay the exact remaining amount to ${draftRecipient?.name ?? "the expense payer"}. You can attach one proof.`
                    : "Enter how much you sent. We’ll show which unpaid expenses this payment covers."}
                </Dialog.Description>
              </div>
              <button
                type="button"
                onClick={closeDraft}
                className="rounded-full p-2 hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            {draft && (
              <div className="space-y-4">
                {!draft.confirmImmediately &&
                  draftRecipient?.paymentInstructions && (
                    <div className="rounded-2xl bg-accent p-4 text-xs text-muted-foreground space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        How to pay {draftRecipient.name}
                      </p>
                      <p>{draftRecipient.paymentInstructions.method}</p>
                      {draftRecipient.paymentInstructions.accountName && (
                        <p>
                          Account name:{" "}
                          {draftRecipient.paymentInstructions.accountName}
                        </p>
                      )}
                      {draftRecipient.paymentInstructions.accountIdentifier && (
                        <p>
                          Account:{" "}
                          {draftRecipient.paymentInstructions.accountIdentifier}
                        </p>
                      )}
                      {draftRecipient.paymentInstructions.instructions && (
                        <p>{draftRecipient.paymentInstructions.instructions}</p>
                      )}
                      {draftRecipient.paymentInstructions.qrCodeImageId && (
                        <button
                          type="button"
                          onClick={() =>
                            viewPaymentImage(
                              draftRecipient.paymentInstructions!
                                .qrCodeImageId!,
                              "Payment QR",
                            )
                          }
                          className="pt-1 font-medium text-primary"
                        >
                          View payment QR
                        </button>
                      )}
                    </div>
                  )}

                <div>
                  <label className="mb-1.5 block text-sm text-muted-foreground">
                    Amount
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    max={draft.maximumAmount}
                    step="0.01"
                    value={amountInput}
                    readOnly={draft.flow === "expense"}
                    onChange={(event) => {
                      setAmountInput(event.target.value);
                      setPaymentError("");
                    }}
                    className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-foreground outline-none focus:border-primary read-only:cursor-not-allowed read-only:opacity-75"
                  />
                  {draft.flow !== "expense" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[0.25, 0.5, 1].map((portion) => (
                        <button
                          key={portion}
                          type="button"
                          onClick={() =>
                            setAmountInput(
                              (
                                Math.round(
                                  draft.maximumAmount * portion * 100,
                                ) / 100
                              ).toFixed(2),
                            )
                          }
                          className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                        >
                          {portion === 1 ? "Pay full balance" : `${portion * 100}%`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm text-muted-foreground">
                    Payment method
                  </label>
                  <input
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                    placeholder="GCash, bank transfer, cash…"
                    className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm outline-none focus:border-primary"
                  />
                </div>

                <input
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  placeholder="Reference number (optional)"
                  className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm outline-none focus:border-primary"
                />
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Note (optional)"
                  className="min-h-20 w-full resize-none rounded-xl border border-border bg-input-background px-4 py-3 text-sm outline-none focus:border-primary"
                />
                <label className="block cursor-pointer rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Payment proof (optional)
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-2 block text-xs"
                    onChange={(event) =>
                      setProofFile(event.target.files?.[0] ?? null)
                    }
                  />
                </label>

                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        What this payment covers
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {chooseExpenses
                          ? "Expenses you selected"
                          : "Applied to oldest unpaid expenses first"}
                      </span>
                    </div>
                    {draft.flow !== "expense" &&
                      outstandingExpenseShares.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setChooseExpenses((current) => !current);
                            setSelectedExpenseIds(new Set());
                            setPaymentError("");
                          }}
                          className="text-xs font-medium text-primary"
                        >
                          {chooseExpenses
                            ? "Apply automatically"
                            : "Choose specific expenses"}
                        </button>
                      )}
                  </div>
                  {chooseExpenses && draft.flow !== "expense" && (
                    <div className="mb-3 space-y-1.5 border-b border-border pb-3">
                      {outstandingExpenseShares.map((share) => {
                        const expenseId = share.expenseId!;
                        const selected = selectedExpenseIds.has(expenseId);
                        return (
                          <button
                            key={expenseId}
                            type="button"
                            onClick={() =>
                              setSelectedExpenseIds((current) => {
                                const next = new Set(current);
                                if (next.has(expenseId)) next.delete(expenseId);
                                else next.add(expenseId);
                                return next;
                              })
                            }
                            className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left ${
                              selected
                                ? "border-primary bg-accent"
                                : "border-border bg-card"
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded border ${
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border"
                              }`}
                            >
                              {selected && <Check size={11} />}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                              {share.expenseDescription}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground">
                              {formatCurrency(share.amount, group.currency)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <AllocationList
                    allocations={draftAllocations}
                    currency={group.currency}
                  />
                  <div className="mt-3 flex justify-between border-t border-border pt-3 text-xs">
                    <span className="text-muted-foreground">
                      Remaining after this payment
                    </span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(
                        Math.max(0, draft.maximumAmount - draftAmount),
                        group.currency,
                      )}
                    </span>
                  </div>
                </div>

                {paymentError && (
                  <p className="text-xs text-destructive">{paymentError}</p>
                )}

                <button
                  type="button"
                  disabled={saving}
                  onClick={savePayment}
                  className="w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {saving
                    ? "Saving…"
                    : draft.confirmImmediately
                      ? "Yes, record money received"
                      : draft.payment
                        ? "Resubmit payment"
                        : "Submit payment"}
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function AllocationList({
  allocations,
  currency,
}: {
  allocations: PaymentAllocation[];
  currency: string;
}) {
  if (allocations.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Enter an amount to preview its expense allocation.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {allocations.map((allocation, index) => (
        <div
          key={`${allocation.expenseId ?? "balance"}-${index}`}
          className="flex items-center justify-between gap-3 text-xs"
        >
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {allocation.expenseDescription}
          </span>
          <span className="font-medium text-foreground">
            {formatCurrency(allocation.amount, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}
