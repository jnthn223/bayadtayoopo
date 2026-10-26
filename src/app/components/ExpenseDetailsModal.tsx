import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, Edit2, Receipt, Trash2, Users, X } from "lucide-react";
import type { Expense, Group } from "./types";
import { allocateItemizedShares } from "./itemizedExpense";
import { CATEGORY_ICONS, formatCurrency, getExpensePayerId, getMemberById } from "./utils";
import { UserAvatar } from "./UserAvatar";

interface Props {
  expense: Expense | null;
  group: Group;
  displayMemberName: (memberId: string, fallback?: string) => string;
  onClose: () => void;
  onViewReceipt: (imageId: string, title: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ExpenseDetailsModal({
  expense,
  group,
  displayMemberName,
  onClose,
  onViewReceipt,
  onEdit,
  onDelete,
}: Props) {
  if (!expense) return null;

  const payerId = getExpensePayerId(expense);
  const payer = getMemberById(group, payerId);
  const includedIds = new Set(expense.splits.filter((split) => split.amount > 0.005).map((split) => split.memberId));
  const excludedMembers = group.members.filter((member) => !includedIds.has(member.id));
  const itemizedShares = expense.splitType === "itemized" && expense.items?.length
    ? allocateItemizedShares(expense.items)
    : undefined;
  const splitLabel = expense.splitType === "equal"
    ? "Split equally"
    : expense.splitType === "itemized"
      ? "Split by item"
      : "Custom split";

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[80] max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:inset-x-4 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border sm:border-border">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-lg font-semibold text-foreground">{expense.description}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Expense details shared with everyone in this group
              </Dialog.Description>
            </div>
            <Dialog.Close className="shrink-0 rounded-full bg-muted p-2 text-foreground" aria-label="Close expense details">
              <X size={19} />
            </Dialog.Close>
          </div>

          <div className="space-y-5 p-5">
            <div className="flex items-center gap-4 rounded-2xl bg-primary/5 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-2xl">
                {CATEGORY_ICONS[expense.category]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Total expense</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(expense.amount, group.currency)}</p>
                {expense.originalAmount && expense.originalCurrency && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Originally {formatCurrency(expense.originalAmount, expense.originalCurrency)}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Detail label="Paid by" value={displayMemberName(payerId, payer?.name)} />
              <Detail label="Split method" value={splitLabel} />
              <Detail
                label="Date"
                value={new Date(`${expense.date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                icon={<CalendarDays size={13} />}
              />
              <Detail
                label="Category"
                value={expense.category === "other" && expense.categoryDetail
                  ? expense.categoryDetail
                  : expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}
              />
              {expense.dueDate && (
                <Detail
                  label="Due date"
                  value={new Date(`${expense.dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                />
              )}
            </div>

            {expense.notes && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="mt-2 whitespace-pre-line rounded-xl bg-muted/55 p-3 text-sm leading-relaxed text-foreground">{expense.notes}</p>
              </section>
            )}

            <section>
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Users size={15} /> Member shares</p>
                <span className="text-[11px] text-muted-foreground">{includedIds.size} of {group.members.length} included</span>
              </div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-border">
                {expense.splits.filter((split) => split.amount > 0.005).map((split, index, splits) => {
                  const member = getMemberById(group, split.memberId);
                  const amount = itemizedShares?.[split.memberId] ?? split.amount;
                  return (
                    <div key={split.memberId} className={`flex items-center gap-3 px-3 py-2.5 ${index < splits.length - 1 ? "border-b border-border" : ""}`}>
                      <UserAvatar
                        name={member?.name ?? "Unknown member"}
                        color={member?.color ?? "#7c3aed"}
                        seed={member?.avatarSeed}
                        uid={member?.uid}
                        photoVersion={member?.profileImageVersion}
                        className="h-8 w-8 shrink-0 rounded-full text-xs"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{displayMemberName(split.memberId, member?.name)}</span>
                      <span className="shrink-0 text-sm font-semibold text-foreground">{formatCurrency(amount, group.currency)}</span>
                    </div>
                  );
                })}
              </div>
              {excludedMembers.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Not included: {excludedMembers.map((member) => displayMemberName(member.id, member.name)).join(", ")}
                </p>
              )}
            </section>

            {expense.splitType === "itemized" && expense.items?.length ? (
              <section>
                <p className="text-sm font-semibold text-foreground">Item assignments</p>
                <div className="mt-3 space-y-2 rounded-2xl border border-border p-3">
                  {expense.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{item.name}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {item.memberIds.map((id) => displayMemberName(id, getMemberById(group, id)?.name)).join(", ") || "No members assigned"}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold text-foreground">{formatCurrency(item.amount, group.currency)}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {(expense.receipts?.length ?? 0) > 0 && (
              <section>
                <p className="text-sm font-semibold text-foreground">Receipts</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {expense.receipts!.map((receipt, index) => (
                    <button
                      key={receipt.imageId}
                      type="button"
                      onClick={() => onViewReceipt(receipt.imageId, expense.receipts!.length === 1 ? `Receipt · ${expense.description}` : `Receipt ${index + 1} · ${expense.description}`)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-primary"
                    >
                      <Receipt size={13} /> View receipt{expense.receipts!.length > 1 ? ` ${index + 1}` : ""}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(onEdit || onDelete) && (
              <div className={`grid gap-2 border-t border-border pt-4 ${onEdit && onDelete ? "grid-cols-2" : "grid-cols-1"}`}>
                {onEdit && <button type="button" onClick={onEdit} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground"><Edit2 size={15} /> Edit expense</button>}
                {onDelete && <button type="button" onClick={onDelete} className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive"><Trash2 size={15} /> Delete expense</button>}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/55 p-3">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{icon}{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
