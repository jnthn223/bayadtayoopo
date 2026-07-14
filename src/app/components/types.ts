export interface Member {
  id: string;
  uid?: string; // Firebase UID — present for real users, absent for manually-added members
  name: string;
  color: string;
  avatarSeed?: string;
  claimCode?: string;
  claimedFromPlaceholder?: boolean;
  paymentInstructions?: PaymentInstructions;
  removedAt?: string;
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
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  color: string;
  avatarSeed?: string;
}

export interface UserProfile {
  name?: string;
  color?: string;
  avatarSeed?: string;
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
