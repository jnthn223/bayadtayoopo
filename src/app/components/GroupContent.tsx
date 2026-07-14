import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  Check,
  Clock3,
  Coffee,
  Edit2,
  ExternalLink,
  MessageCircle,
  QrCode,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import type {
  Balance,
  ChatMessage,
  Expense,
  Group,
  Member,
  Settlement,
  Split,
} from "./types";
import type { GroupTab } from "./GroupHeader";
import { UserAvatar } from "./UserAvatar";
import {
  canDirectlyConfirmSplit,
  CATEGORY_ICONS,
  formatCurrency,
  getExpensePayerId,
  getMemberById,
} from "./utils";

interface Props {
  tab: GroupTab;
  group: Group;
  currentMember?: Member;
  isAdmin: boolean;
  activeBalances: Balance[];
  settlements: Settlement[];
  paymentItems: Array<{ expense: Expense; split: Split }>;
  kofiUrl?: string;
  expensesByDate: Record<string, Expense[]>;
  sortedDates: string[];
  messages: ChatMessage[];
  chatRevealMessageId: string | null;
  firstUnreadMessageRef: RefObject<HTMLDivElement | null>;
  displayMemberName: (memberId: string, fallback?: string) => string;
  setEditExpense: Dispatch<SetStateAction<Expense | null>>;
  setAddOpen: Dispatch<SetStateAction<boolean>>;
  openDeleteExpense: (expense: Expense) => void;
  openPaymentDetails: () => void;
  viewPaymentImage: (imageId: string, title: string) => void;
  openPaymentSubmission: (expense: Expense, split: Split) => void;
  reviewPayment: (
    expenseId: string,
    memberId: string,
    status: "confirmed" | "rejected",
  ) => void;
  setCreatorPaidConfirmation: Dispatch<
    SetStateAction<{ expense: Expense; split: Split } | null>
  >;
}

export function GroupContent({
  tab,
  group,
  currentMember,
  isAdmin,
  activeBalances,
  settlements,
  paymentItems,
  kofiUrl,
  expensesByDate,
  sortedDates,
  messages,
  chatRevealMessageId,
  firstUnreadMessageRef,
  displayMemberName,
  setEditExpense,
  setAddOpen,
  openDeleteExpense,
  openPaymentDetails,
  viewPaymentImage,
  openPaymentSubmission,
  reviewPayment,
  setCreatorPaidConfirmation,
}: Props) {
  return (
      <div className="flex-1 overflow-y-auto">
        {tab === "expenses" && (
          <div className="p-4 space-y-6">
            {group.expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-4">
                  <Receipt size={28} className="text-accent-foreground" />
                </div>
                <p className="text-foreground font-medium mb-1">
                  No expenses yet
                </p>
                <p className="text-sm text-muted-foreground">
                  Tap + to add your first expense
                </p>
              </div>
            ) : (
              sortedDates.map((date) => (
                <div key={date}>
                  <p className="text-xs text-muted-foreground font-medium mb-2 px-1">
                    {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <div className="space-y-2">
                    {expensesByDate[date].map((exp) => {
                      const payerId = getExpensePayerId(exp);
                      const payer = getMemberById(group, payerId);
                      const isCreator =
                        currentMember?.id === (exp.createdBy ?? exp.paidBy);
                      return (
                        <div
                          key={exp.id}
                          className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4"
                        >
                          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-xl shrink-0">
                            {CATEGORY_ICONS[exp.category]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {exp.description}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Paid by{" "}
                              <span
                                className="font-medium"
                                style={{ color: payer?.color }}
                              >
                                {displayMemberName(payerId, payer?.name)}
                              </span>{" "}
                              ·{" "}
                              {exp.splitType === "equal"
                                ? "Split equally"
                                : "Custom split"}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-foreground">
                              {formatCurrency(exp.amount, group.currency)}
                            </p>
                            {(isCreator || isAdmin) && (
                              <div className="flex gap-1 mt-1 justify-end">
                                {isCreator && (
                                  <button
                                    onClick={() => {
                                      setEditExpense(exp);
                                      setAddOpen(true);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                                    title="Edit expense"
                                  >
                                    <Edit2
                                      size={12}
                                      className="text-muted-foreground"
                                    />
                                  </button>
                                )}
                                {(isCreator || isAdmin) && (
                                  <button
                                    onClick={() => openDeleteExpense(exp)}
                                    className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                                    title="Delete expense"
                                  >
                                    <Trash2
                                      size={12}
                                      className="text-destructive"
                                    />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "balances" && (
          <div className="p-4 space-y-3">
            {activeBalances.length === 0 ? (
              <p className="text-center text-muted-foreground py-20">
                No members yet
              </p>
            ) : (
              <>
                {activeBalances.map((b) => (
                  <div
                    key={b.memberId}
                    className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4"
                  >
                    <UserAvatar
                      name={b.memberName}
                      color={getMemberById(group, b.memberId)?.color ?? "var(--primary)"}
                      seed={getMemberById(group, b.memberId)?.avatarSeed}
                      className="w-10 h-10 rounded-full text-sm shrink-0"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {displayMemberName(b.memberId, b.memberName)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {Math.abs(b.net) < 0.01
                          ? "All settled up"
                          : b.net > 0
                            ? "paid upfront · gets back"
                            : "unpaid share"}
                      </p>
                    </div>
                    <div
                      className={`text-sm font-semibold ${
                        Math.abs(b.net) < 0.01
                          ? "text-muted-foreground"
                          : b.net > 0
                            ? "text-green-600"
                            : "text-destructive"
                      }`}
                    >
                      {Math.abs(b.net) < 0.01
                        ? "Settled"
                        : formatCurrency(Math.abs(b.net), group.currency)}
                    </div>
                  </div>
                ))}
                <div className="bg-card rounded-2xl border border-border p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shrink-0">
                      <Coffee size={15} className="text-accent-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Support BayadTayoOpo
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Optional support helps cover hosting and ongoing development.
                      </p>
                    </div>
                  </div>
                  {kofiUrl && (
                    <a
                      href={kofiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/80 active:scale-[0.98]"
                    >
                      Support on Ko-fi
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "settle" && (
          <div className="p-4 space-y-3">
            {currentMember && (
              <button
                onClick={openPaymentDetails}
                className="w-full text-left bg-accent rounded-2xl border border-border p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {currentMember.paymentInstructions
                        ? "Your payment instructions"
                        : "Help people pay you"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {currentMember.paymentInstructions
                        ? `${currentMember.paymentInstructions.method} · Tap to edit`
                        : "Add optional bank, e-wallet, or QR details"}
                    </p>
                  </div>
                  <QrCode size={20} className="text-primary shrink-0" />
                </div>
              </button>
            )}
            {settlements.length === 0 && paymentItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <span className="text-2xl">🎉</span>
                </div>
                <p className="text-foreground font-medium mb-1">
                  All settled up!
                </p>
                <p className="text-sm text-muted-foreground">
                  No payments needed
                </p>
              </div>
            ) : (
              <>
                {paymentItems.length > 0 && (
                  <>
                    <p className="text-sm text-muted-foreground mb-2">
                      Expense repayments
                    </p>
                    {paymentItems.map(({ expense, split }) => {
                      const fromMember = getMemberById(group, split.memberId);
                      const payerId = getExpensePayerId(expense);
                      const toMember = getMemberById(group, payerId);
                      const isPayer = currentMember?.id === split.memberId;
                      const isRecipient = currentMember?.id === payerId;
                      const isPending = split.paymentStatus === "pending";
                      const isRejected = split.paymentStatus === "rejected";
                      const statusLabel = isPending
                        ? isPayer
                          ? "Payment submitted"
                          : isRecipient
                            ? "Review payment"
                            : "Awaiting confirmation"
                        : isRejected
                          ? isPayer
                            ? "Needs attention"
                            : "Payment rejected"
                          : isPayer
                            ? "Payment needed"
                            : isRecipient
                              ? "Awaiting payment"
                              : "Unpaid";

                      return (
                        <div
                          key={`${expense.id}-${split.memberId}`}
                          className="bg-card rounded-2xl border border-border p-4 space-y-3"
                        >
                          <div className="flex items-center gap-3">
                            <UserAvatar name={fromMember?.name ?? "Unknown"} color={fromMember?.color ?? "var(--primary)"} seed={fromMember?.avatarSeed} className="w-10 h-10 rounded-full text-sm shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                {isPayer ? (
                                  <>
                                    <span style={{ color: fromMember?.color }}>You</span>
                                    <span className="text-muted-foreground"> owe </span>
                                    <span style={{ color: toMember?.color }}>
                                      {toMember?.name ?? "Unknown"}
                                    </span>
                                  </>
                                ) : isRecipient ? (
                                  <>
                                    <span style={{ color: fromMember?.color }}>
                                      {fromMember?.name ?? "Unknown"}
                                    </span>
                                    <span className="text-muted-foreground"> owes </span>
                                    <span style={{ color: toMember?.color }}>you</span>
                                  </>
                                ) : (
                                  <>
                                    <span style={{ color: fromMember?.color }}>
                                      {fromMember?.name ?? "Unknown"}
                                    </span>
                                    <span className="text-muted-foreground"> owes </span>
                                    <span style={{ color: toMember?.color }}>
                                      {toMember?.name ?? "Unknown"}
                                    </span>
                                  </>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {expense.description}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-foreground">
                                {formatCurrency(split.amount, group.currency)}
                              </p>
                              <div
                                className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                  isPending
                                    ? "bg-amber-100 text-amber-700"
                                    : isRejected
                                      ? "bg-destructive/10 text-destructive"
                                      : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {isPending ? (
                                  <Clock3 size={11} />
                                ) : isRejected ? (
                                  <X size={11} />
                                ) : (
                                  <Clock3 size={11} />
                                )}
                                {statusLabel}
                              </div>
                            </div>
                          </div>

                          {isPayer && toMember?.paymentInstructions && (
                            <div className="rounded-xl bg-muted p-3 text-xs space-y-1">
                              <p className="font-medium text-foreground">How to pay</p>
                              <p>{toMember.paymentInstructions.method}</p>
                              {toMember.paymentInstructions.accountName && (
                                <p>Account name: {toMember.paymentInstructions.accountName}</p>
                              )}
                              {toMember.paymentInstructions.accountIdentifier && (
                                <p>Account: {toMember.paymentInstructions.accountIdentifier}</p>
                              )}
                              {toMember.paymentInstructions.instructions && (
                                <p>{toMember.paymentInstructions.instructions}</p>
                              )}
                              {toMember.paymentInstructions.qrCodeImageId && (
                                <button
                                  onClick={() =>
                                    viewPaymentImage(
                                      toMember.paymentInstructions!.qrCodeImageId!,
                                      "Payment QR",
                                    )
                                  }
                                  className="inline-block text-primary font-medium pt-1"
                                >
                                  View payment QR
                                </button>
                              )}
                            </div>
                          )}

                          {split.paymentSubmission && (isPayer || isRecipient) && (
                            <div className="rounded-xl border border-border p-3 text-xs space-y-1">
                              <p className="font-medium text-foreground">Payment submission</p>
                              <p>Method: {split.paymentSubmission.method}</p>
                              {split.paymentSubmission.referenceNumber && (
                                <p>Reference: {split.paymentSubmission.referenceNumber}</p>
                              )}
                              {split.paymentSubmission.note && <p>{split.paymentSubmission.note}</p>}
                              {split.paymentSubmission.proofImageId && (
                                <button
                                  onClick={() =>
                                    viewPaymentImage(
                                      split.paymentSubmission!.proofImageId!,
                                      "Payment proof",
                                    )
                                  }
                                  className="text-primary font-medium"
                                >
                                  View payment proof
                                </button>
                              )}
                              {split.paymentSubmission.rejectionReason && (
                                <p className="text-destructive">Reason: {split.paymentSubmission.rejectionReason}</p>
                              )}
                            </div>
                          )}

                          {isPayer && !isPending && (
                            <button
                              onClick={() => openPaymentSubmission(expense, split)}
                              className="w-full py-2.5 rounded-xl text-primary-foreground text-sm font-semibold transition-all active:scale-95"
                              style={{ backgroundColor: "var(--primary)" }}
                            >
                              Mark as Paid
                            </button>
                          )}

                          {isRecipient && isPending && (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => reviewPayment(expense.id, split.memberId, "confirmed")}
                                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold transition-all active:scale-95"
                              >
                                <Check size={15} />
                                Confirm
                              </button>
                              <button
                                onClick={() => reviewPayment(expense.id, split.memberId, "rejected")}
                                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-destructive text-white text-sm font-semibold transition-all active:scale-95"
                              >
                                <X size={15} />
                                Reject
                              </button>
                            </div>
                          )}

                          {currentMember &&
                            canDirectlyConfirmSplit(
                              expense,
                              split,
                              currentMember.id,
                            ) && (
                            <button
                              onClick={() => setCreatorPaidConfirmation({ expense, split })}
                              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-green-600 bg-green-50 text-green-700 text-sm font-semibold transition-all active:scale-95"
                            >
                              <Check size={15} />
                              Mark {fromMember?.name ?? "borrower"} as paid
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {settlements.length > 0 && (
                  <div className={paymentItems.length > 0 ? "pt-3" : ""}>
                    <p className="text-sm text-muted-foreground mb-2">
                      Suggested payments to settle the group
                    </p>
                    <div className="space-y-3">
                      {settlements.map((s, i) => {
                        const fromMember = getMemberById(group, s.from);
                        const toMember = getMemberById(group, s.to);
                        return (
                          <div
                            key={i}
                            className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3"
                          >
                            <UserAvatar name={s.fromName} color={fromMember?.color ?? "var(--primary)"} seed={fromMember?.avatarSeed} className="w-10 h-10 rounded-full text-sm shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                <span style={{ color: fromMember?.color }}>
                                  {displayMemberName(s.from, s.fromName)}
                                </span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  pays{" "}
                                </span>
                                <span style={{ color: toMember?.color }}>
                                  {displayMemberName(s.to, s.toName)}
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Transfer
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-foreground shrink-0">
                              {formatCurrency(s.amount, group.currency)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === "chat" && (
          <div className="p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-4">
                  <MessageCircle
                    size={28}
                    className="text-accent-foreground"
                  />
                </div>
                <p className="text-foreground font-medium mb-1">
                  No messages yet
                </p>
                <p className="text-sm text-muted-foreground">
                  Start a group conversation
                </p>
              </div>
            ) : (
              messages.map((message) => {
                const sender = getMemberById(group, message.memberId);
                const isMine = currentMember?.id === message.memberId;
                const isFirstUnread = message.id === chatRevealMessageId;
                return (
                  <div key={message.id} className={isFirstUnread ? "space-y-3" : undefined}>
                    {isFirstUnread && (
                      <div
                        ref={firstUnreadMessageRef}
                        className="flex scroll-mt-4 items-center gap-3 py-1"
                      >
                        <span className="h-px flex-1 bg-primary/25" />
                        <span className="rounded-full bg-accent px-3 py-1 text-[10px] font-semibold text-primary">
                          Unread messages
                        </span>
                        <span className="h-px flex-1 bg-primary/25" />
                      </div>
                    )}
                    <div className={`flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                    {!isMine && (
                      <UserAvatar name={sender?.name ?? "Unknown"} color={sender?.color ?? "var(--primary)"} seed={sender?.avatarSeed} className="w-8 h-8 rounded-full text-xs shrink-0 mt-1" />
                    )}
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-3 ${
                        isMine
                          ? "text-primary-foreground rounded-br-md"
                          : "bg-card border border-border text-foreground rounded-bl-md"
                      }`}
                      style={
                        isMine
                          ? { backgroundColor: "var(--primary)" }
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <p
                          className={`text-xs font-medium ${
                            isMine
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground"
                          }`}
                        >
                          {displayMemberName(message.memberId, sender?.name)}
                        </p>
                        <p
                          className={`text-[11px] ${
                            isMine
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          {new Date(message.createdAt).toLocaleTimeString(
                            "en-US",
                            {
                              hour: "numeric",
                              minute: "2-digit",
                            },
                          )}
                        </p>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.text}
                      </p>
                    </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

  );
}

