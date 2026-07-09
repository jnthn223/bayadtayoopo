export interface Member {
  id: string;
  uid?: string; // Firebase UID — present for real users, absent for manually-added members
  name: string;
  color: string;
}

export interface Split {
  memberId: string;
  amount: number;
  paymentStatus?: "pending" | "confirmed" | "rejected";
}

export type SplitType = "equal" | "custom";
export type Category = "food" | "transport" | "accommodation" | "entertainment" | "shopping" | "utilities" | "other";

export interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
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
  members: Member[];
  expenses: Expense[];
  createdAt: string;
  currency: string;
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
