import { useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  Clock3,
  FileSpreadsheet,
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
  Upload,
  UserPlus,
  Shuffle,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { CurrentUser, Group, Expense, Split } from "./types";
import { UserAvatar } from "./UserAvatar";
import { GroupAvatar } from "./GroupAvatar";
import {
  deletePaymentImage,
  loadPaymentImage,
  savePaymentImage,
} from "../../lib/paymentImageService";
import {
  computeBalances,
  computeSettlements,
  formatCurrency,
  CATEGORY_ICONS,
  generateId,
  getExpensePayerId,
  getMemberById,
  getTotalExpenses,
  MEMBER_COLORS,
  mergeGroupMember,
} from "./utils";
import { AddExpenseModal } from "./AddExpenseModal";
import { QRModal } from "./QRModal";
import { InviteModal } from "./InviteModal";
import {
  exportExpensesCsv,
  exportExpensesTemplateCsv,
  parseExpensesCsv,
} from "./csvExpenses";

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
  const [groupAvatarSeedInput, setGroupAvatarSeedInput] = useState(
    group.avatarSeed,
  );
  const [groupEditError, setGroupEditError] = useState("");
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteReasonError, setDeleteReasonError] = useState("");
  const [messageText, setMessageText] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvImportCount, setCsvImportCount] = useState<number | null>(null);
  const [pendingCsvExpenses, setPendingCsvExpenses] = useState<Expense[] | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [paymentDetailsOpen, setPaymentDetailsOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [paymentActionError, setPaymentActionError] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [submitPayment, setSubmitPayment] = useState<{
    expense: Expense;
    split: Split;
  } | null>(null);
  const [creatorPaidConfirmation, setCreatorPaidConfirmation] = useState<{
    expense: Expense;
    split: Split;
  } | null>(null);
  const [submissionMethod, setSubmissionMethod] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [submissionNote, setSubmissionNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    title: string;
    dataUrl?: string;
    error?: string;
  } | null>(null);

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
          split.memberId !== getExpensePayerId(expense) &&
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

  function reviewPayment(
    expenseId: string,
    memberId: string,
    paymentStatus: "confirmed" | "rejected",
  ) {
    if (!currentMember) return;
    const rejectionReason =
      paymentStatus === "rejected"
        ? window.prompt("Why are you rejecting this payment?")?.trim()
        : undefined;
    if (paymentStatus === "rejected" && !rejectionReason) return;

    const reviewedAt = new Date().toISOString();
    onUpdate({
      ...group,
      expenses: group.expenses.map((expense) =>
        expense.id === expenseId
          ? {
              ...expense,
              splits: expense.splits.map((split) =>
                split.memberId === memberId
                  ? {
                      ...split,
                      paymentStatus,
                      confirmedAt: paymentStatus === "confirmed" ? reviewedAt : undefined,
                      confirmedBy: paymentStatus === "confirmed" ? currentMember.id : undefined,
                      paymentSubmission: split.paymentSubmission
                        ? {
                            ...split.paymentSubmission,
                            reviewedAt,
                            reviewedBy: currentMember.id,
                            rejectionReason,
                          }
                        : split.paymentSubmission,
                    }
                  : split,
              ),
            }
          : expense,
      ),
    });
  }

  function confirmBorrowerPaidByCreator() {
    if (!creatorPaidConfirmation || !currentMember) return;
    const { expense: targetExpense, split: targetSplit } = creatorPaidConfirmation;
    const confirmedAt = new Date().toISOString();

    onUpdate({
      ...group,
      expenses: group.expenses.map((expense) =>
        expense.id === targetExpense.id
          ? {
              ...expense,
              splits: expense.splits.map((split) =>
                split.memberId === targetSplit.memberId
                  ? {
                      ...split,
                      paymentStatus: "confirmed",
                      confirmedAt,
                      confirmedBy: currentMember.id,
                      paymentSubmission: split.paymentSubmission
                        ? {
                            ...split.paymentSubmission,
                            reviewedAt: confirmedAt,
                            reviewedBy: currentMember.id,
                            rejectionReason: undefined,
                          }
                        : undefined,
                    }
                  : split,
              ),
            }
          : expense,
      ),
    });
    setCreatorPaidConfirmation(null);
  }

  function openPaymentDetails() {
    const details = currentMember?.paymentInstructions;
    setPaymentMethod(details?.method ?? "");
    setAccountName(details?.accountName ?? "");
    setAccountIdentifier(details?.accountIdentifier ?? "");
    setPaymentNote(details?.instructions ?? "");
    setQrFile(null);
    setPaymentActionError("");
    setPaymentDetailsOpen(true);
  }

  async function savePaymentDetails() {
    if (!currentMember) return;
    if (!paymentMethod.trim()) {
      setPaymentActionError("Enter a payment method");
      return;
    }
    setPaymentSaving(true);
    setPaymentActionError("");
    try {
      const existing = currentMember.paymentInstructions;
      const qrCodeImageId = qrFile ? generateId() : existing?.qrCodeImageId;
      if (qrFile && qrCodeImageId) {
        await savePaymentImage(group.id, qrCodeImageId, currentUser.id, "qr-code", qrFile);
      }
      onUpdate({
        ...group,
        members: group.members.map((member) =>
          member.id === currentMember.id
            ? {
                ...member,
                paymentInstructions: {
                  method: paymentMethod.trim(),
                  accountName: accountName.trim() || undefined,
                  accountIdentifier: accountIdentifier.trim() || undefined,
                  instructions: paymentNote.trim() || undefined,
                  qrCodeImageId,
                },
              }
            : member,
        ),
      });
      setPaymentDetailsOpen(false);
    } catch (err) {
      setPaymentActionError(err instanceof Error ? err.message : "Unable to save payment details");
    } finally {
      setPaymentSaving(false);
    }
  }

  function removePaymentDetails() {
    if (!currentMember) return;
    const qrCodeImageId = currentMember.paymentInstructions?.qrCodeImageId;
    onUpdate({
      ...group,
      members: group.members.map((member) => {
        if (member.id !== currentMember.id) return member;
        const { paymentInstructions: _removed, ...withoutPaymentDetails } = member;
        return withoutPaymentDetails;
      }),
    });
    if (qrCodeImageId) {
      deletePaymentImage(group.id, qrCodeImageId).catch(() => {});
    }
    setPaymentDetailsOpen(false);
  }

  async function viewPaymentImage(imageId: string, title: string) {
    setImagePreview({ title });
    try {
      setImagePreview({ title, dataUrl: await loadPaymentImage(group.id, imageId) });
    } catch (err) {
      setImagePreview({
        title,
        error: err instanceof Error ? err.message : "Unable to load image",
      });
    }
  }

  function openPaymentSubmission(expense: Expense, split: Split) {
    const recipient = getMemberById(group, getExpensePayerId(expense));
    setSubmitPayment({ expense, split });
    setSubmissionMethod(recipient?.paymentInstructions?.method ?? "Cash / other");
    setReferenceNumber("");
    setSubmissionNote("");
    setProofFile(null);
    setPaymentActionError("");
  }

  async function submitPaymentForReview() {
    if (!submitPayment || !currentMember) return;
    if (!submissionMethod.trim()) {
      setPaymentActionError("Enter the payment method used");
      return;
    }
    setPaymentSaving(true);
    setPaymentActionError("");
    try {
      const proofImageId = proofFile ? generateId() : undefined;
      if (proofFile && proofImageId) {
        await savePaymentImage(
          group.id,
          proofImageId,
          currentUser.id,
          "payment-proof",
          proofFile,
        );
      }
      const { expense, split } = submitPayment;
      onUpdate({
        ...group,
        expenses: group.expenses.map((item) =>
          item.id === expense.id
            ? {
                ...item,
                splits: item.splits.map((itemSplit) =>
                  itemSplit.memberId === split.memberId
                    ? {
                        ...itemSplit,
                        paymentStatus: "pending",
                        paymentSubmission: {
                          method: submissionMethod.trim(),
                          referenceNumber: referenceNumber.trim() || undefined,
                          note: submissionNote.trim() || undefined,
                          proofImageId,
                          submittedAt: new Date().toISOString(),
                        },
                      }
                    : itemSplit,
                ),
              }
            : item,
        ),
      });
      setSubmitPayment(null);
    } catch (err) {
      setPaymentActionError(err instanceof Error ? err.message : "Unable to submit payment");
    } finally {
      setPaymentSaving(false);
    }
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

  function handleAddPendingMember(name: string): string | undefined {
    if (!isAdmin) return "Only the group admin can add pending members";
    const normalized = name.trim().toLowerCase();
    if (group.members.some((member) => member.name.trim().toLowerCase() === normalized)) {
      return "A member with that name already exists";
    }
    const index = group.members.length % MEMBER_COLORS.length;
    onUpdate({
      ...group,
      members: [
        ...group.members,
        {
          id: generateId(),
          name: name.trim(),
          color: MEMBER_COLORS[index],
          avatarSeed: crypto.randomUUID(),
          claimCode: crypto.randomUUID(),
        },
      ],
    });
    return undefined;
  }

  function handleMergePendingMember(pendingId: string, joinedId: string) {
    if (!isAdmin) return;
    const pending = group.members.find((member) => member.id === pendingId);
    const joined = group.members.find((member) => member.id === joinedId);
    if (!pending || pending.uid || !joined?.uid) return;
    onUpdate(mergeGroupMember(group, pendingId, joinedId));
  }

  function handleDeletePendingMember(memberId: string): string | undefined {
    if (!isAdmin) return "Only the group admin can remove pending members";
    const isUsed =
      group.expenses.some(
        (expense) =>
          expense.paidBy === memberId ||
          expense.createdBy === memberId ||
          expense.splits.some((split) => split.memberId === memberId),
      ) ||
      (group.messages ?? []).some((message) => message.memberId === memberId) ||
      (group.deletedExpenses ?? []).some(
        (expense) => expense.deletedBy === memberId,
      );
    if (isUsed) return "This member has group activity. Merge them instead of deleting them.";
    onUpdate({
      ...group,
      members: group.members.filter((member) => member.id !== memberId),
    });
    return undefined;
  }

  function openEditGroup() {
    setGroupNameInput(group.name);
    setGroupCurrencyInput(group.currency);
    setGroupAvatarSeedInput(group.avatarSeed);
    setGroupEditError("");
    setEditGroupOpen(true);
  }

  function handleSaveGroupDetails() {
    const name = groupNameInput.trim();
    if (!name) {
      setGroupEditError("Group name is required");
      return;
    }

    onUpdate({
      ...group,
      name,
      currency: groupCurrencyInput,
      avatarSeed: groupAvatarSeedInput,
    });
    setEditGroupOpen(false);
    setGroupEditError("");
  }

  function handleDeleteGroup() {
    onDelete(group.id);
    onBack();
  }

  function downloadCsv(filename: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvFilename(suffix: string) {
    const safeName = group.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${safeName || "group"}-${suffix}.csv`;
  }

  function handleDownloadTemplate() {
    setCsvErrors([]);
    setCsvImportCount(null);
    setPendingCsvExpenses(null);
    downloadCsv(csvFilename("expense-template"), exportExpensesTemplateCsv(group));
  }

  function handleExportExpenses() {
    setCsvErrors([]);
    setCsvImportCount(null);
    setPendingCsvExpenses(null);
    downloadCsv(csvFilename("expenses"), exportExpensesCsv(group));
  }

  async function handleImportFile(file: File) {
    if (!currentMember) return;
    const text = await file.text();
    const result = parseExpensesCsv(text, group, currentMember.id);
    if (!result.ok) {
      setCsvErrors(result.errors);
      setCsvImportCount(null);
      setPendingCsvExpenses(null);
      return;
    }

    setPendingCsvExpenses(result.expenses);
    setCsvErrors([]);
    setCsvImportCount(null);
  }

  function confirmCsvImport() {
    if (!pendingCsvExpenses) return;
    onUpdate({
      ...group,
      expenses: [...pendingCsvExpenses, ...group.expenses],
    });
    setCsvErrors([]);
    setCsvImportCount(pendingCsvExpenses.length);
    setPendingCsvExpenses(null);
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
                  className="z-50 min-w-[170px] bg-card border border-border rounded-2xl shadow-xl overflow-hidden py-1"
                >
                  <DropdownMenu.Item
                    onSelect={() => {
                      setCsvErrors([]);
                      setCsvImportCount(null);
                      setPendingCsvExpenses(null);
                      setCsvOpen(true);
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-foreground cursor-pointer hover:bg-muted outline-none transition-colors"
                  >
                    <FileSpreadsheet size={15} />
                    CSV Tools
                  </DropdownMenu.Item>
                  {isAdmin && (
                    <>
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
                    </>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <GroupAvatar
            name={group.name}
            seed={group.avatarSeed}
            className="w-12 h-12 rounded-2xl shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-foreground mb-1 truncate">{group.name}</h1>
            <div className="flex items-center gap-3 flex-wrap">
          <div className="flex -space-x-2">
            {group.members.slice(0, 5).map((m) => (
              <UserAvatar
                key={m.id}
                name={m.name}
                color={m.color}
                seed={m.avatarSeed}
                className={`w-7 h-7 rounded-full text-xs border-2 ${m.uid || m.id === currentUser.id ? "border-card" : "border-amber-400"}`}
                title={`${m.name}${m.uid || m.id === currentUser.id ? "" : " (pending)"}`}
              />
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
                      const isExpenseCreator =
                        currentMember?.id === (expense.createdBy ?? expense.paidBy);
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

                          {isExpenseCreator && !isPayer && !(isRecipient && isPending) && (
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
                return (
                  <div
                    key={message.id}
                    className={`flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                  >
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
              <div className="flex flex-col items-center">
                <GroupAvatar
                  name={groupNameInput || group.name}
                  seed={groupAvatarSeedInput}
                  className="w-20 h-20 rounded-2xl shadow-md"
                />
                <button
                  type="button"
                  onClick={() => setGroupAvatarSeedInput(crypto.randomUUID())}
                  className="inline-flex items-center gap-2 mt-3 px-3 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-semibold active:scale-95 transition-all"
                >
                  <Shuffle size={14} />
                  Randomize group image
                </button>
              </div>

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

      <Dialog.Root open={csvOpen} onOpenChange={setCsvOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl shadow-2xl">
            <div className="pt-4 pb-3 px-5 flex items-center justify-between border-b border-border relative">
              <div className="w-10 h-1 bg-border rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
              <Dialog.Title className="text-lg font-semibold text-foreground">
                CSV Tools
              </Dialog.Title>
              <button
                onClick={() => setCsvOpen(false)}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 pb-10 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    handleImportFile(file).catch(() => {
                      setCsvErrors(["Unable to read that CSV file"]);
                      setCsvImportCount(null);
                    });
                  }
                }}
              />

              <button
                onClick={handleDownloadTemplate}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-input-background border border-border text-foreground text-sm font-medium transition-all active:scale-95"
              >
                <Download size={18} className="text-muted-foreground" />
                Download Template
              </button>

              {isAdmin && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-input-background border border-border text-foreground text-sm font-medium transition-all active:scale-95"
                >
                  <Upload size={18} className="text-muted-foreground" />
                  Import Expenses CSV
                </button>
              )}

              <button
                onClick={handleExportExpenses}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-input-background border border-border text-foreground text-sm font-medium transition-all active:scale-95"
              >
                <FileSpreadsheet size={18} className="text-muted-foreground" />
                Export Expenses CSV
              </button>

              {!isAdmin && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Only the group admin can import expenses.
                </p>
              )}

              {csvImportCount !== null && (
                <p className="text-sm text-green-600 font-medium">
                  Imported {csvImportCount} expense
                  {csvImportCount === 1 ? "" : "s"}.
                </p>
              )}

              {pendingCsvExpenses && (
                <div className="rounded-2xl bg-accent border border-border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Import {pendingCsvExpenses.length} expense
                      {pendingCsvExpenses.length === 1 ? "" : "s"}?
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This will add the CSV expenses to the group.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPendingCsvExpenses(null)}
                      className="py-3 rounded-xl bg-muted text-foreground text-sm font-medium transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmCsvImport}
                      className="py-3 rounded-xl text-primary-foreground text-sm font-semibold transition-all active:scale-95"
                      style={{ backgroundColor: "var(--primary)" }}
                    >
                      Import
                    </button>
                  </div>
                </div>
              )}

              {csvErrors.length > 0 && (
                <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-4">
                  <p className="text-sm font-semibold text-destructive mb-2">
                    Import failed
                  </p>
                  <ul className="space-y-1">
                    {csvErrors.slice(0, 8).map((error) => (
                      <li
                        key={error}
                        className="text-xs text-destructive leading-relaxed"
                      >
                        {error}
                      </li>
                    ))}
                  </ul>
                  {csvErrors.length > 8 && (
                    <p className="text-xs text-destructive mt-2">
                      {csvErrors.length - 8} more error
                      {csvErrors.length - 8 === 1 ? "" : "s"}.
                    </p>
                  )}
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={!!creatorPaidConfirmation}
        onOpenChange={(open) => !open && setCreatorPaidConfirmation(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 bottom-8 z-50 bg-card rounded-3xl p-6 shadow-2xl">
            <Dialog.Title className="text-base font-semibold text-foreground mb-1">
              Mark borrower as paid?
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground leading-relaxed mb-5">
              This confirms that{" "}
              <span className="font-medium text-foreground">
                {creatorPaidConfirmation
                  ? getMemberById(group, creatorPaidConfirmation.split.memberId)?.name ?? "this borrower"
                  : "this borrower"}
              </span>{" "}
              paid{" "}
              <span className="font-medium text-foreground">
                {creatorPaidConfirmation
                  ? formatCurrency(creatorPaidConfirmation.split.amount, group.currency)
                  : ""}
              </span>{" "}
              for “{creatorPaidConfirmation?.expense.description}”. No payment proof is required because you created this expense.
            </Dialog.Description>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setCreatorPaidConfirmation(null)}
                className="py-3.5 rounded-2xl bg-muted text-foreground text-sm font-medium transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={confirmBorrowerPaidByCreator}
                className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-green-600 text-white text-sm font-semibold transition-all active:scale-95"
              >
                <Check size={16} />
                Confirm paid
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={paymentDetailsOpen} onOpenChange={setPaymentDetailsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 bottom-8 z-50 bg-card rounded-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-semibold text-foreground">Payment instructions</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mt-1 mb-4">
              Optional details that help members of this group pay you.
            </Dialog.Description>
            <div className="space-y-3">
              <input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Method (e.g. GCash, BPI, cash)" className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary" />
              <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account name (optional)" className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary" />
              <input value={accountIdentifier} onChange={(e) => setAccountIdentifier(e.target.value)} placeholder="Account or mobile number (optional)" className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary" />
              <textarea value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Additional instructions (optional)" className="w-full min-h-20 px-4 py-3 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary resize-none" />
              <label className="block rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground cursor-pointer">
                Payment QR image (optional)
                <input type="file" accept="image/*" className="block mt-2 text-xs" onChange={(e) => setQrFile(e.target.files?.[0] ?? null)} />
              </label>
              {currentMember?.paymentInstructions?.qrCodeImageId && !qrFile && (
                <p className="text-xs text-muted-foreground">Your current QR image will be kept.</p>
              )}
              {paymentActionError && <p className="text-xs text-destructive">{paymentActionError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={() => setPaymentDetailsOpen(false)} className="py-3 rounded-2xl bg-muted text-sm font-medium">Cancel</button>
              <button disabled={paymentSaving} onClick={savePaymentDetails} className="py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                {paymentSaving ? "Saving…" : "Save"}
              </button>
            </div>
            {currentMember?.paymentInstructions && (
              <button onClick={removePaymentDetails} className="w-full mt-3 py-2 text-sm text-destructive font-medium">
                Remove payment instructions
              </button>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={!!submitPayment} onOpenChange={(open) => !open && setSubmitPayment(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 bottom-8 z-50 bg-card rounded-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-semibold text-foreground">Submit payment</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mt-1 mb-4">
              Payment proof and reference details are optional.
            </Dialog.Description>
            <div className="space-y-3">
              <input value={submissionMethod} onChange={(e) => setSubmissionMethod(e.target.value)} placeholder="Payment method used" className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary" />
              <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Reference number (optional)" className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary" />
              <textarea value={submissionNote} onChange={(e) => setSubmissionNote(e.target.value)} placeholder="Note to collector (optional)" className="w-full min-h-20 px-4 py-3 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary resize-none" />
              <label className="block rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground cursor-pointer">
                Payment proof (optional)
                <input type="file" accept="image/*" className="block mt-2 text-xs" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} />
              </label>
              {paymentActionError && <p className="text-xs text-destructive">{paymentActionError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={() => setSubmitPayment(null)} className="py-3 rounded-2xl bg-muted text-sm font-medium">Cancel</button>
              <button disabled={paymentSaving} onClick={submitPaymentForReview} className="py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                {paymentSaving ? "Submitting…" : "Submit"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={!!imagePreview} onOpenChange={(open) => !open && setImagePreview(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[60] bg-card rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-semibold text-foreground">
                {imagePreview?.title}
              </Dialog.Title>
              <button onClick={() => setImagePreview(null)} className="p-2 rounded-full hover:bg-muted">
                <X size={18} />
              </button>
            </div>
            {!imagePreview?.dataUrl && !imagePreview?.error && (
              <div className="py-16 text-center text-sm text-muted-foreground">Loading image…</div>
            )}
            {imagePreview?.error && (
              <div className="py-10 text-center text-sm text-destructive">{imagePreview.error}</div>
            )}
            {imagePreview?.dataUrl && (
              <img
                src={imagePreview.dataUrl}
                alt={imagePreview.title}
                className="w-full max-h-[65vh] object-contain rounded-2xl bg-white"
              />
            )}
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
        isAdmin={isAdmin}
      />
      <QRModal
        group={group}
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        isAdmin={isAdmin}
      />
      <InviteModal
        group={group}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        isAdmin={isAdmin}
        onAddPending={handleAddPendingMember}
        onMergePending={handleMergePendingMember}
        onDeletePending={handleDeletePendingMember}
      />
    </div>
  );
}
