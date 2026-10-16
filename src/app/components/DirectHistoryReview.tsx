import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, CreditCard, Receipt, X } from "lucide-react";
import type { DirectHistoryDispute, Group, Member } from "./types";
import { formatCurrency, generateId, getMemberById } from "./utils";

interface Props {
  open: boolean;
  group: Group;
  member: Member;
  onClose: () => void;
  onComplete: (group: Group) => Promise<void> | void;
}

type ReviewItem = {
  key: string;
  entityType: "expense" | "payment";
  entityId: string;
  label: string;
  detail: string;
  amount: number;
};

export function DirectHistoryReview({ open, group, member, onClose, onComplete }: Props) {
  const [flagged, setFlagged] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const items = useMemo<ReviewItem[]>(() => {
    const expenses = group.expenses.map((expense) => ({
      key: `expense:${expense.id}`,
      entityType: "expense" as const,
      entityId: expense.id,
      label: expense.description,
      detail: `Paid by ${getMemberById(group, expense.paidBy)?.name ?? "a member"} · ${expense.date}`,
      amount: expense.amount,
    }));
    const payments = (group.payments ?? [])
      .filter((payment) => payment.status === "confirmed" || payment.status === "pending")
      .map((payment) => ({
        key: `payment:${payment.id}`,
        entityType: "payment" as const,
        entityId: payment.id,
        label: `${getMemberById(group, payment.fromMemberId)?.name ?? "A member"} paid ${getMemberById(group, payment.toMemberId)?.name ?? "a member"}`,
        detail: `${payment.method} · ${payment.status === "confirmed" ? "confirmed" : "awaiting confirmation"} · ${new Date(payment.submittedAt).toLocaleDateString()}`,
        amount: payment.amount,
      }));
    return [...expenses, ...payments];
  }, [group]);

  function toggle(item: ReviewItem) {
    setFlagged((current) => {
      const next = { ...current };
      if (item.key in next) delete next[item.key];
      else next[item.key] = "";
      return next;
    });
    setError("");
  }

  async function completeReview() {
    const selected = items.filter((item) => item.key in flagged);
    if (selected.some((item) => !flagged[item.key]?.trim())) {
      setError("Add a reason for every item you flagged.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const disputes: DirectHistoryDispute[] = selected.map((item) => ({
        id: generateId(),
        entityType: item.entityType,
        entityId: item.entityId,
        entityLabel: item.label,
        reason: flagged[item.key].trim(),
        raisedBy: member.id,
        raisedAt: now,
        status: "open",
      }));
      await onComplete({
        ...group,
        directStatus: "active",
        directReviewedBy: member.id,
        directReviewedAt: now,
        directHistoryReviewedBy: member.id,
        directHistoryReviewedAt: now,
        directHistoryDisputes: [...(group.directHistoryDisputes ?? []), ...disputes],
        participantUids: [...new Set(group.members.flatMap((candidate) => candidate.uid ? [candidate.uid] : []))].sort(),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[90] max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(92vw,42rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border md:border-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Review before continuing</p>
              <Dialog.Title className="mt-1 text-xl font-semibold text-foreground">Check your earlier history</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                These were recorded before you joined. Accept them, or flag only the entries you want to discuss. Flagging does not erase anything.
              </Dialog.Description>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Close review"><X size={18} /></button>
          </div>

          <div className="mt-5 space-y-3">
            {items.length === 0 && <div className="rounded-2xl border border-border p-5 text-center text-sm text-muted-foreground">There is no earlier activity to review.</div>}
            {items.map((item) => {
              const isFlagged = item.key in flagged;
              return (
                <div key={item.key} className={`rounded-2xl border p-4 ${isFlagged ? "border-amber-300 bg-amber-50" : "border-border bg-card"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${isFlagged ? "bg-amber-100 text-amber-700" : "bg-accent text-primary"}`}>
                      {item.entityType === "expense" ? <Receipt size={17} /> : <CreditCard size={17} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{item.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">{formatCurrency(item.amount, group.currency)}</p>
                  </div>
                  <button type="button" onClick={() => toggle(item)} className={`mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${isFlagged ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                    <AlertTriangle size={14} /> {isFlagged ? "Remove flag" : "I don’t agree"}
                  </button>
                  {isFlagged && (
                    <textarea value={flagged[item.key]} onChange={(event) => setFlagged((current) => ({ ...current, [item.key]: event.target.value }))} placeholder="Explain what looks incorrect" rows={2} className="mt-3 w-full resize-none rounded-xl border border-amber-300 bg-card px-3 py-2.5 text-sm outline-none focus:border-primary" />
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <button type="button" disabled={saving} onClick={() => void completeReview()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            <Check size={17} /> {Object.keys(flagged).length ? `Continue with ${Object.keys(flagged).length} flagged` : "Accept history and continue"}
          </button>
          <p className="mt-3 text-center text-xs text-muted-foreground">After this review, both of you can continue tracking and settling normally.</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
