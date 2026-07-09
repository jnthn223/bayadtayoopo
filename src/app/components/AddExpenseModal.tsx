import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronDown } from "lucide-react";
import type { Group, Expense, SplitType, Category } from "./types";
import { generateId, CATEGORY_ICONS, MEMBER_COLORS } from "./utils";

interface Props {
  group: Group;
  open: boolean;
  onClose: () => void;
  onAdd: (expense: Expense) => void;
  editExpense?: Expense | null;
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
  editExpense,
}: Props) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(group.members[0]?.id ?? "");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [category, setCategory] = useState<Category>("food");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;

    if (editExpense) {
      setDescription(editExpense.description);
      setAmount(String(editExpense.amount));
      setPaidBy(editExpense.paidBy);
      setSplitType(editExpense.splitType);
      setCategory(editExpense.category);
      setDate(editExpense.date);

      const splits: Record<string, string> = {};
      editExpense.splits.forEach((s) => {
        splits[s.memberId] = String(s.amount);
      });
      setCustomSplits(splits);
    } else {
      setDescription("");
      setAmount("");
      setPaidBy(group.members[0]?.id ?? "");
      setSplitType("equal");
      setCategory("food");
      setDate(new Date().toISOString().slice(0, 10));
      setCustomSplits({});
    }

    setErrors({});
  }, [open, editExpense]);

  const totalAmount = parseFloat(amount) || 0;
  const equalShare =
    group.members.length > 0 ? totalAmount / group.members.length : 0;

  const customTotal = Object.values(customSplits).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0,
  );
  const customDiff = Math.abs(customTotal - totalAmount);

  const CURRENCY_SYMBOLS: Record<string, string> = {
    PHP: "₱",
    USD: "$",
    EUR: "€",
    GBP: "£",
  };

  const currencySymbol = CURRENCY_SYMBOLS[group.currency] ?? group.currency;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!description.trim()) errs.description = "Required";
    if (!totalAmount || totalAmount <= 0) errs.amount = "Enter a valid amount";
    if (!paidBy) errs.paidBy = "Select who paid";
    if (splitType === "custom") {
      if (customDiff > 0.01)
        errs.splits = `Splits must equal total (diff: $${customDiff.toFixed(2)})`;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const splits =
      splitType === "equal"
        ? group.members.map((m, i) => ({
            memberId: m.id,
            amount:
              i < group.members.length - 1
                ? Math.floor((totalAmount / group.members.length) * 100) / 100
                : Math.round(
                    (totalAmount -
                      (Math.floor((totalAmount / group.members.length) * 100) /
                        100) *
                        (group.members.length - 1)) *
                      100,
                  ) / 100,
          }))
        : group.members.map((m) => ({
            memberId: m.id,
            amount: parseFloat(customSplits[m.id] || "0"),
          }));

    onAdd({
      id: editExpense?.id ?? generateId(),
      description: description.trim(),
      amount: totalAmount,
      paidBy,
      splitType,
      splits,
      date,
      category,
    });
    onClose();
  }

  function distributeEqually() {
    const each = (totalAmount / group.members.length).toFixed(2);
    const splits: Record<string, string> = {};
    group.members.forEach((m) => (splits[m.id] = each));
    setCustomSplits(splits);
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

            {/* Paid By */}
            {group.members.length === 1 ? (
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">
                  Paid by
                </label>

                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm text-white font-medium"
                    style={{ backgroundColor: group.members[0].color }}
                  >
                    {group.members[0].name[0].toUpperCase()}
                  </div>

                  <span className="font-medium text-foreground">
                    {group.members[0].name}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">
                  Paid by
                </label>

                <div className="relative">
                  <select
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                  >
                    {group.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>

                  <ChevronDown
                    size={16}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                </div>

                {errors.paidBy && (
                  <p className="text-destructive text-xs mt-1">
                    {errors.paidBy}
                  </p>
                )}
              </div>
            )}

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
                {group.members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-accent"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm text-white font-medium"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.name[0].toUpperCase()}
                      </div>
                      <span className="text-sm text-foreground">{m.name}</span>
                    </div>
                    <span className="text-sm font-medium text-accent-foreground">
                      $
                      {totalAmount
                        ? (totalAmount / group.members.length).toFixed(2)
                        : "0.00"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    Assign amounts per person
                  </span>
                  <button
                    onClick={distributeEqually}
                    className="text-xs text-primary font-medium"
                  >
                    Distribute equally
                  </button>
                </div>
                {group.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm text-white font-medium shrink-0"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.name[0].toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground w-24 shrink-0">
                      {m.name}
                    </span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customSplits[m.id] ?? ""}
                        onChange={(e) =>
                          setCustomSplits((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }))
                        }
                        className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-input-background border border-border text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
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
                    ${customTotal.toFixed(2)} / ${totalAmount.toFixed(2)}
                  </span>
                </div>
                {errors.splits && (
                  <p className="text-destructive text-xs">{errors.splits}</p>
                )}
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
