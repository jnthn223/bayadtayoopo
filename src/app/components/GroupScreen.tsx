import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Plus,
  Send,
  Upload,
  Shuffle,
  Camera,
  ImageOff,
  FilePenLine,
  Trash2,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type {
  CurrentUser,
  Group,
  Expense,
  NotificationDestination,
  Split,
} from "./types";
import { GroupAvatar } from "./GroupAvatar";
import { ImagePasteControl } from "./ImagePasteControl";
import {
  deletePaymentImage,
  loadPaymentImage,
  savePaymentImage,
} from "../../lib/paymentImageService";
import {
  deleteGroupImage,
  saveGroupImage,
} from "../../lib/groupImageService";
import {
  archiveGroupMember,
  computeBalances,
  computeProjectedBalances,
  computeSettlements,
  formatCurrency,
  generateId,
  getExpenseContributorIds,
  getExpensePayerId,
  getOutstandingExpenseShares,
  getConfirmedOutstandingExpenseShares,
  getMemberById,
  isExpenseSettled,
  isGroupAdmin,
  getTotalExpenses,
  MEMBER_COLORS,
  mergeGroupMember,
} from "./utils";
import { upsertExpense } from "./quickAddExpense";
import { AddExpenseModal } from "./AddExpenseModal";
import {
  deleteOfflineExpenseDraft,
  loadOfflineExpenseDrafts,
  saveOfflineExpenseDraft,
  type OfflineExpenseDraft,
} from "./offlineExpenseDrafts";
import { QRModal } from "./QRModal";
import { InviteModal } from "./InviteModal";
import { DirectClaimInviteModal } from "./DirectClaimInviteModal";
import { getGroupTourTarget, GroupTour } from "./GroupTour";
import { MemberCatchUp } from "./MemberCatchUp";
import { DirectHistoryReview } from "./DirectHistoryReview";
import { GroupHeader } from "./GroupHeader";
import type { GroupTab } from "./GroupHeader";
import { GroupContent } from "./GroupContent";
import { UserAvatar } from "./UserAvatar";
import { buildOverallBalances } from "./overallBalances";
import { ArchiveBlockedDialog } from "./ArchiveBlockedDialog";
import {
  SpendingBreakdownModal,
  type SpendingBreakdownSection,
} from "./SpendingBreakdownModal";
import {
  findMentionRange,
  getMentionedMemberIds,
  insertMention,
} from "./chatMentions";
import {
  exportExpensesCsv,
  exportExpensesTemplateCsv,
  MAX_CSV_FILE_BYTES,
  parseExpensesCsv,
  validateExpenseImportBatch,
} from "./csvExpenses";

type Tab = GroupTab;

interface Props {
  group: Group;
  currentUser: CurrentUser;
  destination?: NotificationDestination | null;
  onBack: () => void;
  onUpdate: (group: Group) => Promise<void> | void;
  onDelete: (groupId: string) => void;
  allGroups?: Group[];
  onOpenGroup?: (group: Group) => void;
  onUpdateUser: (user: CurrentUser) => void;
  onArchiveGroup: (group: Group) => void;
  pendingExpenseIds?: string[];
  onQueueExpense?: (group: Group, expense: Expense) => Promise<void> | void;
}

export function GroupScreen({
  group,
  currentUser,
  destination,
  onBack,
  onUpdate,
  onDelete,
  allGroups = [],
  onOpenGroup,
  onUpdateUser,
  onArchiveGroup,
  pendingExpenseIds = [],
  onQueueExpense,
}: Props) {
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const chatReadKey = `bayadtayoopo:chat-read:${currentUser.id}:${group.id}`;
  const groupTourKey = `bayadtayoopo:group-tour:${currentUser.id}:${group.id}`;
  const [includeArchivedGroups, setIncludeArchivedGroups] = useState(false);
  const [archiveBlockedReason, setArchiveBlockedReason] = useState<string>();
  const messages = [...(Array.isArray(group.messages) ? group.messages : [])]
    .filter(
      (message) =>
        !!message &&
        typeof message.id === "string" &&
        typeof message.memberId === "string" &&
        typeof message.text === "string" &&
        typeof message.createdAt === "string",
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const currentMember = group.members.find(
    (member) => member.id === currentUser.id || member.uid === currentUser.id,
  );
  const memberCatchUpKey = currentMember
    ? `bayadtayoopo:member-catch-up:${currentUser.id}:${group.id}:${currentMember.id}`
    : "";
  const initialChatReadAt = localStorage.getItem(chatReadKey) ?? "";
  const [tab, setTab] = useState<Tab>(destination?.tab ?? "expenses");
  const [groupTourStep, setGroupTourStep] = useState<number | null>(null);
  const [memberCatchUpOpen, setMemberCatchUpOpen] = useState(false);
  const [directHistoryReviewOpen, setDirectHistoryReviewOpen] = useState(false);
  const [lastChatReadAt, setLastChatReadAt] = useState(
    initialChatReadAt,
  );
  const [chatRevealMessageId, setChatRevealMessageId] = useState<string | null>(() => {
    if (destination?.tab !== "chat") return null;
    if (destination.messageId) return destination.messageId;
    return messages.find(
      (message) =>
        message.memberId !== currentMember?.id &&
        (!initialChatReadAt || message.createdAt > initialChatReadAt),
    )?.id ?? null;
  });
  const firstUnreadMessageRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineExpenseDraft[]>(() =>
    loadOfflineExpenseDrafts(currentUser.id),
  );
  const [selectedOfflineDraft, setSelectedOfflineDraft] = useState<OfflineExpenseDraft | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sharedGroupSummaryOpen, setSharedGroupSummaryOpen] = useState(true);
  const [personExpenseScope, setPersonExpenseScope] = useState<"all" | "direct" | "shared">("all");
  const [expenseTotalView, setExpenseTotalView] = useState<"unsettled" | "all">("unsettled");
  const [spendingBreakdownOpen, setSpendingBreakdownOpen] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState(group.name);
  const [groupCurrencyInput, setGroupCurrencyInput] = useState(group.currency);
  const [groupAvatarSeedInput, setGroupAvatarSeedInput] = useState(
    group.avatarSeed,
  );
  const [groupImageVersionInput, setGroupImageVersionInput] = useState(
    group.groupImageVersion,
  );
  const [groupPhotoSaving, setGroupPhotoSaving] = useState(false);
  const [groupPhotoError, setGroupPhotoError] = useState("");
  const [groupEditError, setGroupEditError] = useState("");
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [correctionReasonOpen, setCorrectionReasonOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionReasonError, setCorrectionReasonError] = useState("");
  const correctionReasonResolverRef = useRef<((reason: string) => void) | null>(null);
  const [rejectCorrectionId, setRejectCorrectionId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionReasonError, setRejectionReasonError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteReasonError, setDeleteReasonError] = useState("");
  const [messageText, setMessageText] = useState("");
  const [messageCursor, setMessageCursor] = useState(0);
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(
    null,
  );
  const groupOfflineDrafts = offlineDrafts.filter((draft) => draft.groupId === group.id);

  useEffect(() => {
    setOfflineDrafts(loadOfflineExpenseDrafts(currentUser.id));
    setSelectedOfflineDraft(null);
  }, [currentUser.id, group.id]);
  const messageTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvImportCount, setCsvImportCount] = useState<number | null>(null);
  const [csvImportAwaitingReview, setCsvImportAwaitingReview] = useState(false);
  const [pendingCsvExpenses, setPendingCsvExpenses] = useState<Expense[] | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rejectImportId, setRejectImportId] = useState<string | null>(null);
  const [importRejectionReason, setImportRejectionReason] = useState("");
  const [importRejectionError, setImportRejectionError] = useState("");
  const [directImportError, setDirectImportError] = useState("");
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
  const settlements = computeSettlements(computeProjectedBalances(group));
  const total = getTotalExpenses(group);
  const adminId = group.adminId ?? group.members[0]?.id;
  const isOwner = !!currentMember &&
    (currentMember.id === adminId || currentMember.uid === adminId);
  const isAdmin = isGroupAdmin(group, currentMember);
  const activeGroupTourTarget = getGroupTourTarget(groupTourStep);
  const displayMemberName = (memberId: string, fallback?: string) =>
    memberId === currentMember?.id ? "You" : (fallback ?? "Unknown");

  const paymentItems = group.expenses.flatMap((expense) =>
    expense.splits
      .filter(
        (split) =>
          split.memberId !== getExpensePayerId(expense) &&
          split.amount > 0.005 &&
          !!(split.paymentStatus || split.paymentSubmission) &&
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
    settlements.forEach((settlement) => {
      if (
        settlement.from === currentMember.id &&
        activeMemberIds.has(settlement.to)
      ) {
        relevantPaymentMemberIds.add(settlement.to);
      } else if (
        settlement.to === currentMember.id &&
        activeMemberIds.has(settlement.from)
      ) {
        relevantPaymentMemberIds.add(settlement.from);
      }
    });
    (group.payments ?? [])
      .filter((payment) =>
        ["pending", "rejected"].includes(payment.status),
      )
      .forEach((payment) => {
        if (
          payment.fromMemberId === currentMember.id &&
          activeMemberIds.has(payment.toMemberId)
        ) {
          relevantPaymentMemberIds.add(payment.toMemberId);
        } else if (
          payment.toMemberId === currentMember.id &&
          activeMemberIds.has(payment.fromMemberId)
        ) {
          relevantPaymentMemberIds.add(payment.fromMemberId);
        }
      });
  }
  const outstandingMemberCount = relevantPaymentMemberIds.size;
  const memberRequestCount = (group.memberClaimRequests ?? []).filter(
    (request) => request.status === "pending",
  ).length;
  const unreadChatCount = messages.filter(
    (message) =>
      message.memberId !== currentMember?.id &&
      (!lastChatReadAt || message.createdAt > lastChatReadAt),
  ).length;
  const detectedMentionRange = findMentionRange(messageText, messageCursor);
  const activeMentionRange =
    detectedMentionRange?.query.endsWith(" ") &&
    group.members.some(
      (member) =>
        member.name.toLocaleLowerCase() ===
        detectedMentionRange.query.trim().toLocaleLowerCase(),
    )
      ? null
      : detectedMentionRange;
  const mentionSuggestions = activeMentionRange
    ? group.members
        .filter(
          (member) =>
            !!member.uid &&
            member.id !== currentMember?.id &&
            member.uid !== currentMember?.uid &&
            member.name
              .toLocaleLowerCase()
              .includes(activeMentionRange.query.trim().toLocaleLowerCase()),
        )
        .slice(0, 5)
    : [];

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
    setReplyingToMessageId(null);
  }, [chatReadKey]);

  useEffect(() => {
    if (!destination) return;
    setTab(destination.tab);
    if (destination.manageMembers) {
      setInviteOpen(true);
    }
    if (destination.messageId) {
      setChatRevealMessageId(destination.messageId);
    }
    const targetId =
      destination.paymentId
        ? `payment-${destination.paymentId}`
        : destination.expenseId
          ? `expense-${destination.expenseId}`
          : destination.messageId
            ? `message-${destination.messageId}`
            : "";
    if (!targetId) return;
    const timeout = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [
    destination?.tab,
    destination?.expenseId,
    destination?.paymentId,
    destination?.messageId,
    destination?.manageMembers,
  ]);

  useEffect(() => {
    setMemberCatchUpOpen(false);
    if (group.kind === "direct") return;
    if (!currentMember?.claimedFromPlaceholder || !memberCatchUpKey) return;
    if (localStorage.getItem(memberCatchUpKey) === "complete") return;
    setMemberCatchUpOpen(true);
  }, [group.kind, currentMember?.claimedFromPlaceholder, memberCatchUpKey]);

  useEffect(() => {
    const shouldReview =
      group.kind === "direct" &&
      group.directStatus === "pending" &&
      !!currentMember?.claimedFromPlaceholder &&
      group.directRequestedBy !== currentMember.id &&
      !group.directHistoryReviewedAt;
    setDirectHistoryReviewOpen(shouldReview);
  }, [
    group.kind,
    group.directStatus,
    group.directRequestedBy,
    group.directHistoryReviewedAt,
    currentMember?.id,
    currentMember?.claimedFromPlaceholder,
  ]);

  useEffect(() => {
    setGroupTourStep(null);
    if (group.kind === "direct") return;
    if (memberCatchUpOpen) return;
    if (localStorage.getItem(groupTourKey) === "complete") return;
    const timeout = window.setTimeout(() => setGroupTourStep(0), 700);
    return () => window.clearTimeout(timeout);
  }, [group.kind, groupTourKey, memberCatchUpOpen]);

  useEffect(() => {
    if (tab !== "chat") return;
    const frame = window.requestAnimationFrame(() => {
      if (chatRevealMessageId) {
        firstUnreadMessageRef.current?.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      } else {
        chatEndRef.current?.scrollIntoView({
          behavior: "auto",
          block: "end",
        });
      }
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

  function closeMemberCatchUp() {
    if (memberCatchUpKey) {
      localStorage.setItem(memberCatchUpKey, "complete");
    }
    setMemberCatchUpOpen(false);
  }

  async function resolveDirectHistoryDispute(disputeId: string) {
    if (!currentMember) return;
    const dispute = (group.directHistoryDisputes ?? []).find(
      (candidate) => candidate.id === disputeId,
    );
    if (!dispute || dispute.raisedBy !== currentMember.id) return;
    await onUpdate({
      ...group,
      directHistoryDisputes: (group.directHistoryDisputes ?? []).map((dispute) =>
        dispute.id === disputeId
          ? {
              ...dispute,
              status: "resolved" as const,
              resolvedBy: currentMember.id,
              resolvedAt: new Date().toISOString(),
            }
          : dispute,
      ),
    });
  }

  async function handleAddExpense(expense: Expense, receiptFiles: File[]) {
    const existingExpense = group.expenses.find(
      (candidate) => candidate.id === expense.id,
    );
    if (!navigator.onLine && !existingExpense && onQueueExpense) {
      await onQueueExpense(group, expense);
      return;
    }
    if (existingExpense && isExpenseSettled(group, existingExpense)) {
      throw new Error("A settled direct expense needs a reversal request before it can be corrected.");
    }
    const directCorrectionReason =
      existingExpense && group.kind === "direct" && group.directStatus === "active"
        ? await requestCorrectionReason()
        : undefined;
    if (existingExpense && group.kind === "direct" && group.directStatus === "active" && !directCorrectionReason) {
      throw new Error("CORRECTION_CANCELLED");
    }
    const uploadedReceipts = [];
    try {
      for (const file of receiptFiles) {
        const imageId = generateId();
        await savePaymentImage(
          group.id,
          imageId,
          currentUser.id,
          "expense-receipt",
          file,
        );
        uploadedReceipts.push({
          imageId,
          uploadedBy: currentMember?.id ?? currentUser.id,
          uploadedAt: new Date().toISOString(),
        });
      }
      const expenseWithReceipts = {
        ...expense,
        receipts: [...(expense.receipts ?? []), ...uploadedReceipts],
      };
      if (existingExpense && directCorrectionReason) {
        await onUpdate({
          ...group,
          expenseCorrectionRequests: [
            ...(group.expenseCorrectionRequests ?? []).filter(
              (request) => request.expenseId !== expense.id || request.status !== "pending",
            ),
            {
              id: generateId(),
              expenseId: expense.id,
              reason: directCorrectionReason,
              proposedExpense: expenseWithReceipts,
              requestedBy: currentMember?.id ?? currentUser.id,
              requestedAt: new Date().toISOString(),
              status: "pending",
            },
          ],
        });
        return;
      }
      await onUpdate(upsertExpense(group, expenseWithReceipts));
    } catch (error) {
      uploadedReceipts.forEach((receipt) => {
        deletePaymentImage(group.id, receipt.imageId).catch(() => {});
      });
      throw error;
    }
  }

  function requestCorrectionReason(): Promise<string> {
    setCorrectionReason("");
    setCorrectionReasonError("");
    setCorrectionReasonOpen(true);
    return new Promise((resolve) => {
      correctionReasonResolverRef.current = resolve;
    });
  }

  function closeCorrectionReason(reason = "") {
    correctionReasonResolverRef.current?.(reason);
    correctionReasonResolverRef.current = null;
    setCorrectionReasonOpen(false);
    setCorrectionReasonError("");
  }

  function submitCorrectionReason() {
    const reason = correctionReason.trim();
    if (!reason) {
      setCorrectionReasonError("Tell the other person what needs to be corrected.");
      return;
    }
    closeCorrectionReason(reason);
  }

  async function reviewDirectCorrection(
    requestId: string,
    approve: boolean,
    reason?: string,
  ) {
    if (!currentMember) return;
    const request = (group.expenseCorrectionRequests ?? []).find(
      (candidate) => candidate.id === requestId && candidate.status === "pending",
    );
    if (!request || request.requestedBy === currentMember.id) return;
    const reviewedAt = new Date().toISOString();
    const nextGroup = {
      ...group,
      expenses: approve
        ? group.expenses.map((expense) =>
            expense.id === request.expenseId ? request.proposedExpense : expense,
          )
        : group.expenses,
      expenseCorrectionRequests: (group.expenseCorrectionRequests ?? []).map(
        (candidate) => candidate.id === requestId
          ? {
              ...candidate,
              status: approve ? "approved" as const : "rejected" as const,
              reviewedBy: currentMember.id,
              reviewedAt,
              rejectionReason: approve ? undefined : reason,
            }
          : candidate,
      ),
    };
    await onUpdate(nextGroup);
  }

  function openCorrectionRejection(requestId: string) {
    setRejectCorrectionId(requestId);
    setRejectionReason("");
    setRejectionReasonError("");
  }

  function closeCorrectionRejection() {
    setRejectCorrectionId(null);
    setRejectionReason("");
    setRejectionReasonError("");
  }

  async function submitCorrectionRejection() {
    const reason = rejectionReason.trim();
    if (!reason) {
      setRejectionReasonError("Tell the requester why the correction was rejected.");
      return;
    }
    if (!rejectCorrectionId) return;
    const requestId = rejectCorrectionId;
    closeCorrectionRejection();
    await reviewDirectCorrection(requestId, false, reason);
  }

  async function cancelDirectCorrection(requestId: string) {
    if (!currentMember) return;
    await onUpdate({
      ...group,
      expenseCorrectionRequests: (group.expenseCorrectionRequests ?? []).map(
        (request) => request.id === requestId && request.requestedBy === currentMember.id
          ? {
              ...request,
              status: "cancelled" as const,
              reviewedBy: currentMember.id,
              reviewedAt: new Date().toISOString(),
            }
          : request,
      ),
    });
  }

  async function dismissRejectedCorrection(requestId: string) {
    if (!currentMember) return;
    await onUpdate({
      ...group,
      expenseCorrectionRequests: (group.expenseCorrectionRequests ?? []).map(
        (request) =>
          request.id === requestId && request.requestedBy === currentMember.id
            ? { ...request, dismissedByRequesterAt: new Date().toISOString() }
            : request,
      ),
    });
  }

  function openDeleteExpense(expense: Expense) {
    if (isExpenseSettled(group, expense) && !isAdmin) return;
    setDeleteExpense(expense);
    setDeleteReason("");
    setDeleteReasonError("");
  }

  function handleDeleteExpense() {
    if (!deleteExpense || !currentMember) return;
    const settled = isExpenseSettled(group, deleteExpense);
    const directApprovalRequired =
      group.kind === "direct" && group.directStatus === "active";
    if (settled && !isAdmin) {
      setDeleteReasonError("Only a group admin can delete a settled expense.");
      return;
    }
    const hasLinkedPayment = (group.payments ?? []).some(
      (payment) =>
        ["pending", "confirmed"].includes(payment.status) &&
        payment.allocations.some(
          (allocation) => allocation.expenseId === deleteExpense.id,
        ),
    );
    const hasLinkedOffset = (group.balanceOffsets ?? []).some(
      (offset) =>
        ["pending", "confirmed"].includes(offset.status) &&
        [...offset.debitAllocations, ...offset.creditAllocations].some(
          (allocation) => allocation.expenseId === deleteExpense.id,
        ),
    );
    if (hasLinkedPayment || hasLinkedOffset) {
      setDeleteReasonError(
        "Reverse or cancel the payment activity covering this expense first, then delete it.",
      );
      return;
    }
    const reason = deleteReason.trim();
    if (!reason) {
      setDeleteReasonError("Enter a reason for deleting this expense");
      return;
    }

    if (settled || directApprovalRequired) {
      const adminMemberId = getMemberById(
        group,
        group.adminId ?? group.members[0]?.id ?? currentMember.id,
      )?.id ?? currentMember.id;
      const requiredApproverIds = Array.from(
        new Set([
          ...getExpenseContributorIds(deleteExpense),
          deleteExpense.createdBy ?? getExpensePayerId(deleteExpense),
          ...deleteExpense.splits
            .filter((split) => split.amount > 0.005)
            .map((split) => split.memberId),
          ...(directApprovalRequired ? group.members.filter((member) => !member.removedAt).map((member) => member.id) : []),
        ].map((memberId) => getMemberById(group, memberId)?.uid ? memberId : adminMemberId)),
      );
      const approvedByIds = requiredApproverIds.includes(currentMember.id)
        ? [currentMember.id]
        : [];
      const request = {
        id: generateId(),
        expenseId: deleteExpense.id,
        reason,
        requestedBy: currentMember.id,
        requestedAt: new Date().toISOString(),
        requiredApproverIds,
        approvedByIds,
        status: "pending" as const,
      };
      onUpdate({
        ...group,
        expenseDeletionRequests: [
          ...(group.expenseDeletionRequests ?? []).filter(
            (item) =>
              item.expenseId !== deleteExpense.id || item.status !== "pending",
          ),
          request,
        ],
      });
      setDeleteExpense(null);
      setDeleteReason("");
      setDeleteReasonError("");
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

  function reviewExpenseDeletion(requestId: string, approve: boolean) {
    if (!currentMember) return;
    const request = (group.expenseDeletionRequests ?? []).find(
      (item) => item.id === requestId && item.status === "pending",
    );
    if (!request || !request.requiredApproverIds.includes(currentMember.id)) return;

    const now = new Date().toISOString();
    if (!approve) {
      onUpdate({
        ...group,
        expenseDeletionRequests: (group.expenseDeletionRequests ?? []).map(
          (item) =>
            item.id === request.id
              ? { ...item, status: "rejected" as const, rejectedBy: currentMember.id, rejectedAt: now }
              : item,
        ),
      });
      return;
    }

    const approvedByIds = Array.from(
      new Set([...request.approvedByIds, currentMember.id]),
    );
    const completed = request.requiredApproverIds.every((id) =>
      approvedByIds.includes(id),
    );
    const expense = group.expenses.find((item) => item.id === request.expenseId);
    onUpdate({
      ...group,
      expenses:
        completed && expense
          ? group.expenses.filter((item) => item.id !== expense.id)
          : group.expenses,
      expenseDeletionRequests: (group.expenseDeletionRequests ?? []).map(
        (item) =>
          item.id === request.id
            ? {
                ...item,
                approvedByIds,
                status: completed ? "completed" as const : "pending" as const,
                completedAt: completed ? now : undefined,
              }
            : item,
      ),
      deletedExpenses:
        completed && expense
          ? [
              ...(group.deletedExpenses ?? []),
              {
                expenseId: expense.id,
                description: expense.description,
                amount: expense.amount,
                deletedBy: request.requestedBy,
                reason: request.reason,
                deletedAt: now,
              },
            ]
          : group.deletedExpenses,
    });
  }

  function cancelExpenseDeletion(requestId: string) {
    if (!currentMember) return;
    onUpdate({
      ...group,
      expenseDeletionRequests: (group.expenseDeletionRequests ?? []).map(
        (item) =>
          item.id === requestId &&
          item.status === "pending" &&
          (item.requestedBy === currentMember.id || isAdmin)
            ? {
                ...item,
                status: "cancelled" as const,
                cancelledBy: currentMember.id,
                cancelledAt: new Date().toISOString(),
              }
            : item,
      ),
    });
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
          replyToMessageId: replyingToMessageId ?? undefined,
          mentionedMemberIds: getMentionedMemberIds(text, group.members),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setMessageText("");
    setMessageCursor(0);
    setReplyingToMessageId(null);
  }

  function replyToMessage(messageId: string) {
    setReplyingToMessageId(messageId);
    window.requestAnimationFrame(() => messageTextareaRef.current?.focus());
  }

  function selectChatMention(member: (typeof group.members)[number]) {
    if (!activeMentionRange) return;
    const inserted = insertMention(messageText, activeMentionRange, member.name);
    setMessageText(inserted.text);
    setMessageCursor(inserted.cursor);
    window.requestAnimationFrame(() => {
      const textarea = messageTextareaRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(inserted.cursor, inserted.cursor);
    });
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

  function handleMergeJoinedMember(
    sourceId: string,
    destinationId: string,
  ): string | undefined {
    if (!isAdmin) return "Only a group admin can merge duplicate members";
    if (sourceId === destinationId) return "Choose two different members";
    const source = group.members.find((member) => member.id === sourceId);
    const destination = group.members.find(
      (member) => member.id === destinationId,
    );
    if (!source?.uid || !destination?.uid) {
      return "Both records must belong to members who have joined";
    }
    if (source.id === currentMember?.id || source.uid === currentMember?.uid) {
      return "You cannot merge your own active member record";
    }
    if (source.id === adminId || source.uid === adminId) {
      return "The group owner record cannot be merged into another member";
    }

    onUpdate(mergeGroupMember(group, sourceId, destinationId));
    return undefined;
  }

  function handleSetAutoApproveClaims(enabled: boolean): string | undefined {
    if (!isAdmin) return "Only a group admin can change claim approval";
    onUpdate({ ...group, autoApproveSimilarNameClaims: enabled });
    return undefined;
  }

  function handleReviewClaimRequest(
    requestId: string,
    approve: boolean,
  ): string | undefined {
    if (!isAdmin || !currentMember) {
      return "Only a group admin can review connection requests";
    }
    const request = (group.memberClaimRequests ?? []).find(
      (item) => item.id === requestId && item.status === "pending",
    );
    if (!request) return "This connection request is no longer available";
    const pendingMember = group.members.find(
      (member) => member.id === request.pendingMemberId && !member.uid,
    );
    const requestingMember = group.members.find(
      (member) => member.id === request.requestingMemberId && !!member.uid,
    );
    if (!pendingMember || !requestingMember) {
      return "One of these member records is no longer available";
    }

    const reviewedAt = new Date().toISOString();
    const reviewedRequests = (group.memberClaimRequests ?? []).map((item) =>
      item.id === request.id
        ? {
            ...item,
            status: approve ? "confirmed" as const : "rejected" as const,
            reviewedAt,
            reviewedBy: currentMember.id,
          }
        : item,
    );
    const updatedGroup = approve
      ? mergeGroupMember(group, pendingMember.id, requestingMember.id)
      : group;
    onUpdate({ ...updatedGroup, memberClaimRequests: reviewedRequests });
    return undefined;
  }

  function handleDeletePendingMember(memberId: string): string | undefined {
    if (!isAdmin) return "Only the group admin can remove pending members";
    const isUsed =
      group.expenses.some(
        (expense) =>
          getExpenseContributorIds(expense).includes(memberId) ||
          expense.createdBy === memberId ||
          expense.splits.some((split) => split.memberId === memberId),
      ) ||
      (group.messages ?? []).some((message) => message.memberId === memberId) ||
      (group.payments ?? []).some(
        (payment) =>
          payment.fromMemberId === memberId ||
          payment.toMemberId === memberId ||
          payment.submittedBy === memberId ||
          payment.reviewedBy === memberId,
      ) ||
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
    setGroupImageVersionInput(group.groupImageVersion);
    setGroupPhotoError("");
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
      groupImageVersion: groupImageVersionInput,
    });
    setEditGroupOpen(false);
    setGroupEditError("");
  }

  async function handleGroupPhotoSelected(file?: File) {
    if (!file || groupPhotoSaving || !isAdmin) return;
    setGroupPhotoSaving(true);
    setGroupPhotoError("");
    try {
      const groupImageVersion = await saveGroupImage(
        group.id,
        currentUser.id,
        file,
      );
      setGroupImageVersionInput(groupImageVersion);
      await onUpdate({ ...group, groupImageVersion });
    } catch (error) {
      setGroupPhotoError(
        error instanceof Error ? error.message : "Unable to save that group photo.",
      );
    } finally {
      setGroupPhotoSaving(false);
    }
  }

  async function handleRemoveGroupPhoto() {
    if (!groupImageVersionInput || groupPhotoSaving || !isAdmin) return;
    setGroupPhotoSaving(true);
    setGroupPhotoError("");
    try {
      await deleteGroupImage(group.id);
      setGroupImageVersionInput("");
      await onUpdate({ ...group, groupImageVersion: "" });
    } catch (error) {
      setGroupPhotoError(
        error instanceof Error ? error.message : "Unable to remove the group photo.",
      );
    } finally {
      setGroupPhotoSaving(false);
    }
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
    const directContact = group.kind === "direct"
      ? group.members.find(
          (member) => member.id !== currentMember?.id && member.uid !== currentMember?.uid,
        )
      : undefined;
    const sourceName = directContact?.name ?? group.name;
    const safeName = sourceName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const resolvedSuffix = group.kind === "direct"
      ? suffix.replace(/^expense/, "direct-expense")
      : suffix;
    return `${safeName || (group.kind === "direct" ? "person" : "group")}-${resolvedSuffix}.csv`;
  }

  function handleDownloadTemplate() {
    setCsvErrors([]);
    setCsvImportCount(null);
    setCsvImportAwaitingReview(false);
    setPendingCsvExpenses(null);
    downloadCsv(csvFilename("expense-template"), exportExpensesTemplateCsv(group));
  }

  function handleExportExpenses() {
    setCsvErrors([]);
    setCsvImportCount(null);
    setCsvImportAwaitingReview(false);
    setPendingCsvExpenses(null);
    downloadCsv(csvFilename("expenses"), exportExpensesCsv(group));
  }

  async function handleImportFile(file: File) {
    if (!currentMember) return;
    if (file.size > MAX_CSV_FILE_BYTES) {
      setCsvErrors(["CSV file must be 1 MB or smaller"]);
      setCsvImportCount(null);
      setCsvImportAwaitingReview(false);
      setPendingCsvExpenses(null);
      return;
    }
    const text = await file.text();
    const result = parseExpensesCsv(text, group, currentMember.id);
    if (!result.ok) {
      setCsvErrors(result.errors);
      setCsvImportCount(null);
      setCsvImportAwaitingReview(false);
      setPendingCsvExpenses(null);
      return;
    }

    setPendingCsvExpenses(result.expenses);
    setCsvErrors([]);
    setCsvImportCount(null);
    setCsvImportAwaitingReview(false);
  }

  async function confirmCsvImport() {
    if (!pendingCsvExpenses || !currentMember) return;
    const validationErrors = validateExpenseImportBatch(
      pendingCsvExpenses,
      group,
      currentMember.id,
    );
    if (validationErrors.length) {
      setCsvErrors(validationErrors);
      setPendingCsvExpenses(null);
      return;
    }
    const requiresReview = group.kind === "direct" && group.directStatus === "active";
    if (requiresReview) {
      await onUpdate({
        ...group,
        expenseImportRequests: [
          {
            id: generateId(),
            expenses: pendingCsvExpenses,
            expenseCount: pendingCsvExpenses.length,
            requestedBy: currentMember.id,
            requestedAt: new Date().toISOString(),
            status: "pending",
          },
          ...(group.expenseImportRequests ?? []),
        ],
      });
    } else {
      await onUpdate({
        ...group,
        expenses: [...pendingCsvExpenses, ...group.expenses],
      });
    }
    setCsvErrors([]);
    setCsvImportCount(pendingCsvExpenses.length);
    setCsvImportAwaitingReview(requiresReview);
    setPendingCsvExpenses(null);
  }

  async function reviewDirectImport(requestId: string, approved: boolean) {
    if (!currentMember) return;
    const request = (group.expenseImportRequests ?? []).find(
      (candidate) => candidate.id === requestId && candidate.status === "pending",
    );
    if (!request || request.requestedBy === currentMember.id) return;
    const now = new Date().toISOString();
    const importedExpenses = approved ? (request.expenses ?? []) : [];
    if (approved) {
      const validationErrors = validateExpenseImportBatch(
        importedExpenses,
        group,
        request.requestedBy,
      );
      if (validationErrors.length) {
        setDirectImportError(
          `This batch can no longer be approved: ${validationErrors[0]}`,
        );
        return;
      }
    }
    setDirectImportError("");
    const existingIds = new Set(group.expenses.map((expense) => expense.id));
    await onUpdate({
      ...group,
      expenses: approved
        ? [...importedExpenses.filter((expense) => !existingIds.has(expense.id)), ...group.expenses]
        : group.expenses,
      expenseImportRequests: (group.expenseImportRequests ?? []).map((candidate) =>
        candidate.id === requestId
          ? {
              ...candidate,
              expenses: undefined,
              expenseIds: importedExpenses.map((expense) => expense.id),
              status: approved ? "approved" as const : "rejected" as const,
              reviewedBy: currentMember.id,
              reviewedAt: now,
              rejectionReason: approved ? undefined : importRejectionReason.trim(),
            }
          : candidate,
      ),
    });
    setRejectImportId(null);
    setImportRejectionReason("");
    setImportRejectionError("");
  }

  async function cancelDirectImport(requestId: string) {
    if (!currentMember) return;
    const now = new Date().toISOString();
    await onUpdate({
      ...group,
      expenseImportRequests: (group.expenseImportRequests ?? []).map((request) =>
        request.id === requestId && request.requestedBy === currentMember.id && request.status === "pending"
          ? {
              ...request,
              expenses: undefined,
              status: "cancelled" as const,
              reviewedBy: currentMember.id,
              reviewedAt: now,
            }
          : request,
      ),
    });
  }

  async function dismissRejectedImport(requestId: string) {
    if (!currentMember) return;
    await onUpdate({
      ...group,
      expenseImportRequests: (group.expenseImportRequests ?? []).map((request) =>
        request.id === requestId && request.requestedBy === currentMember.id
          ? { ...request, dismissedByRequesterAt: new Date().toISOString() }
          : request,
      ),
    });
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
  const directPerson = group.kind === "direct"
    ? group.members.find((member) => member.uid !== currentUser.id && member.id !== currentUser.id)
    : undefined;
  const directPersonUid = directPerson?.uid ?? group.directContactUid;
  const archivedGroupIds = new Set(currentUser.archivedGroupIds ?? []);
  const isArchived = archivedGroupIds.has(group.id);
  const sharedSourceGroups = allGroups.filter(
    (candidate) => candidate.kind !== "direct" && (includeArchivedGroups || !archivedGroupIds.has(candidate.id)),
  );
  const sharedGroupBalances = directPersonUid
    ? buildOverallBalances(sharedSourceGroups, currentUser)
        .filter((balance) => balance.personUid === directPersonUid)
    : [];
  const sharedExpenseItems = directPersonUid
    ? sharedSourceGroups
        .flatMap((candidate) => {
          const me = candidate.members.find((member) => member.uid === currentUser.id || member.id === currentUser.id);
          const person = candidate.members.find((member) => member.uid === directPersonUid);
          if (!me || !person) return [];
          return candidate.expenses
            .filter((expense) => {
              const participantIds = new Set([
                ...getExpenseContributorIds(expense),
                ...expense.splits.filter((split) => split.amount > 0).map((split) => split.memberId),
              ]);
              return participantIds.has(me.id) && participantIds.has(person.id);
            })
            .map((expense) => {
              const relevantDebtorIds = [me.id, person.id].filter((memberId) =>
                getOutstandingExpenseShares(candidate, memberId).some(
                  (allocation) => allocation.expenseId === expense.id && allocation.amount > 0.005,
                ),
              );
              const settled = relevantDebtorIds.length > 0 && relevantDebtorIds.every((memberId) =>
                !getOutstandingExpenseShares(candidate, memberId).some(
                  (allocation) => allocation.expenseId === expense.id && allocation.amount > 0.005,
                ),
              );
              return { group: candidate, expense, settled };
            });
        })
        .sort((a, b) => b.expense.date.localeCompare(a.expense.date))
    : [];
  const directExpenseTotal = group.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const sharedExpenseTotals = sharedExpenseItems.reduce<Record<string, number>>((totals, item) => {
    totals[item.group.currency] = (totals[item.group.currency] ?? 0) + item.expense.amount;
    return totals;
  }, {});
  const allExpenseTotals = {
    ...sharedExpenseTotals,
    [group.currency]: (sharedExpenseTotals[group.currency] ?? 0) + directExpenseTotal,
  };
  const currentUserConfirmedBalance = currentMember
    ? computeBalances(group).find((balance) => balance.memberId === currentMember.id)?.net ?? 0
    : 0;
  const directSharedBalanceExists = group.kind === "direct" && directPersonUid
    ? buildOverallBalances(allGroups.filter((candidate) => candidate.kind !== "direct"), currentUser)
        .some((balance) => balance.personUid === directPersonUid && Math.abs(balance.amount) >= 0.005)
    : false;
  const archiveDisabledReason = Math.abs(currentUserConfirmedBalance) >= 0.005
    ? group.kind === "direct"
      ? "Settle this direct balance before archiving the person."
      : "Settle your balance in this group before archiving it."
    : directSharedBalanceExists
      ? "Settle your shared-group balances with this person before archiving them."
      : undefined;
  const groupHasUnsettledBalances = computeBalances(group).some(
    (balance) => Math.abs(balance.net) >= 0.005,
  );
  function handleArchiveCurrent() {
    if (isArchived) {
      onUpdateUser({
        ...currentUser,
        archivedGroupIds: (currentUser.archivedGroupIds ?? []).filter((id) => id !== group.id),
      });
      return;
    }
    if (archiveDisabledReason) {
      setArchiveBlockedReason(archiveDisabledReason);
      return;
    }
    onArchiveGroup(group);
    onBack();
  }
  const visibleSharedExpenseItems = expenseTotalView === "all"
    ? sharedExpenseItems
    : sharedExpenseItems.filter((item) => !item.settled);
  const hiddenSettledSharedExpenseCount = sharedExpenseItems.length - visibleSharedExpenseItems.length;
  const buildSpendingBreakdownSections = (
    view: "unsettled" | "all",
    directScope: "all" | "direct" | "shared" = personExpenseScope,
  ) => {
    const totals = new Map<string, Map<string, { member: typeof group.members[number]; amount: number }>>();
    const outstandingByMember = new Map<string, Map<string, number>>();
    const outstandingAmount = (sourceGroup: Group, memberId: string, expenseId: string) => {
      const key = `${sourceGroup.id}:${memberId}`;
      let amounts = outstandingByMember.get(key);
      if (!amounts) {
        amounts = new Map(
          getConfirmedOutstandingExpenseShares(sourceGroup, memberId).map((allocation) => [
            allocation.expenseId ?? "",
            allocation.amount,
          ]),
        );
        outstandingByMember.set(key, amounts);
      }
      return amounts.get(expenseId) ?? 0;
    };
    const addExpense = (
      sourceGroup: Group,
      expense: Expense,
      memberIds?: Set<string>,
      canonicalMembers?: Map<string, typeof group.members[number]>,
    ) => {
      const currencyTotals = totals.get(sourceGroup.currency) ?? new Map();
      for (const split of expense.splits) {
        if (split.amount <= 0.005 || (memberIds && !memberIds.has(split.memberId))) continue;
        const amount = view === "unsettled"
          ? outstandingAmount(sourceGroup, split.memberId, expense.id)
          : split.amount;
        if (amount <= 0.005) continue;
        const member = canonicalMembers?.get(split.memberId) ?? getMemberById(sourceGroup, split.memberId);
        if (!member) continue;
        const key = member.uid ?? member.id;
        const current = currencyTotals.get(key);
        currencyTotals.set(key, { member, amount: (current?.amount ?? 0) + amount });
      }
      totals.set(sourceGroup.currency, currencyTotals);
    };

    if (group.kind !== "direct") {
      group.expenses.forEach((expense) => addExpense(group, expense));
    } else {
      const includeDirect = directScope !== "shared";
      const includeGroups = directScope !== "direct";
      if (includeDirect) group.expenses.forEach((expense) => addExpense(group, expense));
      if (includeGroups && directPersonUid && directPerson) {
        for (const sourceGroup of sharedSourceGroups) {
          const me = sourceGroup.members.find((member) => member.uid === currentUser.id || member.id === currentUser.id);
          const person = sourceGroup.members.find((member) => member.uid === directPersonUid);
          if (!me || !person) continue;
          const ids = new Set([me.id, person.id]);
          const canonical = new Map([
            [me.id, currentMember ?? me],
            [person.id, directPerson],
          ]);
          sourceGroup.expenses
            .filter((expense) => {
              const participants = new Set([...getExpenseContributorIds(expense), ...expense.splits.filter((split) => split.amount > 0.005).map((split) => split.memberId)]);
              return participants.has(me.id) && participants.has(person.id);
            })
            .forEach((expense) => addExpense(sourceGroup, expense, ids, canonical));
        }
      }
    }

    return [...totals.entries()]
      .map(([currency, memberTotals]) => ({ currency, entries: [...memberTotals.values()] }))
      .sort((a, b) => a.currency.localeCompare(b.currency)) as SpendingBreakdownSection[];
  };
  const spendingBreakdownSections = buildSpendingBreakdownSections(expenseTotalView);
  const unsettledBreakdownSections = expenseTotalView === "unsettled"
    ? spendingBreakdownSections
    : buildSpendingBreakdownSections("unsettled");
  const sectionTotals = (sections: SpendingBreakdownSection[]) =>
    Object.fromEntries(
      sections.map((section) => [
        section.currency,
        section.entries.reduce((sum, entry) => sum + entry.amount, 0),
      ]),
    );
  const unsettledExpenseShareTotals = sectionTotals(unsettledBreakdownSections);
  const unsettledTotal = unsettledExpenseShareTotals[group.currency] ?? 0;
  const directUnsettledTotals = group.kind === "direct"
    ? sectionTotals(buildSpendingBreakdownSections("unsettled", "direct"))
    : {};
  const sharedUnsettledTotals = group.kind === "direct"
    ? sectionTotals(buildSpendingBreakdownSections("unsettled", "shared"))
    : {};
  const allUnsettledTotals = group.kind === "direct"
    ? sectionTotals(buildSpendingBreakdownSections("unsettled", "all"))
    : {};
  const sharedPersonExpenseList = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From shared groups</p>
        {expenseTotalView === "unsettled" && hiddenSettledSharedExpenseCount > 0 && <span className="text-[11px] text-muted-foreground">{hiddenSettledSharedExpenseCount} settled hidden</span>}
      </div>
      {visibleSharedExpenseItems.map(({ group: sourceGroup, expense, settled }) => (
        <button
          key={`${sourceGroup.id}:${expense.id}`}
          type="button"
          onClick={() => onOpenGroup?.(sourceGroup)}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{expense.description}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className="truncate">{sourceGroup.name} · {new Date(`${expense.date}T12:00:00`).toLocaleDateString()}</span>
              {archivedGroupIds.has(sourceGroup.id) && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">Archived group</span>
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="block text-sm font-semibold text-foreground">{formatCurrency(expense.amount, sourceGroup.currency)}</span>
            {settled && <span className="mt-0.5 block text-[10px] font-semibold uppercase text-emerald-600">Settled</span>}
          </div>
        </button>
      ))}
      {visibleSharedExpenseItems.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
          All shared-group expenses shown here are settled.
        </div>
      )}
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Shared-group expenses stay read-only here. Open the group to edit or settle them.</p>
    </div>
  );
  const offlineDraftPrelude = groupOfflineDrafts.length > 0 ? (
    <section className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <FilePenLine size={16} className="text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Expense drafts</p>
          <p className="text-[11px] text-muted-foreground">Private to this device until submitted</p>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{groupOfflineDrafts.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {groupOfflineDrafts.map((draft) => (
          <div key={draft.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <button
              type="button"
              onClick={() => {
                setEditExpense(null);
                setSelectedOfflineDraft(draft);
                setAddOpen(true);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-sm font-semibold text-foreground">{draft.description.trim() || "Untitled expense"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {draft.amount ? formatCurrency(Number(draft.amount) || 0, group.currency) : "Amount not added"}
                {` · Saved ${new Date(draft.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setOfflineDrafts(deleteOfflineExpenseDraft(currentUser.id, draft.id))}
              className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete draft ${draft.description || "Untitled expense"}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </section>
  ) : undefined;
  const personExpensePrelude = group.kind === "direct" && sharedExpenseItems.length > 0 ? (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {(["all", "direct", "shared"] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            onClick={() => setPersonExpenseScope(scope)}
            className={`rounded-lg px-2 py-2 text-xs font-semibold capitalize ${personExpenseScope === scope ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            {scope === "shared" ? "Groups" : scope}
          </button>
        ))}
      </div>
      {personExpenseScope === "shared" && sharedPersonExpenseList}
    </div>
  ) : undefined;
  const visibleDirectImportRequests = (group.expenseImportRequests ?? []).filter(
    (request) =>
      request.status === "pending" ||
      (request.status === "rejected" &&
        request.requestedBy === currentMember?.id &&
        !request.dismissedByRequesterAt),
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <ArchiveBlockedDialog reason={archiveBlockedReason} onClose={() => setArchiveBlockedReason(undefined)} />
      <GroupHeader
        group={group}
        currentUser={currentUser}
        total={total}
        unsettledTotal={unsettledTotal}
        tab={tab}
        tourTarget={activeGroupTourTarget}
        unreadChatCount={unreadChatCount}
        outstandingMemberCount={outstandingMemberCount}
        memberRequestCount={memberRequestCount}
        isAdmin={isAdmin}
        isOwner={isOwner}
        onBack={onBack}
        onTabChange={handleTabChange}
        onManageMembers={() => setInviteOpen(true)}
        onShare={() => group.kind === "direct" ? setInviteOpen(true) : setQrOpen(true)}
        onCsvTools={() => {
          setCsvErrors([]);
          setCsvImportCount(null);
          setCsvImportAwaitingReview(false);
          setPendingCsvExpenses(null);
          setCsvOpen(true);
        }}
        onShowGuide={() => setGroupTourStep(0)}
        onEdit={openEditGroup}
        onDelete={() => setConfirmDelete(true)}
        onArchive={handleArchiveCurrent}
        archiveDisabledReason={isArchived ? undefined : archiveDisabledReason}
        onArchiveBlocked={setArchiveBlockedReason}
        isArchived={isArchived}
        includeArchivedGroups={includeArchivedGroups}
        onIncludeArchivedGroupsChange={group.kind === "direct" ? setIncludeArchivedGroups : undefined}
        directExpenseSummary={group.kind === "direct" ? {
          direct: [{ currency: group.currency, amount: directExpenseTotal }],
          shared: Object.entries(sharedExpenseTotals).map(([currency, amount]) => ({ currency, amount })),
          all: Object.entries(allExpenseTotals).map(([currency, amount]) => ({ currency, amount })),
        } : undefined}
        directUnsettledExpenseSummary={group.kind === "direct" ? {
          direct: Object.entries(directUnsettledTotals).map(([currency, amount]) => ({ currency, amount })),
          shared: Object.entries(sharedUnsettledTotals).map(([currency, amount]) => ({ currency, amount })),
          all: Object.entries(allUnsettledTotals).map(([currency, amount]) => ({ currency, amount })),
        } : undefined}
        totalView={expenseTotalView}
        onTotalViewChange={setExpenseTotalView}
        onShowSpendingBreakdown={() => setSpendingBreakdownOpen(true)}
      />
      <SpendingBreakdownModal
        open={spendingBreakdownOpen}
        onClose={() => setSpendingBreakdownOpen(false)}
        view={expenseTotalView}
        sections={spendingBreakdownSections}
      />
      {group.kind === "direct" && visibleDirectImportRequests.length > 0 && (
        <div className="space-y-3 border-b border-violet-200 bg-violet-50 px-4 py-3">
          {directImportError && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {directImportError}
            </p>
          )}
          {visibleDirectImportRequests.map((request) => {
            const requestedByMe = request.requestedBy === currentMember?.id;
            const totalAmount = (request.expenses ?? []).reduce(
              (sum, expense) => sum + expense.amount,
              0,
            );
            if (request.status === "rejected") {
              return (
                <div key={request.id} className="rounded-2xl border border-destructive/20 bg-card p-3">
                  <p className="text-sm font-semibold text-destructive">CSV import rejected</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The other person did not approve this batch of {request.expenseCount} expense{request.expenseCount === 1 ? "" : "s"}.
                  </p>
                  <div className="mt-3 rounded-xl bg-destructive/5 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Reason</p>
                    <p className="mt-1 text-sm text-foreground">{request.rejectionReason}</p>
                  </div>
                  <button type="button" onClick={() => void dismissRejectedImport(request.id)} className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">Dismiss</button>
                </div>
              );
            }
            return (
              <div key={request.id} className="rounded-2xl border border-violet-200 bg-card p-3">
                <p className="text-sm font-semibold text-foreground">
                  {requestedByMe ? "CSV import awaiting review" : "Review imported expenses"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {request.expenseCount} expense{request.expenseCount === 1 ? "" : "s"}
                  {totalAmount > 0 ? ` · ${formatCurrency(totalAmount, group.currency)}` : ""}. These do not affect balances until approved.
                </p>
                {(request.expenses ?? []).length > 0 && (
                  <div className="mt-3 max-h-36 space-y-1.5 overflow-y-auto rounded-xl bg-muted/50 p-2.5">
                    {(request.expenses ?? []).map((expense) => (
                      <div key={expense.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-foreground">{expense.description}</span>
                        <span className="shrink-0 font-semibold text-foreground">{formatCurrency(expense.amount, group.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {requestedByMe ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-violet-700">Waiting for the other person</p>
                    <button type="button" onClick={() => void cancelDirectImport(request.id)} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold">Cancel import</button>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => {
                      setRejectImportId(request.id);
                      setImportRejectionReason("");
                      setImportRejectionError("");
                    }} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold">Reject</button>
                    <button type="button" onClick={() => void reviewDirectImport(request.id, true)} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Approve all</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {group.kind === "direct" && group.directStatus === "pending" && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          {directPerson?.uid
            ? group.directRequestedBy === currentUser.id
              ? `Waiting for ${directPerson.name} to review the provisional history. You can keep tracking while you wait.`
              : "Review the history recorded before you joined. You can accept it or flag specific entries you don’t agree with."
            : `${directPerson?.name ?? "This person"} has not claimed this history yet. Expenses and settlements are provisional until they review them.`}
        </div>
      )}
      {group.kind === "direct" && group.directStatus === "draft" && (
        <div className="border-b border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-foreground">
          This is your private draft. {directPerson?.name ?? "They"} does not need an account or approval yet, and nothing is shared until you send the personal invite.
        </div>
      )}
      {group.kind === "direct" && (group.directHistoryDisputes ?? []).some((dispute) => dispute.status === "open") && (
        <div className="space-y-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-amber-950">History items need discussion</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80">The history stays visible. Correct or reverse the underlying record if needed, then mark the flag resolved.</p>
          </div>
          {(group.directHistoryDisputes ?? []).filter((dispute) => dispute.status === "open").map((dispute) => (
            <div key={dispute.id} className="rounded-2xl border border-amber-200 bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{dispute.entityLabel}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dispute.reason}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-800">Flagged</span>
              </div>
              <div className={`mt-3 grid gap-2 ${dispute.raisedBy === currentMember?.id ? "grid-cols-2" : "grid-cols-1"}`}>
                <button type="button" onClick={() => setTab(dispute.entityType === "expense" ? "expenses" : "settle")} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground">View record</button>
                {dispute.raisedBy === currentMember?.id && (
                  <button type="button" onClick={() => void resolveDirectHistoryDispute(dispute.id)} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Mark resolved</button>
                )}
              </div>
              {dispute.raisedBy !== currentMember?.id && <p className="mt-2 text-xs text-amber-800">The person who raised this flag will close it once the correction is agreed.</p>}
            </div>
          ))}
        </div>
      )}
      {group.kind === "direct" && tab === "balances" && sharedGroupBalances.length > 0 && (
        <div className="border-b border-border bg-primary/5 px-4 py-3">
          <button
            type="button"
            onClick={() => setSharedGroupSummaryOpen((open) => !open)}
            className="flex w-full items-center gap-3 text-left"
            aria-expanded={sharedGroupSummaryOpen}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Across shared groups</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Summary only—settle each amount in its original group.</p>
            </div>
            <ChevronDown size={17} className={`text-muted-foreground transition-transform ${sharedGroupSummaryOpen ? "rotate-180" : ""}`} />
          </button>
          {sharedGroupSummaryOpen && (
            <div className="mt-3 space-y-2">
              {sharedGroupBalances.flatMap((balance) => balance.sources.map((source) => (
                <button
                  key={`${balance.key}:${source.group.id}`}
                  type="button"
                  onClick={() => onOpenGroup?.(source.group)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left"
                >
                  <span className="min-w-0 flex flex-1 items-center gap-1.5 text-sm font-medium text-foreground">
                    <span className="truncate">{source.group.name}</span>
                    {archivedGroupIds.has(source.group.id) && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">Archived group</span>}
                  </span>
                  <span className={`text-sm font-semibold ${source.amount > 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {source.amount > 0 ? "Owes you " : "You owe "}{formatCurrency(Math.abs(source.amount), balance.currency)}
                  </span>
                </button>
              )))}
            </div>
          )}
        </div>
      )}
      {group.kind === "direct" && (group.expenseCorrectionRequests ?? []).some((request) => request.status === "pending") && (
        <div className="border-b border-border bg-amber-50 px-4 py-3 space-y-3">
          {(group.expenseCorrectionRequests ?? [])
            .filter((request) => request.status === "pending")
            .map((request) => {
              const original = group.expenses.find((expense) => expense.id === request.expenseId);
              const requestedByMe = request.requestedBy === currentMember?.id;
              return (
                <div key={request.id} className="rounded-2xl border border-amber-200 bg-card p-3">
                  <p className="text-sm font-semibold text-foreground">Expense correction requested</p>
                  <p className="mt-1 text-xs text-muted-foreground">{request.reason}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground line-through">
                      {original ? `${original.description} · ${formatCurrency(original.amount, group.currency)}` : "Original expense"}
                    </span>
                    <span className="font-semibold text-foreground">
                      {request.proposedExpense.description} · {formatCurrency(request.proposedExpense.amount, group.currency)}
                    </span>
                  </div>
                  {requestedByMe ? (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-amber-800">Waiting for the other person’s approval</p>
                      <button type="button" onClick={() => void cancelDirectCorrection(request.id)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold">Cancel</button>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => openCorrectionRejection(request.id)} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold">Reject</button>
                      <button type="button" onClick={() => void reviewDirectCorrection(request.id, true)} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Approve correction</button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
      {group.kind === "direct" && (group.expenseCorrectionRequests ?? []).some(
        (request) =>
          request.status === "rejected" &&
          request.requestedBy === currentMember?.id &&
          !request.dismissedByRequesterAt,
      ) && (
        <div className="border-b border-border bg-destructive/5 px-4 py-3 space-y-3">
          {(group.expenseCorrectionRequests ?? [])
            .filter(
              (request) =>
                request.status === "rejected" &&
                request.requestedBy === currentMember?.id &&
                !request.dismissedByRequesterAt,
            )
            .map((request) => (
              <div key={request.id} className="rounded-2xl border border-destructive/20 bg-card p-3">
                <p className="text-sm font-semibold text-destructive">Correction rejected</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your proposed change to “{request.proposedExpense.description}” wasn’t accepted.
                </p>
                <div className="mt-3 rounded-xl bg-destructive/5 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Reason</p>
                  <p className="mt-1 text-sm text-foreground">{request.rejectionReason || "No reason provided"}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void dismissRejectedCorrection(request.id)}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditExpense(request.proposedExpense);
                      setAddOpen(true);
                      void dismissRejectedCorrection(request.id);
                    }}
                    className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    Revise and try again
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
      {/* Content */}
      <GroupContent
        tab={tab}
        group={group}
        currentMember={currentMember}
        isAdmin={isAdmin}
        activeBalances={activeBalances}
        settlements={settlements}
        paymentItems={paymentItems}
        focusedExpenseId={destination?.expenseId}
        focusedPaymentId={destination?.paymentId}
        kofiUrl={kofiUrl}
        expensesByDate={expensesByDate}
        sortedDates={sortedDates}
        messages={messages}
        chatRevealMessageId={chatRevealMessageId}
        firstUnreadMessageRef={firstUnreadMessageRef}
        chatEndRef={chatEndRef}
        displayMemberName={displayMemberName}
        setEditExpense={setEditExpense}
        setAddOpen={setAddOpen}
        openDeleteExpense={openDeleteExpense}
        reviewExpenseDeletion={reviewExpenseDeletion}
        cancelExpenseDeletion={cancelExpenseDeletion}
        openPaymentDetails={openPaymentDetails}
        viewPaymentImage={viewPaymentImage}
        onUpdate={onUpdate}
        openPaymentSubmission={openPaymentSubmission}
        reviewPayment={reviewPayment}
        setCreatorPaidConfirmation={setCreatorPaidConfirmation}
        onReplyToMessage={replyToMessage}
        expensePrelude={(offlineDraftPrelude || personExpensePrelude) ? <>{offlineDraftPrelude}{personExpensePrelude}</> : undefined}
        expensePostlude={group.kind === "direct" && personExpenseScope === "all" && sharedExpenseItems.length > 0 ? sharedPersonExpenseList : undefined}
        hideDirectExpenseContent={group.kind === "direct" && personExpenseScope === "shared"}
        expenseTotalView={expenseTotalView}
        pendingExpenseIds={pendingExpenseIds}
      />
      {/* FAB */}
      {tab === "chat" ? (
        <div className="relative border-t border-border bg-card p-4">
          {mentionSuggestions.length > 0 && (
            <div className="absolute inset-x-4 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
              <p className="border-b border-border px-3 py-2 text-[11px] font-medium text-muted-foreground">
                Mention a member
              </p>
              {mentionSuggestions.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectChatMention(member)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted"
                >
                  <UserAvatar
                    name={member.name}
                    color={member.color}
                    seed={member.avatarSeed}
                    uid={member.uid}
                    photoVersion={member.profileImageVersion}
                    className="h-8 w-8 shrink-0 rounded-full text-xs"
                  />
                  <span className="truncate text-sm font-medium text-foreground">
                    {member.name}
                  </span>
                </button>
              ))}
            </div>
          )}
          {replyingToMessageId && (() => {
            const original = messages.find(
              (message) => message.id === replyingToMessageId,
            );
            const originalSender = original
              ? getMemberById(group, original.memberId)
              : undefined;
            return (
              <div className="mb-3 flex items-start gap-3 rounded-xl border-l-4 border-primary bg-muted/50 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-primary">
                    Replying to {originalSender?.name ?? "a message"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {original?.text ?? "Original message unavailable"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingToMessageId(null)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Cancel reply"
                >
                  <X size={15} />
                </button>
              </div>
            );
          })()}
          <div className="flex items-end gap-2">
            <textarea
              ref={messageTextareaRef}
              value={messageText}
              onChange={(event) => {
                setMessageText(event.target.value);
                setMessageCursor(event.target.selectionStart);
              }}
              onClick={(event) =>
                setMessageCursor(event.currentTarget.selectionStart)
              }
              onKeyUp={(event) =>
                setMessageCursor(event.currentTarget.selectionStart)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (mentionSuggestions[0]) {
                    selectChatMention(mentionSuggestions[0]);
                  } else {
                    handleSendMessage();
                  }
                }
              }}
              placeholder="Message the group · @ to mention"
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
      ) : group.kind === "direct" && group.directStatus === "pending" && group.directRequestedBy !== currentUser.id ? (
        <div className="border-t border-border bg-card p-4">
          <button type="button" onClick={() => setDirectHistoryReviewOpen(true)} className="w-full rounded-2xl bg-primary py-4 text-sm font-semibold text-primary-foreground">
            Review earlier history
          </button>
        </div>
      ) : (
        <div className="p-4 border-t border-border bg-card">
          <button
            onClick={() => {
              setEditExpense(null);
              setSelectedOfflineDraft(null);
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
      {currentMember && (
        <MemberCatchUp
          open={memberCatchUpOpen}
          group={group}
          member={currentMember}
          onClose={closeMemberCatchUp}
          onOpenTab={handleTabChange}
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
              {groupHasUnsettledBalances
                ? "This group still has unsettled balances. Settle everyone’s balance before permanently deleting it."
                : <>This will permanently delete the group and all {group.expenses.length} expense{group.expenses.length !== 1 ? "s" : ""}. This cannot be undone.</>}
            </Dialog.Description>
            <div className="mb-5 rounded-2xl bg-primary/5 p-4">
              <p className="text-sm font-semibold text-foreground">Just cleaning up your Home?</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Consider archiving this group instead. Its history remains safe and other members are not affected.</p>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  handleArchiveCurrent();
                }}
                className="mt-3 text-xs font-semibold text-primary"
              >
                Archive group instead
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3.5 rounded-2xl bg-muted text-foreground text-sm font-medium transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteGroup}
                disabled={groupHasUnsettledBalances}
                className="flex-1 py-3.5 rounded-2xl bg-destructive text-white text-sm font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:active:scale-100"
              >
                {groupHasUnsettledBalances ? "Settle balances first" : "Delete"}
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
                  groupId={group.id}
                  photoVersion={groupImageVersionInput}
                  className="w-20 h-20 rounded-2xl shadow-md"
                />
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-all active:scale-95">
                    <Camera size={14} />
                    {groupPhotoSaving
                      ? "Saving…"
                      : groupImageVersionInput
                        ? "Replace photo"
                        : "Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={groupPhotoSaving}
                      onChange={(event) => {
                        void handleGroupPhotoSelected(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {groupImageVersionInput ? (
                    <button
                      type="button"
                      disabled={groupPhotoSaving}
                      onClick={() => void handleRemoveGroupPhoto()}
                      className="inline-flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground transition-all active:scale-95 disabled:opacity-60"
                    >
                      <ImageOff size={14} />
                      Use generated image
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setGroupAvatarSeedInput(crypto.randomUUID())}
                      className="inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition-all active:scale-95"
                    >
                      <Shuffle size={14} />
                      Randomize image
                    </button>
                  )}
                </div>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Group photos use the same lightweight 128px compression.
                </p>
                {groupPhotoError && (
                  <p className="mt-1 text-center text-xs text-destructive">
                    {groupPhotoError}
                  </p>
                )}
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
              {deleteExpense && (isExpenseSettled(group, deleteExpense) || (group.kind === "direct" && group.directStatus === "active"))
                ? "Request expense deletion?"
                : "Delete expense?"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mb-4">
              Give a reason for deleting "{deleteExpense?.description}". This
              will be saved with the group history.
              {deleteExpense && (isExpenseSettled(group, deleteExpense) || (group.kind === "direct" && group.directStatus === "active"))
                ? group.kind === "direct" && group.directStatus === "active"
                  ? " The other person must approve before it is removed from the shared history and balances."
                  : " Because it is settled, every financially involved member must approve before it is removed from totals and balances."
                : ""}
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
                {deleteExpense && (isExpenseSettled(group, deleteExpense) || (group.kind === "direct" && group.directStatus === "active"))
                  ? "Request deletion"
                  : "Delete"}
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
                {group.kind === "direct" ? "Direct Expense CSV" : "CSV Tools"}
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
                  {group.kind === "direct"
                    ? "Only the person-view owner can import expenses. You can still download or export CSV files."
                    : "Only the group admin can import expenses."}
                </p>
              )}

              {csvImportCount !== null && (
                <p className="text-sm text-green-600 font-medium">
                  {csvImportAwaitingReview ? "Sent" : "Imported"} {csvImportCount} expense
                  {csvImportCount === 1 ? "" : "s"}
                  {csvImportAwaitingReview ? " for the other person to review." : "."}
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
                      {group.kind === "direct"
                        ? group.directStatus === "active"
                          ? "These expenses will stay pending and will not affect either balance until the other person approves the batch."
                          : "This will add the CSV expenses to this direct person record. If the other person joins later, these expenses will be included in their history review."
                        : "This will add the CSV expenses to the group."}
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
                      onClick={() => void confirmCsvImport()}
                      className="py-3 rounded-xl text-primary-foreground text-sm font-semibold transition-all active:scale-95"
                      style={{ backgroundColor: "var(--primary)" }}
                    >
                      {group.kind === "direct" && group.directStatus === "active"
                        ? "Send for review"
                        : "Import"}
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
        open={correctionReasonOpen}
        onOpenChange={(open) => !open && closeCorrectionReason()}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-[80] rounded-t-3xl bg-card shadow-2xl">
            <div className="relative flex items-center justify-between border-b border-border px-5 pb-3 pt-4">
              <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Request a correction
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                  The other person will review this before the expense changes.
                </Dialog.Description>
              </div>
              <button
                type="button"
                onClick={() => closeCorrectionReason()}
                className="rounded-full p-2 hover:bg-muted"
                aria-label="Close correction request"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4 p-5 pb-8">
              <div>
                <label htmlFor="direct-correction-reason" className="mb-1.5 block text-sm text-muted-foreground">
                  What needs to be corrected?
                </label>
                <textarea
                  id="direct-correction-reason"
                  autoFocus
                  rows={4}
                  value={correctionReason}
                  onChange={(event) => {
                    setCorrectionReason(event.target.value);
                    setCorrectionReasonError("");
                  }}
                  placeholder="e.g. I entered the wrong total amount"
                  className="w-full resize-none rounded-2xl border border-border bg-input-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {correctionReasonError && (
                  <p className="mt-1.5 text-xs text-destructive">{correctionReasonError}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => closeCorrectionReason()}
                  className="rounded-2xl bg-muted py-3.5 text-sm font-medium text-foreground active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCorrectionReason}
                  className="rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground active:scale-95 transition-all"
                >
                  Send request
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={!!rejectCorrectionId}
        onOpenChange={(open) => !open && closeCorrectionRejection()}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-[80] rounded-t-3xl bg-card shadow-2xl">
            <div className="relative flex items-center justify-between border-b border-border px-5 pb-3 pt-4">
              <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Reject correction?
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                  Explain what needs to be fixed so they can submit a better correction.
                </Dialog.Description>
              </div>
              <button
                type="button"
                onClick={closeCorrectionRejection}
                className="rounded-full p-2 hover:bg-muted"
                aria-label="Close rejection reason"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4 p-5 pb-8">
              <div>
                <label htmlFor="direct-correction-rejection" className="mb-1.5 block text-sm text-muted-foreground">
                  Reason for rejection
                </label>
                <textarea
                  id="direct-correction-rejection"
                  autoFocus
                  rows={4}
                  value={rejectionReason}
                  onChange={(event) => {
                    setRejectionReason(event.target.value);
                    setRejectionReasonError("");
                  }}
                  placeholder="e.g. The original amount matches the receipt"
                  className="w-full resize-none rounded-2xl border border-border bg-input-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {rejectionReasonError && (
                  <p className="mt-1.5 text-xs text-destructive">{rejectionReasonError}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={closeCorrectionRejection}
                  className="rounded-2xl bg-muted py-3.5 text-sm font-medium text-foreground active:scale-95 transition-all"
                >
                  Keep reviewing
                </button>
                <button
                  type="button"
                  onClick={() => void submitCorrectionRejection()}
                  className="rounded-2xl bg-destructive py-3.5 text-sm font-semibold text-destructive-foreground active:scale-95 transition-all"
                >
                  Reject correction
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={!!rejectImportId}
        onOpenChange={(open) => {
          if (!open) {
            setRejectImportId(null);
            setImportRejectionReason("");
            setImportRejectionError("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 bottom-8 z-[80] rounded-3xl bg-card p-6 shadow-2xl md:left-1/2 md:w-[min(92vw,32rem)] md:-translate-x-1/2">
            <Dialog.Title className="text-lg font-semibold text-foreground">Reject this CSV import?</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
              The pending expenses will not affect either balance. Tell the importer what needs to be corrected.
            </Dialog.Description>
            <textarea
              value={importRejectionReason}
              onChange={(event) => {
                setImportRejectionReason(event.target.value);
                setImportRejectionError("");
              }}
              maxLength={500}
              rows={3}
              placeholder="What should they fix?"
              className="mt-4 w-full resize-none rounded-2xl border border-border bg-input-background px-4 py-3 text-sm outline-none focus:border-primary"
            />
            {importRejectionError && <p className="mt-1.5 text-xs text-destructive">{importRejectionError}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setRejectImportId(null)} className="rounded-2xl bg-muted py-3.5 text-sm font-medium text-foreground">Keep reviewing</button>
              <button
                type="button"
                onClick={() => {
                  if (!importRejectionReason.trim()) {
                    setImportRejectionError("Add a reason before rejecting this import.");
                    return;
                  }
                  if (rejectImportId) void reviewDirectImport(rejectImportId, false);
                }}
                className="rounded-2xl bg-destructive py-3.5 text-sm font-semibold text-destructive-foreground"
              >
                Reject import
              </button>
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
              <ImagePasteControl
                enabled={!!submitPayment}
                disabled={paymentSaving}
                label="Paste payment proof"
                onImages={(files) => setProofFile(files[0] ?? null)}
                onError={setPaymentActionError}
              />
              {proofFile && (
                <p className="text-xs text-muted-foreground">
                  Attached: {proofFile.name}
                </p>
              )}
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
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 top-1/2 z-[100] -translate-y-1/2 rounded-3xl bg-card p-5 shadow-2xl">
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
          setSelectedOfflineDraft(null);
        }}
        onAdd={async (expense, receiptFiles) => {
          await handleAddExpense(expense, receiptFiles);
          if (selectedOfflineDraft) {
            setOfflineDrafts(deleteOfflineExpenseDraft(currentUser.id, selectedOfflineDraft.id));
          }
        }}
        currentUser={currentUser}
        editExpense={editExpense}
        isAdmin={isAdmin}
        offlineDraft={selectedOfflineDraft}
        onSaveDraft={(draft) => {
          setOfflineDrafts(saveOfflineExpenseDraft(draft));
          setSelectedOfflineDraft(null);
        }}
      />
      {group.kind === "direct" && currentMember && (
        <DirectHistoryReview
          open={directHistoryReviewOpen}
          group={group}
          member={currentMember}
          onClose={() => setDirectHistoryReviewOpen(false)}
          onComplete={onUpdate}
        />
      )}
      <QRModal
        group={group}
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        isAdmin={isAdmin}
      />
      {group.kind === "direct" && directPerson && !directPerson.uid ? (
        <DirectClaimInviteModal group={group} person={directPerson} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      ) : (
        <InviteModal
          group={group}
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          isAdmin={isAdmin}
          currentMemberId={currentMember?.id}
          onAddPending={handleAddPendingMember}
          onMergePending={handleMergePendingMember}
          onMergeMember={handleMergeJoinedMember}
          onSetAutoApproveClaims={handleSetAutoApproveClaims}
          onReviewClaimRequest={handleReviewClaimRequest}
          onDeletePending={handleDeletePendingMember}
          onRemoveMember={handleRemoveMember}
          onSetMemberAdmin={handleSetMemberAdmin}
        />
      )}
    </div>
  );
}
