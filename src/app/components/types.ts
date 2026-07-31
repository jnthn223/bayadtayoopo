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
  status: GroupPaymentStatus;
  submittedAt: string;
  submittedBy: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  reversedAt?: string;
  reversedBy?: string;
  reversalReason?: string;
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
  "transport",
  "accommodation",
  "trip",
  "entertainment",
  "shopping",
  "utilities",
  "other",
] as const;

export type Category = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  createdBy?: string;
  splitType: SplitType;
  splits: Split[];
  date: string;
  category: Category;
  receipts?: ExpenseReceipt[];
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface NotificationPreferences {
  payments: boolean;
  expenses: boolean;
  chat: boolean;
  memberActivity: boolean;
  systemNotifications: boolean;
  mutedChatGroupIds: string[];
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
}

export interface UserProfile {
  name?: string;
  color?: string;
  avatarSeed?: string;
  profileImageVersion?: string;
  notificationReadAt?: string;
  notificationPreferences?: NotificationPreferences;
}

export type NotificationType =
  | "payment_submitted"
  | "payment_confirmed"
  | "payment_rejected"
  | "payment_cancelled"
  | "payment_reversed"
  | "expense_created"
  | "expense_updated"
  | "expense_deleted"
  | "chat_message"
  | "member_joined";

export interface NotificationDestination {
  tab: "expenses" | "balances" | "settle" | "chat";
  expenseId?: string;
  paymentId?: string;
  messageId?: string;
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
  avatarSeed?: string;
  adminId?: string;
  adminIds?: string[];
  members: Member[];
  /** Members removed from the active roster, retained for historical records. */
  formerMembers?: Member[];
  expenses: Expense[];
  payments?: GroupPayment[];
  deletedExpenses?: DeletedExpense[];
  messages?: ChatMessage[];
  createdAt: string;
  currency: string;
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
