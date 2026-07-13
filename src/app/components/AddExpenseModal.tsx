import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, X } from "lucide-react";
import type { CurrentUser, Group, Expense, SplitType, Category } from "./types";
import { allocateCustomShares, generateId, CATEGORY_ICONS, getCurrencySymbol, getExpensePayerId } from "./utils";
import { UserAvatar } from "./UserAvatar";

interface Props {
  group: Group;
  open: boolean;
  onClose: () => void;
  onAdd: (expense: Expense) => void;
  currentUser: CurrentUser;
  editExpense?: Expense | null;
  isAdmin?: boolean;
}

const CATEGORIES: Category[] = [
  "food",
  "transport",
  "accommodation",
  "entertainment",
  "shopping",
  "utilities",
  "other",
];

export function AddExpenseModal({
  group,
  open,
  onClose,
  onAdd,
  currentUser,
  editExpense,
  isAdmin,
}: Props) {
  const currentMember = group.members.find(
    (member) => member.id === currentUser.id || member.uid === currentUser.id,
  );
  const defaultPayerId = currentMember?.id ?? currentUser.id;
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(defaultPayerId);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [category, setCategory] = useState<Category>("food");
  const [customOverrides, setCustomOverrides] = useState<Record<string, string>>({});
  const [includedMemberIds, setIncludedMemberIds] = useState<string[]>(
    group.members.map((member) => member.id),
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;

    if (editExpense) {
      setDescription(editExpense.description);
      setAmount(String(editExpense.amount));
      setPaidBy(isAdmin ? editExpense.paidBy : defaultPayerId);
      setSplitType(editExpense.splitType);
      setCategory(editExpense.category);
      setDate(editExpense.date);

      setIncludedMemberIds(editExpense.splits.map((split) => split.memberId));
      setCustomOverrides(
        editExpense.splitType === "custom"
          ? Object.fromEntries(
              editExpense.splits.map((split) => [split.memberId, String(split.amount)]),
            )
          : {},
      );
    } else {
      setDescription("");
      setAmount("");
      setPaidBy(defaultPayerId);
      setSplitType("equal");
      setCategory("food");
      setDate(new Date().toISOString().slice(0, 10));
      setCustomOverrides({});
      setIncludedMemberIds(group.members.map((member) => member.id));
    }

    setErrors({});
  }, [open, editExpense, isAdmin, defaultPayerId]);

  const totalAmount = parseFloat(amount) || 0;
  const includedMembers = group.members.filter((member) =>
    includedMemberIds.includes(member.id),
  );
  const numericOverrides = Object.fromEntries(
    Object.entries(customOverrides)
      .filter(([memberId]) => includedMemberIds.includes(memberId))
      .map(([memberId, value]) => [memberId, parseFloat(value) || 0]),
  );
  const customAllocation = allocateCustomShares(
    includedMemberIds,
    totalAmount,
    numericOverrides,
  );
  const equalAllocation = allocateCustomShares(includedMemberIds, totalAmount, {});
  const customTotal = Object.values(customAllocation).reduce((sum, value) => sum + value, 0);
  const customDiff = Math.abs(customTotal - totalAmount);

  const currencySymbol = getCurrencySymbol(group.currency);
  const displayMemberName = (memberId: string, fallback: string) =>
    memberId === currentMember?.id ? "You" : fallback;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!description.trim()) errs.description = "Required";
    if (!totalAmount || totalAmount <= 0) errs.amount = "Enter a valid amount";
    if (!paidBy) errs.paidBy = "Choose who paid the expense";
    if (includedMembers.length === 0) errs.members = "Include at least one member";
    if (Object.values(customOverrides).some((value) => parseFloat(value) < 0)) {
      errs.splits = "Split amounts cannot be negative";
    }
    if (splitType === "custom") {
      if (customDiff > 0.01)
        errs.splits = `Splits must equal total (diff: ${currencySymbol}${customDiff.toFixed(2)})`;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const creatorId = editExpense?.createdBy ?? currentMember?.id ?? currentUser.id;
    const payerId = isAdmin ? paidBy : creatorId;
    const previousSplitsByMember = new Map(
      editExpense && getExpensePayerId(editExpense) === payerId
        ? editExpense.splits.map((s) => [s.memberId, s])
        : [],
    );
    const paymentState = (memberId: string, splitAmount: number) => {
      const previous = previousSplitsByMember.get(memberId);
      if (previous && Math.abs(previous.amount - splitAmount) < 0.005) {
        return {
          paymentStatus: previous.paymentStatus,
          paymentSubmission: previous.paymentSubmission,
          confirmedAt: previous.confirmedAt,
          confirmedBy: previous.confirmedBy,
        };
      }
      return {};
    };
    const splits =
      splitType === "equal"
        ? includedMembers.map((m) => {
            const splitAmount = equalAllocation[m.id] ?? 0;
            return {
              memberId: m.id,
              amount: splitAmount,
              ...paymentState(m.id, splitAmount),
            };
          })
        : includedMembers.map((m) => {
            const splitAmount = customAllocation[m.id] ?? 0;
            return {
              memberId: m.id,
              amount: splitAmount,
              ...paymentState(m.id, splitAmount),
            };
          });

    onAdd({
      id: editExpense?.id ?? generateId(),
      description: description.trim(),
      amount: totalAmount,
      paidBy: payerId,
      createdBy: creatorId,
      splitType,
      splits,
      date,
      category,
    });
    onClose();
  }

  function distributeEqually() {
    setCustomOverrides({});
  }

  function toggleMember(memberId: string) {
    setIncludedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
    setCustomOverrides((current) => {
      const next = { ...current };
      delete next[memberId];
      return next;
    });
    setErrors((current) => ({ ...current, members: "", splits: "" }));
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
          <div className="sticky top-0 bg-card pt-4 pb-2 px-5 flex items-center justify-between border-b border-border">
            <div className="w-10 h-1 bg-border rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
            <Dialog.Title className="text-lg font-semibold text-foreground">
              {editExpense ? "Edit Expense" : "Add Expense"}
            </Dialog.Title>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-muted transition-colors"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <div className="p-5 space-y-5 pb-10">
            {/* Description */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Description
              </label>
              <input
                type="text"
                placeholder="e.g. Dinner at the beach"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {errors.description && (
                <p className="text-destructive text-xs mt-1">
                  {errors.description}
                </p>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Amount ({group.currency})
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              {errors.amount && (
                <p className="text-destructive text-xs mt-1">{errors.amount}</p>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Category
              </label>
              <div className="grid grid-cols-4 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs transition-all ${
                      category === cat
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border bg-input-background text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <span className="text-lg">{CATEGORY_ICONS[cat]}</span>
                    <span className="capitalize">{cat}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Initial payer */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Initially paid by
              </label>
              {isAdmin ? (
                <>
                  <div className="relative">
                    <select
                      value={paidBy}
                      onChange={(event) => {
                        setPaidBy(event.target.value);
                        setErrors((current) => ({ ...current, paidBy: "" }));
                      }}
                      className="w-full px-4 py-3 pr-10 rounded-xl bg-input-background border border-border text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                    >
                      {group.members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {displayMemberName(member.id, member.name)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    As admin, you can record an expense for the member who actually paid upfront.
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30">
                  <UserAvatar
                    name={currentMember?.name ?? currentUser.name}
                    color={currentMember?.color ?? currentUser.color}
                    seed={currentMember?.avatarSeed ?? currentUser.avatarSeed}
                    className="w-9 h-9 rounded-full"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">You</p>
                    <p className="text-xs text-muted-foreground">You paid this expense upfront</p>
                  </div>
                </div>
              )}
              {errors.paidBy && <p className="text-destructive text-xs mt-1.5">{errors.paidBy}</p>}
            </div>

            {/* Split type */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Split
              </label>
              <div className="flex gap-2 p-1 bg-muted rounded-xl">
                {(["equal", "custom"] as SplitType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setSplitType(type)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      splitType === type
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {type === "equal" ? "Equal" : "Custom"}
                  </button>
                ))}
              </div>
            </div>

            {/* Splits */}
            {splitType === "equal" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Included members</span>
                  <span className="text-xs text-muted-foreground">Tap to include or exclude</span>
                </div>
                {group.members.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => toggleMember(m.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                      includedMemberIds.includes(m.id)
                        ? "bg-accent border-primary/20"
                        : "bg-muted/30 border-border opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                        includedMemberIds.includes(m.id)
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border bg-card"
                      }`}>
                        {includedMemberIds.includes(m.id) && <Check size={13} />}
                      </span>
                      <UserAvatar name={m.name} color={m.color} seed={m.avatarSeed} className="w-8 h-8 rounded-full text-sm" />
                      <span className="text-sm text-foreground">
                        {displayMemberName(m.id, m.name)}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-accent-foreground">
                      {includedMemberIds.includes(m.id)
                        ? `${currencySymbol}${(equalAllocation[m.id] ?? 0).toFixed(2)}`
                        : "Excluded"}
                    </span>
                  </button>
                ))}
                {errors.members && <p className="text-destructive text-xs">{errors.members}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    Set fixed shares; the rest updates automatically
                  </span>
                  <button
                    onClick={distributeEqually}
                    className="text-xs text-primary font-medium"
                  >
                    Distribute equally
                  </button>
                </div>
                {group.members.map((m) => (
                  <div
                    key={m.id}
                    className={`flex items-center gap-2 rounded-xl p-2 border ${
                      includedMemberIds.includes(m.id)
                        ? "border-border bg-card"
                        : "border-border bg-muted/30 opacity-60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleMember(m.id)}
                      className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
                        includedMemberIds.includes(m.id)
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border bg-card"
                      }`}
                      aria-label={`${includedMemberIds.includes(m.id) ? "Exclude" : "Include"} ${m.name}`}
                    >
                      {includedMemberIds.includes(m.id) && <Check size={14} />}
                    </button>
                    <UserAvatar name={m.name} color={m.color} seed={m.avatarSeed} className="w-8 h-8 rounded-full text-sm shrink-0" />
                    <div className="w-24 min-w-0 shrink-0">
                      <p className="text-sm text-foreground truncate">{displayMemberName(m.id, m.name)}</p>
                      {includedMemberIds.includes(m.id) && (
                        <p className="text-[10px] text-muted-foreground">
                          {Object.prototype.hasOwnProperty.call(customOverrides, m.id) ? "Fixed" : "Auto"}
                        </p>
                      )}
                    </div>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        {currencySymbol}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!includedMemberIds.includes(m.id)}
                        value={
                          !includedMemberIds.includes(m.id)
                            ? ""
                            : Object.prototype.hasOwnProperty.call(customOverrides, m.id)
                              ? customOverrides[m.id]
                              : (customAllocation[m.id] ?? 0).toFixed(2)
                        }
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(e) => {
                          const value = e.target.value;
                          setCustomOverrides((current) => {
                            if (value === "") {
                              const next = { ...current };
                              delete next[m.id];
                              return next;
                            }
                            return { ...current, [m.id]: value };
                          });
                          setErrors((current) => ({ ...current, splits: "" }));
                        }}
                        className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-input-background border border-border text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm disabled:cursor-not-allowed"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                ))}
                <div
                  className={`flex justify-between text-sm pt-1 ${customDiff > 0.01 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  <span>Total assigned</span>
                  <span>
                    {currencySymbol}
                    {customTotal.toFixed(2)} / {currencySymbol}
                    {totalAmount.toFixed(2)}
                  </span>
                </div>
                {errors.splits && (
                  <p className="text-destructive text-xs">{errors.splits}</p>
                )}
                {errors.members && <p className="text-destructive text-xs">{errors.members}</p>}
              </div>
            )}

            <button
              onClick={handleSubmit}
              className="w-full py-4 rounded-2xl text-primary-foreground font-semibold text-base transition-all active:scale-95"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {editExpense ? "Save Changes" : "Add Expense"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
