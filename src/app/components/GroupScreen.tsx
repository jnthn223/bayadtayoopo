import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  FileSpreadsheet,
  Plus,
  Send,
  Upload,
  Shuffle,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { CurrentUser, Group, Expense, Split } from "./types";
import { GroupAvatar } from "./GroupAvatar";
import {
  deletePaymentImage,
  loadPaymentImage,
  savePaymentImage,
} from "../../lib/paymentImageService";
import {
  archiveGroupMember,
  computeBalances,
  computeSettlements,
  formatCurrency,
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
import { getGroupTourTarget, GroupTour } from "./GroupTour";
import { GroupHeader } from "./GroupHeader";
import type { GroupTab } from "./GroupHeader";
import { GroupContent } from "./GroupContent";
import {
  exportExpensesCsv,
  exportExpensesTemplateCsv,
  parseExpensesCsv,
} from "./csvExpenses";

type Tab = GroupTab;

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
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const chatReadKey = `bayadtayoopo:chat-read:${currentUser.id}:${group.id}`;
  const groupTourKey = `bayadtayoopo:group-tour:${currentUser.id}:${group.id}`;
  const [tab, setTab] = useState<Tab>("expenses");
  const [groupTourStep, setGroupTourStep] = useState<number | null>(null);
  const [lastChatReadAt, setLastChatReadAt] = useState(
    () => localStorage.getItem(chatReadKey) ?? "",
  );
  const [chatRevealMessageId, setChatRevealMessageId] = useState<string | null>(
    null,
  );
  const firstUnreadMessageRef = useRef<HTMLDivElement | null>(null);
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
  const activeMemberIds = new Set(group.members.map((member) => member.id));
  const activeBalances = balances.filter((balance) =>
    activeMemberIds.has(balance.memberId),
  );
  const settlements = computeSettlements(balances);
  const total = getTotalExpenses(group);
  const messages = [...(group.messages ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const currentMember = group.members.find(
    (m) => m.id === currentUser.id || m.uid === currentUser.id,
  );
  const adminId = group.adminId ?? group.members[0]?.id;
  const isOwner = !!currentMember &&
    (currentMember.id === adminId || currentMember.uid === adminId);
  const isAdmin = !!currentMember && (
    isOwner ||
    (group.adminIds ?? []).some(
      (memberId) => memberId === currentMember.id || memberId === currentMember.uid,
    )
  );
  const activeGroupTourTarget = getGroupTourTarget(groupTourStep);
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
  const relevantPaymentMemberIds = new Set<string>();
  if (currentMember) {
    paymentItems.forEach(({ expense, split }) => {
      const payerId = getExpensePayerId(expense);
      if (
        split.memberId === currentMember.id &&
        activeMemberIds.has(payerId)
      ) {
        relevantPaymentMemberIds.add(payerId);
      } else if (
        payerId === currentMember.id &&
        activeMemberIds.has(split.memberId)
      ) {
        relevantPaymentMemberIds.add(split.memberId);
      }
    });
  }
  const outstandingMemberCount = relevantPaymentMemberIds.size;
  const unreadChatCount = messages.filter(
    (message) =>
      message.memberId !== currentMember?.id &&
      (!lastChatReadAt || message.createdAt > lastChatReadAt),
  ).length;

  function markChatRead() {
    const latestMessageAt = messages.at(-1)?.createdAt ?? "";
    const readAt = latestMessageAt > new Date().toISOString()
      ? latestMessageAt
      : new Date().toISOString();
    localStorage.setItem(chatReadKey, readAt);
    setLastChatReadAt(readAt);
  }

  function handleTabChange(nextTab: Tab) {
    if (nextTab === "chat" && tab !== "chat") {
      const firstUnreadMessage = messages.find(
        (message) =>
          message.memberId !== currentMember?.id &&
          (!lastChatReadAt || message.createdAt > lastChatReadAt),
      );
      setChatRevealMessageId(firstUnreadMessage?.id ?? null);
    } else if (nextTab !== "chat") {
      setChatRevealMessageId(null);
    }
    setTab(nextTab);
  }

  useEffect(() => {
    setLastChatReadAt(localStorage.getItem(chatReadKey) ?? "");
  }, [chatReadKey]);

  useEffect(() => {
    setGroupTourStep(null);
    if (localStorage.getItem(groupTourKey) === "complete") return;
    const timeout = window.setTimeout(() => setGroupTourStep(0), 700);
    return () => window.clearTimeout(timeout);
  }, [groupTourKey]);

  useEffect(() => {
    if (tab !== "chat" || !chatRevealMessageId) return;
    const frame = window.requestAnimationFrame(() => {
      firstUnreadMessageRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab, chatRevealMessageId]);

  useEffect(() => {
    if (tab === "chat") markChatRead();
  }, [tab, messages.at(-1)?.id, chatReadKey]);

  function closeGroupTour() {
    localStorage.setItem(groupTourKey, "complete");
    setGroupTourStep(null);
  }

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

  function handleRemoveMember(memberId: string): string | undefined {
    if (!isAdmin) return "Only a group admin can remove members";
    const member = group.members.find((candidate) => candidate.id === memberId);
    if (!member) return "Member not found";
    if (member.id === currentMember?.id) return "You cannot remove yourself";
    if (member.id === adminId || member.uid === adminId) {
      return "The group owner cannot be removed";
    }

    onUpdate(archiveGroupMember(group, memberId));
    return undefined;
  }

  function handleSetMemberAdmin(memberId: string, makeAdmin: boolean): string | undefined {
    if (!isAdmin) return "Only a group admin can manage admin access";
    const member = group.members.find((candidate) => candidate.id === memberId);
    if (!member?.uid) return "Only members who have joined can become admins";
    const isGroupOwner = member.id === adminId || member.uid === adminId;
    if (isGroupOwner && !makeAdmin) return "The group owner cannot be removed as an admin";

    const identifiers = new Set([member.id, member.uid].filter(Boolean));
    const nextAdminIds = (group.adminIds ?? []).filter(
      (adminMemberId) => !identifiers.has(adminMemberId),
    );
    if (makeAdmin) nextAdminIds.push(member.id);

    onUpdate({
      ...group,
      adminIds: [...new Set([adminId, ...nextAdminIds].filter(Boolean) as string[])],
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
    if (!isOwner) return;
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
      <GroupHeader
        group={group}
        currentUser={currentUser}
        total={total}
        tab={tab}
        tourTarget={activeGroupTourTarget}
        unreadChatCount={unreadChatCount}
        outstandingMemberCount={outstandingMemberCount}
        isAdmin={isAdmin}
        isOwner={isOwner}
        onBack={onBack}
        onTabChange={handleTabChange}
        onManageMembers={() => setInviteOpen(true)}
        onShare={() => setQrOpen(true)}
        onCsvTools={() => {
          setCsvErrors([]);
          setCsvImportCount(null);
          setPendingCsvExpenses(null);
          setCsvOpen(true);
        }}
        onShowGuide={() => setGroupTourStep(0)}
        onEdit={openEditGroup}
        onDelete={() => setConfirmDelete(true)}
      />
      {/* Content */}
      <GroupContent
        tab={tab}
        group={group}
        currentMember={currentMember}
        isAdmin={isAdmin}
        activeBalances={activeBalances}
        settlements={settlements}
        paymentItems={paymentItems}
        kofiUrl={kofiUrl}
        expensesByDate={expensesByDate}
        sortedDates={sortedDates}
        messages={messages}
        chatRevealMessageId={chatRevealMessageId}
        firstUnreadMessageRef={firstUnreadMessageRef}
        displayMemberName={displayMemberName}
        setEditExpense={setEditExpense}
        setAddOpen={setAddOpen}
        openDeleteExpense={openDeleteExpense}
        openPaymentDetails={openPaymentDetails}
        viewPaymentImage={viewPaymentImage}
        openPaymentSubmission={openPaymentSubmission}
        reviewPayment={reviewPayment}
        setCreatorPaidConfirmation={setCreatorPaidConfirmation}
      />
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
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-primary-foreground font-semibold transition-all active:scale-95 ${
              activeGroupTourTarget === "expense"
                ? "relative z-[60] ring-4 ring-primary/35 shadow-2xl scale-[1.02]"
                : ""
            }`}
            style={{ backgroundColor: "var(--primary)" }}
          >
            <Plus size={20} />
            Add Expense
          </button>
        </div>
      )}

      {groupTourStep !== null && (
        <GroupTour
          groupName={group.name}
          isAdmin={isAdmin}
          step={groupTourStep}
          onStepChange={setGroupTourStep}
          onClose={closeGroupTour}
        />
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
              for “{creatorPaidConfirmation?.expense.description}”.{" "}
              {creatorPaidConfirmation &&
              currentMember?.id ===
                getExpensePayerId(creatorPaidConfirmation.expense)
                ? "Use this when you received the payment directly; no payment proof is required."
                : "No payment proof is required because you created this expense."}
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
        onRemoveMember={handleRemoveMember}
        onSetMemberAdmin={handleSetMemberAdmin}
      />
    </div>
  );
}
