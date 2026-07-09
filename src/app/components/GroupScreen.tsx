import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  MessageCircle,
  Plus,
  QrCode,
  Send,
  Users,
  Receipt,
  BarChart2,
  Trash2,
  Edit2,
  MoreVertical,
  UserPlus,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { CurrentUser, Group, Expense, Split } from "./types";
import {
  computeBalances,
  computeSettlements,
  formatCurrency,
  CATEGORY_ICONS,
  generateId,
  getMemberById,
  getTotalExpenses,
} from "./utils";
import { AddExpenseModal } from "./AddExpenseModal";
import { QRModal } from "./QRModal";
import { InviteModal } from "./InviteModal";

type Tab = "expenses" | "balances" | "settle" | "chat";

interface Props {
  group: Group;
  currentUser: CurrentUser;
  onBack: () => void;
  onUpdate: (group: Group) => void;
  onDelete: (groupId: string) => void;
}

export function GroupScreen({
  group,
  currentUser,
  onBack,
  onUpdate,
  onDelete,
}: Props) {
  const [tab, setTab] = useState<Tab>("expenses");
  const [addOpen, setAddOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState(group.name);
  const [groupCurrencyInput, setGroupCurrencyInput] = useState(group.currency);
  const [groupEditError, setGroupEditError] = useState("");
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteReasonError, setDeleteReasonError] = useState("");
  const [messageText, setMessageText] = useState("");

  const balances = computeBalances(group);
  const settlements = computeSettlements(balances);
  const total = getTotalExpenses(group);
  const messages = [...(group.messages ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const currentMember = group.members.find(
    (m) => m.id === currentUser.id || m.uid === currentUser.id,
  );
  const adminId = group.adminId ?? group.members[0]?.id;
  const isAdmin = currentMember?.id === adminId;
  const displayMemberName = (memberId: string, fallback?: string) =>
    memberId === currentMember?.id ? "You" : (fallback ?? "Unknown");

  const paymentItems = group.expenses.flatMap((expense) =>
    expense.splits
      .filter(
        (split) =>
          split.memberId !== expense.paidBy &&
          split.amount > 0.005 &&
          split.paymentStatus !== "confirmed",
      )
      .map((split) => ({ expense, split })),
  );

  function handleAddExpense(expense: Expense) {
    const updated = { ...group };
    const idx = updated.expenses.findIndex((e) => e.id === expense.id);
    if (idx >= 0) {
      updated.expenses = updated.expenses.map((e) =>
        e.id === expense.id ? expense : e,
      );
    } else {
      updated.expenses = [expense, ...updated.expenses];
    }
    onUpdate(updated);
  }

  function openDeleteExpense(expense: Expense) {
    setDeleteExpense(expense);
    setDeleteReason("");
    setDeleteReasonError("");
  }

  function handleDeleteExpense() {
    if (!deleteExpense || !currentMember) return;
    const reason = deleteReason.trim();
    if (!reason) {
      setDeleteReasonError("Enter a reason for deleting this expense");
      return;
    }

    onUpdate({
      ...group,
      expenses: group.expenses.filter((e) => e.id !== deleteExpense.id),
      deletedExpenses: [
        ...(group.deletedExpenses ?? []),
        {
          expenseId: deleteExpense.id,
          description: deleteExpense.description,
          amount: deleteExpense.amount,
          deletedBy: currentMember.id,
          reason,
          deletedAt: new Date().toISOString(),
        },
      ],
    });
    setDeleteExpense(null);
    setDeleteReason("");
    setDeleteReasonError("");
  }

  function handlePaymentStatus(
    expenseId: string,
    memberId: string,
    paymentStatus: Split["paymentStatus"],
  ) {
    onUpdate({
      ...group,
      expenses: group.expenses.map((expense) =>
        expense.id === expenseId
          ? {
              ...expense,
              splits: expense.splits.map((split) =>
                split.memberId === memberId
                  ? { ...split, paymentStatus }
                  : split,
              ),
            }
          : expense,
      ),
    });
  }

  function handleSendMessage() {
    const text = messageText.trim();
    if (!text || !currentMember) return;

    onUpdate({
      ...group,
      messages: [
        ...(group.messages ?? []),
        {
          id: generateId(),
          memberId: currentMember.id,
          text,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setMessageText("");
  }

  function openEditGroup() {
    setGroupNameInput(group.name);
    setGroupCurrencyInput(group.currency);
    setGroupEditError("");
    setEditGroupOpen(true);
  }

  function handleSaveGroupDetails() {
    const name = groupNameInput.trim();
    if (!name) {
      setGroupEditError("Group name is required");
      return;
    }

    onUpdate({ ...group, name, currency: groupCurrencyInput });
    setEditGroupOpen(false);
    setGroupEditError("");
  }

  function handleDeleteGroup() {
    onDelete(group.id);
    onBack();
  }

  const expensesByDate = group.expenses.reduce<Record<string, Expense[]>>(
    (acc, exp) => {
      if (!acc[exp.date]) acc[exp.date] = [];
      acc[exp.date].push(exp);
      return acc;
    },
    {},
  );

  const sortedDates = Object.keys(expensesByDate).sort((a, b) =>
    b.localeCompare(a),
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-12 pb-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft size={20} className="text-foreground" />
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setInviteOpen(true)}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              title="Invite member"
            >
              <UserPlus size={19} className="text-foreground" />
            </button>
            <button
              onClick={() => setQrOpen(true)}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              title="Share QR code"
            >
              <QrCode size={19} className="text-foreground" />
            </button>

            {/* ⋯ menu */}
            {isAdmin && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="p-2 rounded-full hover:bg-muted transition-colors">
                    <MoreVertical size={19} className="text-foreground" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={6}
                    className="z-50 min-w-[160px] bg-card border border-border rounded-2xl shadow-xl overflow-hidden py-1"
                  >
                    <DropdownMenu.Item
                      onSelect={openEditGroup}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-foreground cursor-pointer hover:bg-muted outline-none transition-colors"
                    >
                      <Edit2 size={15} />
                      Edit Details
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() => setConfirmDelete(true)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-destructive cursor-pointer hover:bg-destructive/10 outline-none transition-colors"
                    >
                      <Trash2 size={15} />
                      Delete Group
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        </div>

        <h1 className="text-foreground mb-1">{group.name}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex -space-x-2">
            {group.members.slice(0, 5).map((m) => (
              <div
                key={m.id}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-medium border-2 border-card"
                style={{ backgroundColor: m.color }}
                title={m.name}
              >
                {m.name[0].toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {group.members.length} members
          </span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm font-medium text-foreground">
            {formatCurrency(total, group.currency)} total
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card">
        {(
          [
            { id: "expenses", label: "Expenses", icon: Receipt },
            { id: "balances", label: "Balances", icon: BarChart2 },
            { id: "settle", label: "Settle Up", icon: Users },
            { id: "chat", label: "Chat", icon: MessageCircle },
          ] as { id: Tab; label: string; icon: any }[]
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium border-b-2 transition-all ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
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
                      const payer = getMemberById(group, exp.paidBy);
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
                                {displayMemberName(exp.paidBy, payer?.name)}
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
            {balances.length === 0 ? (
              <p className="text-center text-muted-foreground py-20">
                No members yet
              </p>
            ) : (
              <>
                {balances.map((b) => (
                  <div
                    key={b.memberId}
                    className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm text-white font-medium shrink-0"
                      style={{
                        backgroundColor: getMemberById(group, b.memberId)
                          ?.color,
                      }}
                    >
                      {b.memberName[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {displayMemberName(b.memberId, b.memberName)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {Math.abs(b.net) < 0.01
                          ? "All settled up"
                          : b.net > 0
                            ? "is owed"
                            : "owes"}
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
                        : `${b.net > 0 ? "+" : ""}${formatCurrency(b.net, group.currency)}`}
                    </div>
                  </div>
                ))}
                <div className="bg-accent rounded-2xl p-4">
                  <p className="text-xs text-muted-foreground">
                    Positive = others owe you · Negative = you owe others
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "settle" && (
          <div className="p-4 space-y-3">
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
                      Payment requests
                    </p>
                    {paymentItems.map(({ expense, split }) => {
                      const fromMember = getMemberById(group, split.memberId);
                      const toMember = getMemberById(group, expense.paidBy);
                      const isPayer = currentMember?.id === split.memberId;
                      const isCreator =
                        currentMember?.id ===
                        (expense.createdBy ?? expense.paidBy);
                      const isPending = split.paymentStatus === "pending";
                      const isRejected = split.paymentStatus === "rejected";

                      return (
                        <div
                          key={`${expense.id}-${split.memberId}`}
                          className="bg-card rounded-2xl border border-border p-4 space-y-3"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-sm text-white font-medium shrink-0"
                              style={{ backgroundColor: fromMember?.color }}
                            >
                              {(fromMember?.name ?? "?")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                <span style={{ color: fromMember?.color }}>
                                  {displayMemberName(
                                    split.memberId,
                                    fromMember?.name,
                                  )}
                                </span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  pays{" "}
                                </span>
                                <span style={{ color: toMember?.color }}>
                                  {displayMemberName(
                                    expense.paidBy,
                                    toMember?.name,
                                  )}
                                </span>
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
                                {isPending
                                  ? "Pending"
                                  : isRejected
                                    ? "Rejected"
                                    : "Unpaid"}
                              </div>
                            </div>
                          </div>

                          {isPayer && !isPending && (
                            <button
                              onClick={() =>
                                handlePaymentStatus(
                                  expense.id,
                                  split.memberId,
                                  "pending",
                                )
                              }
                              className="w-full py-2.5 rounded-xl text-primary-foreground text-sm font-semibold transition-all active:scale-95"
                              style={{ backgroundColor: "var(--primary)" }}
                            >
                              Mark as Paid
                            </button>
                          )}

                          {isCreator && isPending && (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() =>
                                  handlePaymentStatus(
                                    expense.id,
                                    split.memberId,
                                    "confirmed",
                                  )
                                }
                                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold transition-all active:scale-95"
                              >
                                <Check size={15} />
                                Confirm
                              </button>
                              <button
                                onClick={() =>
                                  handlePaymentStatus(
                                    expense.id,
                                    split.memberId,
                                    "rejected",
                                  )
                                }
                                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-destructive text-white text-sm font-semibold transition-all active:scale-95"
                              >
                                <X size={15} />
                                Reject
                              </button>
                            </div>
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
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-sm text-white font-medium shrink-0"
                              style={{ backgroundColor: fromMember?.color }}
                            >
                              {s.fromName[0].toUpperCase()}
                            </div>
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
                return (
                  <div
                    key={message.id}
                    className={`flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    {!isMine && (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs text-white font-medium shrink-0 mt-1"
                        style={{ backgroundColor: sender?.color }}
                      >
                        {(sender?.name ?? "?")[0].toUpperCase()}
                      </div>
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
                );
              })
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      {tab === "chat" ? (
        <div className="p-4 border-t border-border bg-card">
          <div className="flex items-end gap-2">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Message the group"
              rows={1}
              className="flex-1 max-h-28 min-h-12 px-4 py-3 rounded-2xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none text-sm"
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageText.trim() || !currentMember}
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-primary-foreground transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              style={{ backgroundColor: "var(--primary)" }}
              title="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 border-t border-border bg-card">
          <button
            onClick={() => {
              setEditExpense(null);
              setAddOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-primary-foreground font-semibold transition-all active:scale-95"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <Plus size={20} />
            Add Expense
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 bottom-8 z-50 bg-card rounded-3xl p-6 shadow-2xl">
            <Dialog.Title className="text-base font-semibold text-foreground mb-1">
              Delete "{group.name}"?
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mb-5">
              This will permanently delete the group and all{" "}
              {group.expenses.length} expense
              {group.expenses.length !== 1 ? "s" : ""}. This cannot be undone.
            </Dialog.Description>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3.5 rounded-2xl bg-muted text-foreground text-sm font-medium transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteGroup}
                className="flex-1 py-3.5 rounded-2xl bg-destructive text-white text-sm font-semibold transition-all active:scale-95"
              >
                Delete
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={editGroupOpen} onOpenChange={setEditGroupOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-card pt-4 pb-3 px-5 flex items-center justify-between border-b border-border">
              <div className="w-10 h-1 bg-border rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Edit Group
              </Dialog.Title>
              <button
                onClick={() => setEditGroupOpen(false)}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-5 pb-10">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">
                  Group name
                </label>
                <input
                  type="text"
                  value={groupNameInput}
                  onChange={(e) => {
                    setGroupNameInput(e.target.value);
                    setGroupEditError("");
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
                {groupEditError && (
                  <p className="text-destructive text-xs mt-1">
                    {groupEditError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">
                  Currency
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {["PHP", "USD", "EUR", "GBP"].map((currency) => (
                    <button
                      key={currency}
                      type="button"
                      onClick={() => setGroupCurrencyInput(currency)}
                      className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        groupCurrencyInput === currency
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border bg-input-background text-muted-foreground"
                      }`}
                    >
                      {currency}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSaveGroupDetails}
                className="w-full py-4 rounded-2xl text-primary-foreground font-semibold text-base transition-all active:scale-95"
                style={{ backgroundColor: "var(--primary)" }}
              >
                Save Changes
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={!!deleteExpense}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteExpense(null);
            setDeleteReason("");
            setDeleteReasonError("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 bottom-8 z-50 bg-card rounded-3xl p-6 shadow-2xl">
            <Dialog.Title className="text-base font-semibold text-foreground mb-1">
              Delete expense?
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mb-4">
              Give a reason for deleting "{deleteExpense?.description}". This
              will be saved with the group history.
            </Dialog.Description>
            <textarea
              value={deleteReason}
              onChange={(e) => {
                setDeleteReason(e.target.value);
                setDeleteReasonError("");
              }}
              placeholder="Reason for deletion"
              className="w-full min-h-24 px-4 py-3 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none text-sm"
            />
            {deleteReasonError && (
              <p className="text-destructive text-xs mt-1.5">
                {deleteReasonError}
              </p>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setDeleteExpense(null);
                  setDeleteReason("");
                  setDeleteReasonError("");
                }}
                className="flex-1 py-3.5 rounded-2xl bg-muted text-foreground text-sm font-medium transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteExpense}
                className="flex-1 py-3.5 rounded-2xl bg-destructive text-white text-sm font-semibold transition-all active:scale-95"
              >
                Delete
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AddExpenseModal
        group={group}
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditExpense(null);
        }}
        onAdd={handleAddExpense}
        currentUser={currentUser}
        editExpense={editExpense}
      />
      <QRModal group={group} open={qrOpen} onClose={() => setQrOpen(false)} />
      <InviteModal
        group={group}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
}
