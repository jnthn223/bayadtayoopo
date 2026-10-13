export type ExpenseDeadlineState = "upcoming" | "due-soon" | "due-today" | "overdue";

export function getExpenseDeadlineState(
  dueDate?: string,
  now = new Date(),
): { state: ExpenseDeadlineState; label: string } | undefined {
  if (!dueDate) return undefined;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return undefined;
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { state: "overdue", label: `Overdue by ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}` };
  if (days === 0) return { state: "due-today", label: "Due today" };
  if (days === 1) return { state: "due-soon", label: "Due tomorrow" };
  if (days <= 3) return { state: "due-soon", label: `Due in ${days} days` };
  return {
    state: "upcoming",
    label: `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
  };
}
