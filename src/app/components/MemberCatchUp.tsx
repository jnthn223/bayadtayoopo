import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  CreditCard,
  MessageCircle,
  Receipt,
  WalletCards,
  X,
} from "lucide-react";
import type { Group, Member } from "./types";
import type { GroupTab } from "./GroupHeader";
import { formatCurrency } from "./utils";
import { buildMemberCatchUpSummary } from "./memberCatchUpSummary";

interface Props {
  open: boolean;
  group: Group;
  member: Member;
  onClose: () => void;
  onOpenTab: (tab: GroupTab) => void;
}

export function MemberCatchUp({
  open,
  group,
  member,
  onClose,
  onOpenTab,
}: Props) {
  const summary = buildMemberCatchUpSummary(group, member);
  const balanceLabel =
    Math.abs(summary.balance) < 0.01
      ? "You’re settled up"
      : summary.balance > 0
        ? "You’re owed"
        : "You currently owe";

  const openTab = (tab: GroupTab) => {
    onClose();
    onOpenTab(tab);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[90] max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:inset-x-4 sm:bottom-6 sm:mx-auto sm:max-w-md sm:rounded-3xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                Your member profile is connected
              </p>
              <Dialog.Title className="mt-1 text-xl font-semibold text-foreground">
                Welcome to {group.name}, {member.name}!
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Here’s what was recorded for you before you joined.
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground hover:bg-muted"
              aria-label="Close catch-up"
            >
              <X size={18} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => openTab("settle")}
            className="mt-5 flex w-full items-center gap-3 rounded-2xl bg-accent p-4 text-left"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-primary">
              <WalletCards size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted-foreground">{balanceLabel}</span>
              <span className="block text-lg font-semibold text-foreground">
                {formatCurrency(Math.abs(summary.balance), group.currency)}
              </span>
            </span>
            <span className="text-sm font-semibold text-primary">View</span>
          </button>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => openTab("expenses")}
              className="rounded-2xl border border-border bg-card p-4 text-left"
            >
              <Receipt size={18} className="text-primary" />
              <span className="mt-3 block text-xl font-semibold text-foreground">
                {summary.assignedExpenseCount}
              </span>
              <span className="text-xs text-muted-foreground">expenses assigned to you</span>
            </button>
            <button
              type="button"
              onClick={() => openTab("settle")}
              className="rounded-2xl border border-border bg-card p-4 text-left"
            >
              <CreditCard size={18} className="text-primary" />
              <span className="mt-3 block text-xl font-semibold text-foreground">
                {summary.pendingReviewCount}
              </span>
              <span className="text-xs text-muted-foreground">payments to review</span>
            </button>
            <button
              type="button"
              onClick={() => openTab("settle")}
              className="rounded-2xl border border-border bg-card p-4 text-left"
            >
              <CheckCircle2 size={18} className="text-green-600" />
              <span className="mt-3 block text-xl font-semibold text-foreground">
                {summary.adminConfirmedPaymentCount}
              </span>
              <span className="text-xs text-muted-foreground">confirmed for you by an admin</span>
            </button>
            <button
              type="button"
              onClick={() => openTab("chat")}
              className="rounded-2xl border border-border bg-card p-4 text-left"
            >
              <MessageCircle size={18} className="text-primary" />
              <span className="mt-3 block text-xl font-semibold text-foreground">
                {summary.earlierMessageCount}
              </span>
              <span className="text-xs text-muted-foreground">earlier group messages</span>
            </button>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Full details and payment history remain available in the group.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground"
          >
            Got it, open group
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
