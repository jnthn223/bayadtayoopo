import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Link2, UserPlus, X } from "lucide-react";
import type { Group, Member } from "./types";
import { getMemberInviteDetails } from "./inviteMessage";
import { formatCurrency } from "./utils";

interface Props {
  open: boolean;
  group: Group;
  member: Member;
  autoApprove: boolean;
  onRequestClaim: () => void;
  onJoinAsNew: () => void;
  onCancel: () => void;
}

export function SimilarMemberPrompt({
  open,
  group,
  member,
  autoApprove,
  onRequestClaim,
  onJoinAsNew,
  onCancel,
}: Props) {
  const { balance, linkedExpenseCount = 0 } = getMemberInviteDetails(
    group,
    member.id,
  );
  const balanceText = typeof balance !== "number" || Math.abs(balance) < 0.005
    ? "currently settled"
    : balance < 0
      ? `${formatCurrency(Math.abs(balance), group.currency)} to settle`
      : `${formatCurrency(balance, group.currency)} to receive`;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-4 top-1/2 z-[80] -translate-y-1/2 rounded-3xl bg-card p-5 shadow-2xl sm:left-1/2 sm:max-w-sm sm:-translate-x-1/2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Link2 size={21} />
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full p-2 hover:bg-muted"
              aria-label="Cancel joining"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <Dialog.Title className="text-xl font-semibold text-foreground">
            Is “{member.name}” you?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A pending member in “{group.name}” has a similar name. They already have {linkedExpenseCount} linked expense{linkedExpenseCount === 1 ? "" : "s"} and are {balanceText}.
          </Dialog.Description>

          <div className="mt-4 flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed">
              {autoApprove
                ? "Only choose yes if this really is you. This group trusts explicit member self-claims, so your login will be attached to this pending profile without a separate admin review. Nothing happens unless you choose yes."
                : "Only choose yes if this really is you. An admin must approve before those expenses and balances move to your account."}
            </p>
          </div>

          <div className="mt-5 space-y-2.5">
            <button
              type="button"
              onClick={onRequestClaim}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
            >
              <Link2 size={16} />
              {autoApprove
                ? "Yes, this is my pending profile"
                : "Yes, ask the admin to connect me"}
            </button>
            <button
              type="button"
              onClick={onJoinAsNew}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold text-foreground active:scale-[0.98]"
            >
              <UserPlus size={16} />
              No, join as a new member
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
