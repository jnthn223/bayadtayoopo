import type { Split } from "./types";

export const SELF_ONLY_EXPENSE_ERROR =
  "Add at least one other member who owes part of this expense. The payer cannot owe only themselves.";

export function hasNonPayerShare(
  payerId: string,
  splits: Array<Pick<Split, "memberId" | "amount">>,
): boolean {
  return splits.some(
    (split) => split.memberId !== payerId && split.amount > 0.005,
  );
}
