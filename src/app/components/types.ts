export interface Member {
  id: string;
  uid?: string; // Firebase UID — present for real users, absent for manually-added members
  name: string;
  color: string;
  paymentInstructions?: PaymentInstructions;
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
}

export type SplitType = "equal" | "custom";
export type Category = "food" | "transport" | "accommodation" | "entertainment" | "shopping" | "utilities" | "other";

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
}

export interface Group {
  id: string;
  name: string;
  adminId?: string;
  members: Member[];
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
