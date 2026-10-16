export interface Member {
  id: string;
  uid?: string; // Firebase UID — present for real users, absent for manually-added members
  name: string;
  color: string;
  avatarSeed?: string;
  profileImageVersion?: string;
  claimCode?: string;
  claimedFromPlaceholder?: boolean;
  paymentInstructions?: PaymentInstructions;
  removedAt?: string;
  joinedAt?: string;
}

export interface PaymentInstructions {
  method: string;
  accountName?: string;
  accountIdentifier?: string;
  instructions?: string;
  qrCodeImageId?: string;
}

export interface PaymentSubmission {
  method: string;
  referenceNumber?: string;
  note?: string;
  proofImageId?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedOnBehalfOfMemberId?: string;
  rejectionReason?: string;
}

export interface ExpenseReceipt {
  imageId: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface PaymentAllocation {
  expenseId?: string;
  expenseDescription: string;
  amount: number;
}

export type PaymentScheduleFrequency = "weekly" | "biweekly" | "monthly";
export type PaymentScheduleStatus =
  | "proposed"
  | "active"
  | "paused"
  | "declined"
  | "withdrawn"
  | "ended"
  | "completed";

export interface PaymentScheduleCoverage {
  expenseId: string;
  expenseDescription: string;
  /** Outstanding amount captured when this proposal was created. */
  amount: number;
}

export interface PaymentScheduleActivity {
  id: string;
  type: "created" | "edited" | "accepted" | "declined" | "withdrawn" | "paused" | "resumed" | "ended";
  actorMemberId: string;
  at: string;
  note?: string;
}

export interface PaymentSchedule {
  id: string;
  payeeMemberId: string;
  debtorMemberId: string;
  coverage: PaymentScheduleCoverage[];
  installmentAmount: number;
  frequency: PaymentScheduleFrequency;
  firstPaymentDate: string;
  message?: string;
  status: PaymentScheduleStatus;
  createdAt: string;
  createdBy: string;
  /** Member who sent the current proposal or counterproposal. */
  proposedBy?: string;
  /** Member who must accept, change, or decline the current proposal. */
  awaitingMemberId?: string;
  updatedAt: string;
  respondedAt?: string;
  respondedBy?: string;
  activity: PaymentScheduleActivity[];
}

export type GroupPaymentStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "reversed";

export interface GroupPayment {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  method: string;
  referenceNumber?: string;
  note?: string;
  proofImageId?: string;
  allocations: PaymentAllocation[];
  settlementRoute?:
    | "fewer-transfers"
    | "original-payees"
    | "specific-expenses";
  status: GroupPaymentStatus;
  submittedAt: string;
  submittedBy: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedOnBehalfOfMemberId?: string;
  reviewNote?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  reversedAt?: string;
  reversedBy?: string;
  reversedOnBehalfOfMemberId?: string;
  reversalReason?: string;
}

export type BalanceOffsetStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "cancelled";

export interface BalanceOffset {
  id: string;
  requesterMemberId: string;
  counterpartyMemberId: string;
  amount: number;
  /** Expenses the requester owes the counterparty. */
  debitAllocations: PaymentAllocation[];
  /** Reciprocal expenses the counterparty owes the requester. */
  creditAllocations: PaymentAllocation[];
  status: BalanceOffsetStatus;
  requestedAt: string;
  requestedBy: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedOnBehalfOfMemberId?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

export interface MemberClaimRequest {
  id: string;
  pendingMemberId: string;
  requestingMemberId: string;
  pendingMemberName: string;
  requestingMemberName: string;
  status: "pending" | "confirmed" | "rejected";
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface Split {
  memberId: string;
  amount: number;
  paymentStatus?: "pending" | "confirmed" | "rejected";
  paymentSubmission?: PaymentSubmission;
  confirmedAt?: string;
  confirmedBy?: string;
}

export type SplitType = "equal" | "custom";
export const EXPENSE_CATEGORIES = [
  "food",
  "drinks",
  "groceries",
  "transport",
  "accommodation",
  "activities",
  "entertainment",
  "shopping",
  "utilities",
  "other",
] as const;

export type Category = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  description: string;
  notes?: string;
  amount: number;
  originalAmount?: number;
  originalCurrency?: string;
  conversionRate?: number;
  conversionRateDate?: string;
  conversionSource?: "online-suggestion" | "manual";
  paidBy: string;
  createdBy?: string;
  splitType: SplitType;
  splits: Split[];
  date: string;
  dueDate?: string;
  category: Category;
  categoryDetail?: string;
  receipts?: ExpenseReceipt[];
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ExpenseCorrectionRequest {
  id: string;
  expenseId: string;
  reason: string;
  proposedExpense: Expense;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  dismissedByRequesterAt?: string;
}

export interface DirectHistoryDispute {
  id: string;
  entityType: "expense" | "payment";
  entityId: string;
  entityLabel: string;
  reason: string;
  raisedBy: string;
  raisedAt: string;
  status: "open" | "resolved";
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface NotificationPreferences {
  payments: boolean;
  expenses: boolean;
  chat: boolean;
  memberActivity: boolean;
  systemNotifications: boolean;
  mutedChatGroupIds: string[];
}

export type PaymentReminderFrequency =
  | "every3days"
  | "weekly"
  | "biweekly"
  | "monthly";

export interface PaymentReminderPreferences {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  frequency: PaymentReminderFrequency;
  /** 0 = Sunday, 5 = Friday. */
  weekday: number;
  /** Local hour using a 24-hour clock. */
  hour: number;
  timeZone: string;
  mutedGroupIds: string[];
  groupSnoozes: Record<string, string>;
}

export interface PaymentReminderGroupSummary {
  groupId: string;
  groupName: string;
  amount: number;
  currency: string;
  pendingPaymentAmount: number;
  nearestDueDate?: string;
  overdueAmount?: number;
  dueTodayAmount?: number;
  dueSoonAmount?: number;
  scheduledPaymentAmount?: number;
  scheduledPaymentCount?: number;
  scheduledExpenseNames?: string[];
  scheduleReminderKey?: string;
}

export interface PaymentReminderDigest {
  id: string;
  createdAt: string;
  groups: PaymentReminderGroupSummary[];
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  color: string;
  avatarSeed?: string;
  profileImageVersion?: string;
  notificationReadAt?: string;
  notificationPreferences?: NotificationPreferences;
  paymentReminderPreferences?: PaymentReminderPreferences;
  paymentReminderDigest?: PaymentReminderDigest;
  productUpdateEmailsEnabled?: boolean;
  seenAnnouncementIds?: string[];
}

export interface UserProfile {
  email?: string;
  name?: string;
  color?: string;
  avatarSeed?: string;
  profileImageVersion?: string;
  notificationReadAt?: string;
  notificationPreferences?: NotificationPreferences;
  paymentReminderPreferences?: PaymentReminderPreferences;
  paymentReminderDigest?: PaymentReminderDigest;
  productUpdateEmailsEnabled?: boolean;
  seenAnnouncementIds?: string[];
}

export type NotificationType =
  | "payment_submitted"
  | "payment_confirmed"
  | "payment_rejected"
  | "payment_cancelled"
  | "payment_reversed"
  | "balance_offset_requested"
  | "balance_offset_confirmed"
  | "balance_offset_rejected"
  | "balance_offset_cancelled"
  | "expense_created"
  | "expense_updated"
  | "expense_deleted"
  | "payment_reminder"
  | "payment_schedule_proposed"
  | "payment_schedule_accepted"
  | "payment_schedule_declined"
  | "payment_schedule_updated"
  | "chat_message"
  | "member_joined"
  | "direct_request"
  | "direct_request_accepted"
  | "direct_request_declined"
  | "direct_request_withdrawn"
  | "direct_correction_requested"
  | "direct_correction_approved"
  | "direct_correction_rejected"
  | "direct_correction_cancelled";

export interface NotificationDestination {
  tab: "expenses" | "balances" | "settle" | "chat";
  expenseId?: string;
  paymentId?: string;
  messageId?: string;
  manageMembers?: boolean;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  groupId: string;
  groupName: string;
  title: string;
  body: string;
  at: string;
  actorId?: string;
  destination: NotificationDestination;
}

export interface Group {
  id: string;
  name: string;
  /** Direct ledgers reuse the group accounting model but are presented person-first. */
  kind?: "group" | "direct";
  participantUids?: string[];
  /** Known contact identity used for private cross-group context before they are invited. */
  directContactUid?: string;
  directStatus?: "draft" | "pending" | "active" | "declined" | "withdrawn";
  directRequestedBy?: string;
  directRequestedAt?: string;
  directReviewedBy?: string;
  directReviewedAt?: string;
  directHistoryReviewedBy?: string;
  directHistoryReviewedAt?: string;
  directHistoryDisputes?: DirectHistoryDispute[];
  avatarSeed?: string;
  groupImageVersion?: string;
  adminId?: string;
  adminIds?: string[];
  /** Allows a visitor to claim a similar-name pending member after confirming. */
  autoApproveSimilarNameClaims?: boolean;
  members: Member[];
  /** Members removed from the active roster, retained for historical records. */
  formerMembers?: Member[];
  expenses: Expense[];
  payments?: GroupPayment[];
  balanceOffsets?: BalanceOffset[];
  paymentSchedules?: PaymentSchedule[];
  memberClaimRequests?: MemberClaimRequest[];
  deletedExpenses?: DeletedExpense[];
  expenseDeletionRequests?: ExpenseDeletionRequest[];
  expenseCorrectionRequests?: ExpenseCorrectionRequest[];
  messages?: ChatMessage[];
  createdAt: string;
  currency: string;
}

export interface ExpenseDeletionRequest {
  id: string;
  expenseId: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  requiredApproverIds: string[];
  approvedByIds: string[];
  status: "pending" | "rejected" | "cancelled" | "completed";
  rejectedBy?: string;
  rejectedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  completedAt?: string;
}

export interface DeletedExpense {
  expenseId: string;
  description: string;
  amount: number;
  deletedBy: string;
  reason: string;
  deletedAt: string;
}

export interface ChatMessage {
  id: string;
  memberId: string;
  text: string;
  replyToMessageId?: string;
  mentionedMemberIds?: string[];
  createdAt: string;
}

export interface Balance {
  memberId: string;
  memberName: string;
  net: number;
}

export interface Settlement {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}
