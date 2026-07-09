import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  Plus,
  QrCode,
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
  getMemberById,
  getTotalExpenses,
} from "./utils";
import { AddExpenseModal } from "./AddExpenseModal";
import { QRModal } from "./QRModal";
import { InviteModal } from "./InviteModal";

type Tab = "expenses" | "balances" | "settle";

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
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const balances = computeBalances(group);
  const settlements = computeSettlements(balances);
  const total = getTotalExpenses(group);
  const currentMember = group.members.find(
    (m) => m.id === currentUser.id || m.uid === currentUser.id,
  );

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

  function handleDeleteExpense(id: string) {
    onUpdate({ ...group, expenses: group.expenses.filter((e) => e.id !== id) });
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
                    onSelect={() => setConfirmDelete(true)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-destructive cursor-pointer hover:bg-destructive/10 outline-none transition-colors"
                  >
                    <Trash2 size={15} />
                    Delete Group
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
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
                                {payer?.name ?? "Unknown"}
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
                            <div className="flex gap-1 mt-1 justify-end">
                              <button
                                onClick={() => {
                                  setEditExpense(exp);
                                  setAddOpen(true);
                                }}
                                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                              >
                                <Edit2
                                  size={12}
                                  className="text-muted-foreground"
                                />
                              </button>
                              <button
                                onClick={() => handleDeleteExpense(exp.id)}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2
                                  size={12}
                                  className="text-destructive"
                                />
                              </button>
                            </div>
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
                        {b.memberName}
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
                      const isCreator = currentMember?.id === expense.paidBy;
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
                                  {fromMember?.name ?? "Unknown"}
                                </span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  pays{" "}
                                </span>
                                <span style={{ color: toMember?.color }}>
                                  {toMember?.name ?? "Unknown"}
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
                                  {s.fromName}
                                </span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  pays{" "}
                                </span>
                                <span style={{ color: toMember?.color }}>
                                  {s.toName}
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
      </div>

      {/* FAB */}
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

      <AddExpenseModal
        group={group}
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditExpense(null);
        }}
        onAdd={handleAddExpense}
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
