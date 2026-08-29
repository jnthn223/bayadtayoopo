import { useEffect, useMemo, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpDown,
  Check,
  Clock3,
  Coffee,
  Edit2,
  ExternalLink,
  Filter,
  MessageCircle,
  QrCode,
  Receipt,
  Reply,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import type {
  Balance,
  Category,
  ChatMessage,
  Expense,
  Group,
  Member,
  Settlement,
  Split,
} from "./types";
import { EXPENSE_CATEGORIES } from "./types";
import type { GroupTab } from "./GroupHeader";
import { UserAvatar } from "./UserAvatar";
import { GroupPayments } from "./GroupPayments";
import { parseChatMentions } from "./chatMentions";
import { buildBalanceShareMessage } from "./balanceShareMessage";
import { ensureRequiredShareLinks } from "./requiredShareLinks";
import {
  canDirectlyConfirmSplit,
  CATEGORY_ICONS,
  formatCurrency,
  getExpensePayerId,
  getMemberById,
  getOutstandingExpenseShares,
  isExpenseSettled,
} from "./utils";

type ExpenseSort = "newest" | "oldest" | "highest" | "lowest";
type SettlementFilter = "all" | "settled" | "unsettled";

interface Props {
  tab: GroupTab;
  group: Group;
  currentMember?: Member;
  isAdmin: boolean;
  activeBalances: Balance[];
  settlements: Settlement[];
  paymentItems: Array<{ expense: Expense; split: Split }>;
  focusedExpenseId?: string;
  focusedPaymentId?: string;
  kofiUrl?: string;
  expensesByDate: Record<string, Expense[]>;
  sortedDates: string[];
  messages: ChatMessage[];
  chatRevealMessageId: string | null;
  firstUnreadMessageRef: RefObject<HTMLDivElement | null>;
  chatEndRef: RefObject<HTMLDivElement | null>;
  displayMemberName: (memberId: string, fallback?: string) => string;
  setEditExpense: Dispatch<SetStateAction<Expense | null>>;
  setAddOpen: Dispatch<SetStateAction<boolean>>;
  openDeleteExpense: (expense: Expense) => void;
  openPaymentDetails: () => void;
  viewPaymentImage: (imageId: string, title: string) => void;
  onUpdate: (group: Group) => Promise<void> | void;
  openPaymentSubmission: (expense: Expense, split: Split) => void;
  reviewPayment: (
    expenseId: string,
    memberId: string,
    status: "confirmed" | "rejected",
  ) => void;
  setCreatorPaidConfirmation: Dispatch<
    SetStateAction<{ expense: Expense; split: Split } | null>
  >;
  onReplyToMessage: (messageId: string) => void;
}

export function GroupContent({
  tab,
  group,
  currentMember,
  isAdmin,
  activeBalances,
  settlements,
  paymentItems,
  focusedExpenseId,
  focusedPaymentId,
  kofiUrl,
  expensesByDate,
  sortedDates,
  messages,
  chatRevealMessageId,
  firstUnreadMessageRef,
  chatEndRef,
  displayMemberName,
  setEditExpense,
  setAddOpen,
  openDeleteExpense,
  openPaymentDetails,
  viewPaymentImage,
  onUpdate,
  openPaymentSubmission,
  reviewPayment,
  setCreatorPaidConfirmation,
  onReplyToMessage,
}: Props) {
  const [expenseFiltersOpen, setExpenseFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [payerFilter, setPayerFilter] = useState("all");
  const [settlementFilter, setSettlementFilter] =
    useState<SettlementFilter>("all");
  const [expenseSort, setExpenseSort] = useState<ExpenseSort>("newest");
  const [balanceShareStatus, setBalanceShareStatus] = useState<{
    memberId: string;
    message: string;
  } | null>(null);
  const [balanceShareDraft, setBalanceShareDraft] = useState<{
    balance: Balance;
    message: string;
    groupUrl: string;
  } | null>(null);

  useEffect(() => {
    if (!focusedExpenseId) return;
    setCategoryFilter("all");
    setPayerFilter("all");
    setSettlementFilter("all");
  }, [focusedExpenseId]);

  function prepareMemberBalanceShare(balance: Balance) {
    const member = getMemberById(group, balance.memberId);
    if (!member) return;
    const params = new URLSearchParams({ openGroup: group.id });
    const groupUrl = `${window.location.origin}${window.location.pathname}?${params}`;
    setBalanceShareDraft({
      balance,
      groupUrl,
      message: buildBalanceShareMessage({
        group,
        member,
        balance: balance.net,
        senderName: currentMember?.name,
        groupUrl,
      }),
    });
    setBalanceShareStatus(null);
  }

  async function shareMemberBalance() {
    if (!balanceShareDraft) return;
    const { balance, groupUrl } = balanceShareDraft;
    const member = getMemberById(group, balance.memberId);
    if (!member) return;
    const message = ensureRequiredShareLinks(balanceShareDraft.message, [
      { label: "Open the group", url: groupUrl },
    ]);
    setBalanceShareDraft((current) => current ? { ...current, message } : current);

    setBalanceShareStatus(null);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${group.name} balance update`,
          text: message,
        });
        setBalanceShareDraft(null);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(message);
      setBalanceShareStatus({
        memberId: balance.memberId,
        message: "Balance message copied",
      });
      setBalanceShareDraft(null);
    } catch {
      setBalanceShareStatus({
        memberId: balance.memberId,
        message: "Unable to share or copy the message",
      });
    }
  }
  const hasRelevantGroupPayments = (group.payments ?? []).some(
    (payment) =>
      payment.fromMemberId === currentMember?.id ||
      payment.toMemberId === currentMember?.id,
  );
  const hasExpensePaymentOptions = currentMember
    ? getOutstandingExpenseShares(group, currentMember.id).length > 0
    : false;
  const expenseSettlementById = useMemo(
    () =>
      new Map(
        group.expenses.map((expense) => [
          expense.id,
          isExpenseSettled(group, expense),
        ]),
      ),
    [group],
  );
  const expensePayers = useMemo(() => {
    const payerIds = new Set(group.expenses.map(getExpensePayerId));
    return [...group.members, ...(group.formerMembers ?? [])].filter((member) =>
      payerIds.has(member.id),
    );
  }, [group.expenses, group.formerMembers, group.members]);
  const filteredExpenses = useMemo(
    () =>
      group.expenses.filter((expense) => {
        const settled = expenseSettlementById.get(expense.id) === true;
        return (
          (categoryFilter === "all" ||
            expense.category === categoryFilter) &&
          (payerFilter === "all" ||
            getExpensePayerId(expense) === payerFilter) &&
          (settlementFilter === "all" ||
            (settlementFilter === "settled" ? settled : !settled))
        );
      }),
    [
      categoryFilter,
      expenseSettlementById,
      group.expenses,
      payerFilter,
      settlementFilter,
    ],
  );
  const expenseSections = useMemo(() => {
    if (expenseSort === "highest" || expenseSort === "lowest") {
      const direction = expenseSort === "highest" ? -1 : 1;
      return [
        {
          key: expenseSort,
          date: undefined,
          expenses: [...filteredExpenses].sort(
            (a, b) =>
              direction * (a.amount - b.amount) ||
              b.date.localeCompare(a.date),
          ),
        },
      ];
    }
    const dates =
      expenseSort === "newest" ? sortedDates : [...sortedDates].reverse();
    const visibleIds = new Set(filteredExpenses.map((expense) => expense.id));
    return dates.flatMap((date) => {
      const expenses = expensesByDate[date].filter((expense) =>
        visibleIds.has(expense.id),
      );
      return expenses.length > 0 ? [{ key: date, date, expenses }] : [];
    });
  }, [
    expenseSort,
    expensesByDate,
    filteredExpenses,
    sortedDates,
  ]);
  const activeExpenseFilterCount = [
    categoryFilter !== "all",
    payerFilter !== "all",
    settlementFilter !== "all",
  ].filter(Boolean).length;
  const amountSorted =
    expenseSort === "highest" || expenseSort === "lowest";

  function clearExpenseFilters() {
    setCategoryFilter("all");
    setPayerFilter("all");
    setSettlementFilter("all");
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {tab === "expenses" && (
          <div className="p-4 space-y-6">
            {group.expenses.length > 0 && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpenseFiltersOpen((current) => !current)
                    }
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
                      expenseFiltersOpen || activeExpenseFilterCount > 0
                        ? "border-primary bg-accent text-primary"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    <Filter size={15} />
                    Filter
                    {activeExpenseFilterCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                        {activeExpenseFilterCount}
                      </span>
                    )}
                  </button>
                  <label className="relative flex flex-1 items-center rounded-xl border border-border bg-card">
                    <ArrowUpDown
                      size={15}
                      className="pointer-events-none absolute left-3 text-muted-foreground"
                    />
                    <select
                      aria-label="Sort expenses"
                      value={expenseSort}
                      onChange={(event) =>
                        setExpenseSort(event.target.value as ExpenseSort)
                      }
                      className="w-full appearance-none bg-transparent py-2.5 pl-9 pr-3 text-sm font-medium text-foreground outline-none"
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="highest">Highest amount</option>
                      <option value="lowest">Lowest amount</option>
                    </select>
                  </label>
                </div>

                {expenseFiltersOpen && (
                  <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs font-medium text-muted-foreground">
                        Category
                        <select
                          value={categoryFilter}
                          onChange={(event) =>
                            setCategoryFilter(
                              event.target.value as Category | "all",
                            )
                          }
                          className="mt-1.5 w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                        >
                          <option value="all">All categories</option>
                          {EXPENSE_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category.charAt(0).toUpperCase() +
                                category.slice(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-muted-foreground">
                        Paid by
                        <select
                          value={payerFilter}
                          onChange={(event) =>
                            setPayerFilter(event.target.value)
                          }
                          className="mt-1.5 w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                        >
                          <option value="all">Anyone</option>
                          {expensePayers.map((member) => (
                            <option key={member.id} value={member.id}>
                              {displayMemberName(member.id, member.name)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Status
                      <select
                        value={settlementFilter}
                        onChange={(event) =>
                          setSettlementFilter(
                            event.target.value as SettlementFilter,
                          )
                        }
                        className="mt-1.5 w-full rounded-xl border border-border bg-input-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      >
                        <option value="all">All expenses</option>
                        <option value="unsettled">Unsettled</option>
                        <option value="settled">Settled</option>
                      </select>
                    </label>
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <p className="text-xs text-muted-foreground">
                        Showing {filteredExpenses.length} of{" "}
                        {group.expenses.length}
                      </p>
                      {activeExpenseFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={clearExpenseFilters}
                          className="text-xs font-semibold text-primary"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

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
            ) : filteredExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Filter size={22} className="text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground">
                  No matching expenses
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try changing or clearing your filters.
                </p>
                <button
                  type="button"
                  onClick={clearExpenseFilters}
                  className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              expenseSections.map((section) => (
                <div key={section.key}>
                  {section.date ? (
                    <p className="text-xs text-muted-foreground font-medium mb-2 px-1">
                      {new Date(
                        section.date + "T12:00:00",
                      ).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  ) : (
                    <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                      {expenseSort === "highest"
                        ? "Highest amount first"
                        : "Lowest amount first"}
                    </p>
                  )}
                  <div className="space-y-2">
                    {section.expenses.map((exp) => {
                      const payerId = getExpensePayerId(exp);
                      const payer = getMemberById(group, payerId);
                      const isCreator =
                        currentMember?.id === (exp.createdBy ?? exp.paidBy);
                      const settled = isExpenseSettled(group, exp);
                      return (
                        <div
                          key={exp.id}
                          id={`expense-${exp.id}`}
                          className={`bg-card rounded-2xl border p-4 flex items-center gap-4 scroll-mt-4 transition-all ${
                            focusedExpenseId === exp.id
                              ? "border-primary ring-4 ring-primary/15"
                              : "border-border"
                          }`}
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
                              {amountSorted &&
                                ` · ${new Date(
                                  exp.date + "T12:00:00",
                                ).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}`}
                            </p>
                            {(exp.receipts?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {exp.receipts!.map((receipt, receiptIndex) => (
                                  <button
                                    key={receipt.imageId}
                                    type="button"
                                    onClick={() =>
                                      viewPaymentImage(
                                        receipt.imageId,
                                        exp.receipts!.length === 1
                                          ? `Receipt · ${exp.description}`
                                          : `Receipt ${receiptIndex + 1} · ${exp.description}`,
                                      )
                                    }
                                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-primary"
                                  >
                                    <Receipt size={11} />
                                    Receipt
                                    {exp.receipts!.length > 1
                                      ? ` ${receiptIndex + 1}`
                                      : ""}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-foreground">
                              {formatCurrency(exp.amount, group.currency)}
                            </p>
                            {settled && (
                              <span className="mt-1.5 inline-flex -rotate-2 rounded-md border-2 border-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700">
                                Settled
                              </span>
                            )}
                            {!settled && (isCreator || isAdmin) && (
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
                                {!settled && (isCreator || isAdmin) && (
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
                      uid={getMemberById(group, b.memberId)?.uid}
                      photoVersion={getMemberById(group, b.memberId)?.profileImageVersion}
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
                    <div className="flex flex-col items-end gap-2">
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
                      {b.memberId !== currentMember?.id && Math.abs(b.net) >= 0.01 && (
                        <button
                          type="button"
                          onClick={() => prepareMemberBalanceShare(b)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 active:scale-[0.98]"
                          aria-label={`Share ${b.memberName}'s balance update`}
                        >
                          <Share2 size={12} aria-hidden="true" />
                          {b.net < 0 ? "Send reminder" : "Share update"}
                        </button>
                      )}
                      {balanceShareStatus?.memberId === b.memberId && (
                        <p
                          className={`max-w-32 text-right text-[10px] ${
                            balanceShareStatus.message.startsWith("Unable")
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                          role="status"
                        >
                          {balanceShareStatus.message}
                        </p>
                      )}
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
          <div className="space-y-6 px-4 py-5 sm:p-6">
            {currentMember && (
              <button
                onClick={openPaymentDetails}
                className="w-full rounded-2xl border border-border bg-accent p-5 text-left"
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
            {settlements.length === 0 &&
            paymentItems.length === 0 &&
            !hasRelevantGroupPayments &&
            !hasExpensePaymentOptions ? (
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
                  <section className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Expense repayments
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Review payments connected to individual expenses.
                      </p>
                    </div>
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
                            <UserAvatar name={fromMember?.name ?? "Unknown"} color={fromMember?.color ?? "var(--primary)"} seed={fromMember?.avatarSeed} uid={fromMember?.uid} photoVersion={fromMember?.profileImageVersion} className="w-10 h-10 rounded-full text-sm shrink-0" />
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
                  </section>
                )}

                <div>
                  <GroupPayments
                    group={group}
                    currentMember={currentMember}
                    settlements={settlements}
                    focusedPaymentId={focusedPaymentId}
                    onUpdate={onUpdate}
                    viewPaymentImage={viewPaymentImage}
                  />
                </div>
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
              <>
                {messages.map((message) => {
                  const sender = getMemberById(group, message.memberId);
                  const repliedMessage = message.replyToMessageId
                    ? messages.find(
                      (candidate) => candidate.id === message.replyToMessageId,
                    )
                    : undefined;
                  const repliedSender = repliedMessage
                    ? getMemberById(group, repliedMessage.memberId)
                    : undefined;
                  const isMine = currentMember?.id === message.memberId;
                  const isFirstUnread = message.id === chatRevealMessageId;
                  const mentionsCurrentUser = !!currentMember &&
                    (message.mentionedMemberIds ?? []).some(
                      (id) => id === currentMember.id || id === currentMember.uid,
                    );
                  return (
                  <div
                    key={message.id}
                    id={`message-${message.id}`}
                    className={isFirstUnread ? "space-y-3 scroll-mt-4" : "scroll-mt-4"}
                  >
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
                      <UserAvatar name={sender?.name ?? "Unknown"} color={sender?.color ?? "var(--primary)"} seed={sender?.avatarSeed} uid={sender?.uid} photoVersion={sender?.profileImageVersion} className="w-8 h-8 rounded-full text-xs shrink-0 mt-1" />
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
                        <button
                          type="button"
                          onClick={() => onReplyToMessage(message.id)}
                          className={`ml-auto rounded-full p-1 transition-colors ${
                            isMine
                              ? "text-primary-foreground/70 hover:bg-white/15"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                          title="Reply"
                          aria-label={`Reply to ${sender?.name ?? "message"}`}
                        >
                          <Reply size={13} />
                        </button>
                      </div>
                      {mentionsCurrentUser && !isMine && (
                        <span className="mb-2 inline-flex rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-primary">
                          Mentioned you
                        </span>
                      )}
                      {message.replyToMessageId && (
                        <button
                          type="button"
                          onClick={() =>
                            document
                              .getElementById(`message-${message.replyToMessageId}`)
                              ?.scrollIntoView({ behavior: "smooth", block: "center" })
                          }
                          className={`mb-2 block w-full rounded-lg border-l-2 px-2.5 py-2 text-left ${
                            isMine
                              ? "border-white/70 bg-white/10"
                              : "border-primary bg-muted/60"
                          }`}
                        >
                          <span
                            className={`block text-[10px] font-semibold ${
                              isMine ? "text-primary-foreground/90" : "text-primary"
                            }`}
                          >
                            {repliedSender?.name ?? "Original message"}
                          </span>
                          <span
                            className={`mt-0.5 block truncate text-xs ${
                              isMine
                                ? "text-primary-foreground/75"
                                : "text-muted-foreground"
                            }`}
                          >
                            {repliedMessage?.text ?? "Message no longer available"}
                          </span>
                        </button>
                      )}
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {parseChatMentions(message.text, group.members).map(
                          (part, index) =>
                            part.memberIds.length > 0 ? (
                              <span
                                key={`${part.text}-${index}`}
                                className={`rounded px-1 py-0.5 font-semibold ${
                                  isMine
                                    ? "bg-white/20 text-white"
                                    : "bg-accent text-primary"
                                }`}
                              >
                                {part.text}
                              </span>
                            ) : (
                              <span key={`${part.text}-${index}`}>{part.text}</span>
                            ),
                        )}
                      </p>
                    </div>
                    </div>
                  </div>
                  );
                })}
                <div ref={chatEndRef} aria-hidden="true" />
              </>
            )}
          </div>
        )}
      </div>

      <Dialog.Root
        open={!!balanceShareDraft}
        onOpenChange={(open) => !open && setBalanceShareDraft(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-card p-6 pb-10 shadow-2xl">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Customize balance message
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                  Add your own note before sharing it through another app.
                </Dialog.Description>
              </div>
              <Dialog.Close className="rounded-full p-2 hover:bg-muted">
                <X size={18} className="text-muted-foreground" />
              </Dialog.Close>
            </div>
            <textarea
              value={balanceShareDraft?.message ?? ""}
              onChange={(event) =>
                setBalanceShareDraft((current) =>
                  current ? { ...current, message: event.target.value } : current,
                )
              }
              rows={10}
              className="w-full resize-y rounded-2xl border border-border bg-input-background p-4 text-xs leading-relaxed text-foreground outline-none focus:border-primary"
              aria-label="Customize balance reminder"
            />
            <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-primary">
                Required group link
              </p>
              <p className="mt-1 break-all text-[10px] text-muted-foreground">
                {balanceShareDraft?.groupUrl}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                This link is always included, even if it is removed above.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void shareMemberBalance()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
            >
              <Share2 size={16} />
              Share message
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>

  );
}
