import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BellRing, CalendarClock, Check, ChevronRight, Pause, Play, Send, X } from "lucide-react";
import type { Balance, Group, Member, PaymentSchedule, PaymentScheduleFrequency } from "./types";
import { formatCurrency, generateId, getMemberById } from "./utils";
import {
  coveredByOpenSchedule,
  createPaymentSchedule,
  directSharesOwedTo,
  frequencyLabel,
  openSchedulesBetween,
  scheduleTotal,
} from "./paymentSchedules";

interface Props {
  group: Group;
  currentMember: Member;
  balanceMember: Member;
  balance: Balance;
  expanded: boolean;
  onUpdate: (group: Group) => Promise<void> | void;
  onSendNow: () => void;
}

function initialDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function statusLabel(schedule: PaymentSchedule, currentMemberId: string): string {
  if (schedule.status === "proposed") {
    return (schedule.awaitingMemberId ?? schedule.debtorMemberId) === currentMemberId
      ? "Needs your response"
      : "Waiting for response";
  }
  if (schedule.status === "paused") return "Reminders paused";
  if (schedule.status === "active") return "Active";
  if (schedule.status === "declined") return "Declined";
  if (schedule.status === "withdrawn") return "Withdrawn";
  if (schedule.status === "ended") return "Ended";
  return "Completed";
}

export function PaymentScheduleManager({
  group,
  currentMember,
  balanceMember,
  balance,
  expanded,
  onUpdate,
  onSendNow,
}: Props) {
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [scope, setScope] = useState<"balance" | "expenses">("balance");
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [frequency, setFrequency] = useState<PaymentScheduleFrequency>("monthly");
  const [firstPaymentDate, setFirstPaymentDate] = useState(initialDate);
  const [message, setMessage] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const pairSchedules = (group.paymentSchedules ?? []).filter(
    (schedule) =>
      ((schedule.payeeMemberId === currentMember.id && schedule.debtorMemberId === balanceMember.id) ||
        (schedule.payeeMemberId === balanceMember.id && schedule.debtorMemberId === currentMember.id)),
  );
  const schedules = openSchedulesBetween(group, currentMember.id, balanceMember.id);
  const history = pairSchedules.filter(
    (schedule) => !["proposed", "active", "paused"].includes(schedule.status),
  );
  const availableShares = useMemo(() => {
    const covered = coveredByOpenSchedule(group);
    return directSharesOwedTo(group, balanceMember.id, currentMember.id).filter(
      (share) => !covered.has(`${balanceMember.id}:${share.expenseId}`),
    );
  }, [balanceMember.id, currentMember.id, group]);
  const canPropose = availableShares.length > 0;
  const selectedSchedule = pairSchedules.find((item) => item.id === selectedScheduleId) ?? schedules[0] ?? history[0];

  function openProposal() {
    const expenseIds = availableShares.flatMap((share) => share.expenseId ? [share.expenseId] : []);
    const total = availableShares.reduce((sum, share) => sum + share.amount, 0);
    setScope("balance");
    setSelectedExpenseIds(expenseIds);
    setInstallmentAmount(total ? String(Math.min(total, Math.max(1, Math.round((total / 3) * 100) / 100))) : "");
    setFrequency("monthly");
    setFirstPaymentDate(initialDate());
    setMessage("");
    setEditingScheduleId("");
    setError("");
    setChoicesOpen(false);
    setFormOpen(true);
  }

  function openScheduleEdit(schedule: PaymentSchedule) {
    setEditingScheduleId(schedule.id);
    setInstallmentAmount(String(schedule.installmentAmount));
    setFrequency(schedule.frequency);
    setFirstPaymentDate(schedule.firstPaymentDate);
    setMessage(schedule.message ?? "");
    setError("");
    setDetailsOpen(false);
    setFormOpen(true);
  }

  async function saveProposal() {
    setError("");
    setSaving(true);
    try {
      const editing = (group.paymentSchedules ?? []).find(
        (schedule) => schedule.id === editingScheduleId,
      );
      if (editing) {
        const amount = Number(installmentAmount);
        const total = scheduleTotal(editing);
        if (!Number.isFinite(amount) || amount <= 0 || amount > total + 0.005) {
          throw new Error("Enter an installment amount up to the covered balance.");
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(firstPaymentDate)) {
          throw new Error("Choose the first payment date.");
        }
        const now = new Date().toISOString();
        const otherMemberId = editing.payeeMemberId === currentMember.id
          ? editing.debtorMemberId
          : editing.payeeMemberId;
        await onUpdate({
          ...group,
          paymentSchedules: (group.paymentSchedules ?? []).map((schedule) =>
            schedule.id === editing.id
              ? {
                  ...schedule,
                  installmentAmount: Math.round(amount * 100) / 100,
                  frequency,
                  firstPaymentDate,
                  message: message.trim() || undefined,
                  status: "proposed",
                  proposedBy: currentMember.id,
                  awaitingMemberId: otherMemberId,
                  updatedAt: now,
                  activity: [
                    ...schedule.activity,
                    { id: generateId(), type: "edited", actorMemberId: currentMember.id, at: now },
                  ],
                }
              : schedule,
          ),
        });
        setSelectedScheduleId(editing.id);
        setFormOpen(false);
        setDetailsOpen(true);
        return;
      }
      const ids = scope === "balance"
        ? availableShares.flatMap((share) => share.expenseId ? [share.expenseId] : [])
        : selectedExpenseIds;
      const schedule = createPaymentSchedule({
        payeeMemberId: currentMember.id,
        debtorMemberId: balanceMember.id,
        shares: availableShares,
        selectedExpenseIds: ids,
        installmentAmount: Number(installmentAmount),
        frequency,
        firstPaymentDate,
        message,
      });
      await onUpdate({
        ...group,
        paymentSchedules: [...(group.paymentSchedules ?? []), schedule],
      });
      setSelectedScheduleId(schedule.id);
      setFormOpen(false);
      setDetailsOpen(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this proposal.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: PaymentSchedule["status"], type: PaymentSchedule["activity"][number]["type"]) {
    if (!selectedSchedule || saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    try {
      await onUpdate({
        ...group,
        paymentSchedules: (group.paymentSchedules ?? []).map((schedule) =>
          schedule.id === selectedSchedule.id
            ? {
                ...schedule,
                status,
                updatedAt: now,
                respondedAt: ["active", "declined"].includes(status) ? now : schedule.respondedAt,
                respondedBy: ["active", "declined"].includes(status) ? currentMember.id : schedule.respondedBy,
                awaitingMemberId: ["active", "declined"].includes(status) ? undefined : schedule.awaitingMemberId,
                activity: [
                  ...schedule.activity,
                  { id: generateId(), type, actorMemberId: currentMember.id, at: now },
                ],
              }
            : schedule,
        ),
      });
      if (["declined", "withdrawn", "ended"].includes(status)) setDetailsOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function viewSchedule(schedule: PaymentSchedule) {
    setSelectedScheduleId(schedule.id);
    setDetailsOpen(true);
  }

  const attention = schedules.find(
    (schedule) => schedule.status === "proposed" && (schedule.awaitingMemberId ?? schedule.debtorMemberId) === currentMember.id,
  ) ?? schedules.find((schedule) => schedule.status === "proposed") ?? schedules[0];

  return (
    <>
      {attention && (
        <button
          type="button"
          onClick={() => viewSchedule(attention)}
          className={`mx-4 mb-3 flex w-[calc(100%-2rem)] items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
            attention.status === "proposed" && (attention.awaitingMemberId ?? attention.debtorMemberId) === currentMember.id
              ? "bg-amber-50 text-amber-800"
              : attention.status === "active"
                ? "bg-green-50 text-green-800"
                : "bg-primary/10 text-primary"
          }`}
        >
          <CalendarClock size={17} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{statusLabel(attention, currentMember.id)}</p>
            <p className="truncate text-[11px] opacity-80">
              {formatCurrency(attention.installmentAmount, group.currency)} {frequencyLabel(attention.frequency)}
              {schedules.length > 1 ? ` · +${schedules.length - 1} more` : ""}
            </p>
          </div>
          <ChevronRight size={15} />
        </button>
      )}

      {expanded && schedules.length > 0 && (
        <div className="mx-4 mb-3 rounded-xl border border-border p-3">
          <p className="text-xs font-semibold text-foreground">Payment schedules · {schedules.length}</p>
          <div className="mt-2 space-y-2">
            {schedules.map((schedule) => (
              <button key={schedule.id} type="button" onClick={() => viewSchedule(schedule)} className="flex w-full items-center justify-between gap-3 text-left">
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground">
                    {schedule.coverage.length === 1 ? schedule.coverage[0].expenseDescription : `${schedule.coverage.length} expenses`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{statusLabel(schedule, currentMember.id)}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-primary">
                  {formatCurrency(schedule.installmentAmount, group.currency)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {expanded && history.length > 0 && (
        <button type="button" onClick={() => viewSchedule(history[0])} className="mx-4 mb-3 text-xs font-semibold text-muted-foreground">
          View schedule history ({history.length})
        </button>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        {canPropose ? (
          <button type="button" onClick={() => setChoicesOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">
            <BellRing size={12} /> Send reminder
          </button>
        ) : (
          <button type="button" onClick={onSendNow} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">
            <Send size={12} /> {balance.net < 0 ? "Send reminder" : "Share update"}
          </button>
        )}
      </div>

      <Dialog.Root open={choicesOpen} onOpenChange={setChoicesOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-center justify-between">
              <div><Dialog.Title className="text-lg font-semibold">Remind {balanceMember.name}</Dialog.Title><Dialog.Description className="text-xs text-muted-foreground">Choose a one-time reminder or suggest installments.</Dialog.Description></div>
              <Dialog.Close className="rounded-full p-2 hover:bg-muted"><X size={18} /></Dialog.Close>
            </div>
            <div className="mt-5 space-y-2">
              <button type="button" onClick={() => { setChoicesOpen(false); onSendNow(); }} className="w-full rounded-2xl border border-border p-4 text-left">
                <p className="text-sm font-semibold">Send reminder now</p><p className="mt-1 text-xs text-muted-foreground">Share the usual balance reminder once.</p>
              </button>
              <button type="button" onClick={openProposal} className="w-full rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left">
                <p className="text-sm font-semibold text-primary">Suggest payment schedule</p><p className="mt-1 text-xs text-muted-foreground">Propose an amount and frequency for expenses owed directly to you.</p>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={formOpen} onOpenChange={setFormOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-center justify-between"><div><Dialog.Title className="text-lg font-semibold">{editingScheduleId ? "Suggest schedule changes" : "Suggest payment schedule"}</Dialog.Title><Dialog.Description className="text-xs text-muted-foreground">The other person must accept before these terms become active.</Dialog.Description></div><Dialog.Close className="rounded-full p-2"><X size={18} /></Dialog.Close></div>
            <div className="mt-5 space-y-4">
              {!editingScheduleId && <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1.5">
                <button type="button" onClick={() => { setScope("balance"); setSelectedExpenseIds(availableShares.flatMap((share) => share.expenseId ? [share.expenseId] : [])); }} className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${scope === "balance" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Balance owed to you</button>
                <button type="button" onClick={() => { setScope("expenses"); setSelectedExpenseIds([]); }} className={`rounded-xl px-3 py-2.5 text-xs font-semibold ${scope === "expenses" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Specific expenses</button>
              </div>}
              {!editingScheduleId && scope === "expenses" && <div className="overflow-hidden rounded-2xl border border-border">{availableShares.map((share) => <label key={share.expenseId} className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0"><input type="checkbox" checked={!!share.expenseId && selectedExpenseIds.includes(share.expenseId)} onChange={(event) => setSelectedExpenseIds((current) => event.target.checked ? [...current, share.expenseId!] : current.filter((id) => id !== share.expenseId))} /><span className="min-w-0 flex-1 truncate text-sm">{share.expenseDescription}</span><span className="text-xs font-semibold">{formatCurrency(share.amount, group.currency)}</span></label>)}</div>}
              {!editingScheduleId && scope === "balance" && <p className="rounded-xl bg-accent p-3 text-xs text-muted-foreground">Covers the current {formatCurrency(availableShares.reduce((sum, share) => sum + share.amount, 0), group.currency)} owed directly to you across {availableShares.length} expense{availableShares.length === 1 ? "" : "s"}. New expenses will not be added automatically.</p>}
              {editingScheduleId && <p className="rounded-xl bg-accent p-3 text-xs text-muted-foreground">The covered expenses stay unchanged. Your new amount and timing will be sent as a counterproposal.</p>}
              <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Suggested installment</span><input type="number" min="0.01" step="0.01" value={installmentAmount} onChange={(event) => setInstallmentAmount(event.target.value)} className="w-full rounded-xl border border-border bg-input-background px-3 py-3 text-sm outline-none focus:border-primary" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Frequency</span><select value={frequency} onChange={(event) => setFrequency(event.target.value as PaymentScheduleFrequency)} className="w-full rounded-xl border border-border bg-input-background px-3 py-3 text-sm"><option value="weekly">Every week</option><option value="biweekly">Every two weeks</option><option value="monthly">Every month</option></select></label>
              <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">First suggested payment</span><input type="date" value={firstPaymentDate} onChange={(event) => setFirstPaymentDate(event.target.value)} className="w-full rounded-xl border border-border bg-input-background px-3 py-3 text-sm" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Message (optional)</span><textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} className="w-full resize-none rounded-xl border border-border bg-input-background px-3 py-3 text-sm" placeholder="Add a friendly note" /></label>
              {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
              <button type="button" disabled={saving} onClick={() => void saveProposal()} className="w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? "Sending…" : editingScheduleId ? "Send changes" : "Send proposal"}</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl">
            {selectedSchedule && <>
              <div className="flex items-center justify-between"><div><Dialog.Title className="text-lg font-semibold">Payment schedule</Dialog.Title><Dialog.Description className="text-xs text-muted-foreground">{statusLabel(selectedSchedule, currentMember.id)}</Dialog.Description></div><Dialog.Close className="rounded-full p-2"><X size={18} /></Dialog.Close></div>
              <div className="mt-5 rounded-2xl bg-accent p-4"><p className="text-xl font-bold text-primary">{formatCurrency(selectedSchedule.installmentAmount, group.currency)}</p><p className="mt-1 text-sm">{frequencyLabel(selectedSchedule.frequency)} · starts {new Date(`${selectedSchedule.firstPaymentDate}T00:00:00`).toLocaleDateString()}</p><p className="mt-1 text-xs text-muted-foreground">Covers {formatCurrency(scheduleTotal(selectedSchedule), group.currency)} across {selectedSchedule.coverage.length} expense{selectedSchedule.coverage.length === 1 ? "" : "s"}</p></div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-border">{selectedSchedule.coverage.map((item) => <div key={item.expenseId} className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 text-sm last:border-0"><span className="min-w-0 flex-1 truncate">{item.expenseDescription}</span><span className="font-semibold">{formatCurrency(item.amount, group.currency)}</span></div>)}</div>
              {selectedSchedule.message && <p className="mt-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">“{selectedSchedule.message}”</p>}
              <div className="mt-4 rounded-2xl border border-border p-3">
                <p className="text-xs font-semibold text-foreground">Schedule activity</p>
                <div className="mt-2 space-y-2">
                  {[...selectedSchedule.activity].reverse().map((item) => {
                    const actor = getMemberById(group, item.actorMemberId);
                    const action = item.type === "created" ? "created the proposal" : item.type === "edited" ? "suggested changes" : item.type;
                    return <p key={item.id} className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">{actor?.id === currentMember.id ? "You" : actor?.name ?? "A member"}</span> {action} · {new Date(item.at).toLocaleString()}</p>;
                  })}
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {selectedSchedule.status === "proposed" && (selectedSchedule.awaitingMemberId ?? selectedSchedule.debtorMemberId) === currentMember.id && <><div className="grid grid-cols-2 gap-2"><button disabled={saving} onClick={() => void changeStatus("declined", "declined")} className="rounded-xl bg-muted py-3 text-sm font-semibold">Decline</button><button disabled={saving} onClick={() => void changeStatus("active", "accepted")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"><Check size={16} /> Accept</button></div><button disabled={saving} onClick={() => openScheduleEdit(selectedSchedule)} className="w-full rounded-xl border border-primary/30 py-3 text-sm font-semibold text-primary">Suggest changes</button></>}
                {selectedSchedule.status === "proposed" && (selectedSchedule.awaitingMemberId ?? selectedSchedule.debtorMemberId) !== currentMember.id && <div className="grid grid-cols-2 gap-2"><button disabled={saving} onClick={() => openScheduleEdit(selectedSchedule)} className="rounded-xl border border-primary/30 py-3 text-sm font-semibold text-primary">Edit proposal</button><button disabled={saving} onClick={() => void changeStatus("withdrawn", "withdrawn")} className="rounded-xl bg-muted py-3 text-sm font-semibold text-destructive">Withdraw</button></div>}
                {selectedSchedule.status === "active" && <div className="grid grid-cols-2 gap-2"><button disabled={saving} onClick={() => void changeStatus("paused", "paused")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-muted py-3 text-sm font-semibold"><Pause size={15} /> Pause reminders</button><button disabled={saving} onClick={() => void changeStatus("ended", "ended")} className="rounded-xl bg-destructive/10 py-3 text-sm font-semibold text-destructive">End schedule</button></div>}
                {selectedSchedule.status === "paused" && <div className="grid grid-cols-2 gap-2"><button disabled={saving} onClick={() => void changeStatus("active", "resumed")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"><Play size={15} /> Resume</button><button disabled={saving} onClick={() => void changeStatus("ended", "ended")} className="rounded-xl bg-destructive/10 py-3 text-sm font-semibold text-destructive">End schedule</button></div>}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">This schedule never records a payment automatically. Confirmed payments count only when they cover one of the listed expenses.</p>
            </>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
