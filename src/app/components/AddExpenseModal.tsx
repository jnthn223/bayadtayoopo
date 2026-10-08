import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, ImagePlus, Loader2, RefreshCw, X } from "lucide-react";
import { EXPENSE_CATEGORIES } from "./types";
import type { CurrentUser, Group, Expense, SplitType, Category } from "./types";
import { allocateCustomShares, formatCurrency, generateId, CATEGORY_ICONS, getCurrencySymbol, getExpensePayerId } from "./utils";
import { UserAvatar } from "./UserAvatar";
import { ImagePasteControl } from "./ImagePasteControl";
import { hasNonPayerShare, SELF_ONLY_EXPENSE_ERROR } from "./expenseValidation";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { fetchExchangeRate } from "../../lib/exchangeRateService";

interface Props {
  group: Group;
  open: boolean;
  onClose: () => void;
  onAdd: (expense: Expense, receiptFiles: File[]) => Promise<void> | void;
  currentUser: CurrentUser;
  editExpense?: Expense | null;
  isAdmin?: boolean;
}

export function AddExpenseModal({
  group,
  open,
  onClose,
  onAdd,
  currentUser,
  editExpense,
  isAdmin,
}: Props) {
  const historicalMemberIds = new Set([
    ...(editExpense?.splits.map((split) => split.memberId) ?? []),
    ...(editExpense ? [editExpense.paidBy] : []),
  ]);
  const historicalMembers = (group.formerMembers ?? []).filter((member) =>
    historicalMemberIds.has(member.id),
  );
  const availableMembers = [...group.members, ...historicalMembers];
  const currentMember = group.members.find(
    (member) => member.id === currentUser.id || member.uid === currentUser.id,
  );
  const defaultPayerId = currentMember?.id ?? currentUser.id;
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [foreignCurrencyOpen, setForeignCurrencyOpen] = useState(false);
  const [originalAmount, setOriginalAmount] = useState("");
  const [originalCurrency, setOriginalCurrency] = useState("USD");
  const [suggestedBaseAmount, setSuggestedBaseAmount] = useState<number | null>(null);
  const [suggestedRateDate, setSuggestedRateDate] = useState("");
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState("");
  const [paidBy, setPaidBy] = useState(defaultPayerId);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [category, setCategory] = useState<Category>("food");
  const [categoryDetail, setCategoryDetail] = useState("");
  const [customOverrides, setCustomOverrides] = useState<Record<string, string>>({});
  const [includedMemberIds, setIncludedMemberIds] = useState<string[]>(
    group.members.map((member) => member.id),
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (editExpense) {
      setDescription(editExpense.description);
      setNotes(editExpense.notes ?? "");
      setAmount(String(editExpense.amount));
      setForeignCurrencyOpen(!!editExpense.originalCurrency);
      setOriginalAmount(editExpense.originalAmount ? String(editExpense.originalAmount) : "");
      setOriginalCurrency(editExpense.originalCurrency ?? (group.currency === "USD" ? "PHP" : "USD"));
      setSuggestedBaseAmount(
        editExpense.conversionSource === "online-suggestion" ? editExpense.amount : null,
      );
      setSuggestedRateDate(editExpense.conversionRateDate ?? "");
      setPaidBy(isAdmin ? editExpense.paidBy : defaultPayerId);
      setSplitType(editExpense.splitType);
      setCategory(editExpense.category);
      setCategoryDetail(editExpense.categoryDetail ?? "");
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
      setNotes("");
      setAmount("");
      setForeignCurrencyOpen(false);
      setOriginalAmount("");
      setOriginalCurrency(group.currency === "USD" ? "PHP" : "USD");
      setSuggestedBaseAmount(null);
      setSuggestedRateDate("");
      setPaidBy(defaultPayerId);
      setSplitType("equal");
      setCategory("food");
      setCategoryDetail("");
      setDate(new Date().toISOString().slice(0, 10));
      setCustomOverrides({});
      setIncludedMemberIds(group.members.map((member) => member.id));
    }

    setErrors({});
    setRateError("");
    setReceiptFiles([]);
  }, [open, editExpense, isAdmin, defaultPayerId]);

  const totalAmount = parseFloat(amount) || 0;
  const numericOriginalAmount = parseFloat(originalAmount) || 0;
  const includedMembers = availableMembers.filter((member) =>
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
    if (foreignCurrencyOpen && numericOriginalAmount <= 0) {
      errs.originalAmount = "Enter the amount that was originally paid";
    }
    if (!paidBy) errs.paidBy = "Choose who paid the expense";
    if (category === "other" && !categoryDetail.trim()) {
      errs.categoryDetail = "Specify what kind of expense this is";
    }
    if (includedMembers.length === 0) errs.members = "Include at least one member";
    if (Object.values(customOverrides).some((value) => parseFloat(value) < 0)) {
      errs.splits = "Split amounts cannot be negative";
    }
    if (splitType === "custom") {
      if (customDiff > 0.01)
        errs.splits = `Splits must equal total (diff: ${currencySymbol}${customDiff.toFixed(2)})`;
    }
    const payerId = isAdmin ? paidBy : (currentMember?.id ?? currentUser.id);
    const allocation = splitType === "custom" ? customAllocation : equalAllocation;
    if (
      paidBy &&
      includedMembers.length > 0 &&
      !hasNonPayerShare(
        payerId,
        includedMembers.map((member) => ({
          memberId: member.id,
          amount: allocation[member.id] ?? 0,
        })),
      )
    ) {
      errs.members = SELF_ONLY_EXPENSE_ERROR;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    const savedAt = new Date().toISOString();
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

    setSaving(true);
    try {
      await onAdd(
        {
          id: editExpense?.id ?? generateId(),
          description: description.trim(),
          notes: notes.trim() || undefined,
          amount: totalAmount,
          originalAmount: foreignCurrencyOpen ? numericOriginalAmount : undefined,
          originalCurrency: foreignCurrencyOpen ? originalCurrency : undefined,
          conversionRate:
            foreignCurrencyOpen && numericOriginalAmount > 0
              ? totalAmount / numericOriginalAmount
              : undefined,
          conversionRateDate: foreignCurrencyOpen
            ? (suggestedRateDate || date)
            : undefined,
          conversionSource: foreignCurrencyOpen
            ? suggestedBaseAmount !== null && Math.abs(totalAmount - suggestedBaseAmount) < 0.005
              ? "online-suggestion"
              : "manual"
            : undefined,
          paidBy: payerId,
          createdBy: creatorId,
          splitType,
          splits,
          date,
          category,
          categoryDetail: category === "other" ? categoryDetail.trim() : undefined,
          receipts: editExpense?.receipts,
          createdAt: editExpense?.createdAt ?? savedAt,
          updatedAt: editExpense ? savedAt : undefined,
          updatedBy: editExpense
            ? (currentMember?.id ?? currentUser.id)
            : undefined,
        },
        receiptFiles,
      );
      onClose();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        receipts:
          error instanceof Error ? error.message : "Unable to save the receipt",
      }));
    } finally {
      setSaving(false);
    }
  }

  async function suggestConversion() {
    if (!numericOriginalAmount || numericOriginalAmount <= 0) {
      setRateError("Enter the original amount first.");
      return;
    }
    if (originalCurrency === group.currency) {
      setAmount(String(numericOriginalAmount));
      setSuggestedBaseAmount(numericOriginalAmount);
      setSuggestedRateDate(date);
      setRateError("");
      return;
    }
    setRateLoading(true);
    setRateError("");
    try {
      const suggestion = await fetchExchangeRate(originalCurrency, group.currency, date);
      const converted = Math.round(numericOriginalAmount * suggestion.rate * 100) / 100;
      setAmount(converted.toFixed(2));
      setSuggestedBaseAmount(converted);
      setSuggestedRateDate(suggestion.date);
    } catch (error) {
      setRateError(error instanceof Error ? error.message : "Unable to get a suggested rate.");
    } finally {
      setRateLoading(false);
    }
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

            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Notes <span className="text-xs">(optional)</span>
              </label>
              <textarea
                rows={3}
                maxLength={500}
                placeholder="Add details, context, or anything the group should know"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="w-full resize-none rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{notes.length}/500</p>
            </div>

            <div className="rounded-xl border border-border bg-muted/20">
              <button
                type="button"
                onClick={() => {
                  setForeignCurrencyOpen((value) => !value);
                  setRateError("");
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-sm font-medium text-foreground">Paid in another currency?</span>
                  <span className="block text-[11px] text-muted-foreground">Optional · keep the original amount for reference</span>
                </span>
                <ChevronDown size={16} className={`text-muted-foreground transition-transform ${foreignCurrencyOpen ? "rotate-180" : ""}`} />
              </button>
              {foreignCurrencyOpen && (
                <div className="space-y-3 border-t border-border p-3">
                  <div className="grid grid-cols-[1fr_1.45fr] gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={originalAmount}
                      onChange={(event) => {
                        setOriginalAmount(event.target.value);
                        setSuggestedBaseAmount(null);
                      }}
                      placeholder="Original amount"
                      className="min-w-0 rounded-xl border border-border bg-input-background px-3 py-3 text-sm outline-none focus:border-primary"
                    />
                    <select
                      value={originalCurrency}
                      onChange={(event) => {
                        setOriginalCurrency(event.target.value);
                        setSuggestedBaseAmount(null);
                      }}
                      className="min-w-0 rounded-xl border border-border bg-input-background px-3 py-3 text-sm outline-none focus:border-primary"
                    >
                      {SUPPORTED_CURRENCIES.filter(([code]) => code !== group.currency).map(([code, name]) => (
                        <option key={code} value={code}>{code} — {name}</option>
                      ))}
                    </select>
                  </div>
                  {errors.originalAmount && (
                    <p className="text-xs text-destructive">{errors.originalAmount}</p>
                  )}
                  <button
                    type="button"
                    disabled={rateLoading}
                    onClick={() => void suggestConversion()}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-primary disabled:opacity-50"
                  >
                    {rateLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Suggest conversion to {group.currency}
                  </button>
                  {rateError && <p className="text-xs text-destructive">{rateError} You can still enter the converted amount manually.</p>}
                  {suggestedBaseAmount !== null && (
                    <p className="text-xs text-muted-foreground">
                      Suggested {formatCurrency(suggestedBaseAmount, group.currency)} using the {suggestedRateDate} reference rate. Edit it below to match the actual cash or card charge.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="w-full min-w-0 overflow-hidden">
              <label className="block text-sm text-muted-foreground mb-1.5">
                {foreignCurrencyOpen ? `Amount used for group (${group.currency})` : `Amount (${group.currency})`}
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
              {foreignCurrencyOpen && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  This editable amount is what splits, balances, and settlements will use. It will not change when exchange rates change later.
                </p>
              )}
            </div>

            {/* Date */}
            <div className="w-full min-w-0 overflow-hidden">
              <label className="block text-sm text-muted-foreground mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full min-w-0 max-w-full box-border px-4 py-3 rounded-xl bg-input-background border border-border text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Category
              </label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as Category)}
                  className="w-full appearance-none rounded-xl border border-border bg-input-background py-3 pl-4 pr-10 text-sm capitalize text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_ICONS[cat]} {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
              {category === "other" && (
                <div className="mt-3">
                  <input
                    type="text"
                    maxLength={50}
                    autoFocus
                    value={categoryDetail}
                    onChange={(event) => {
                      setCategoryDetail(event.target.value);
                      setErrors((current) => ({ ...current, categoryDetail: "" }));
                    }}
                    placeholder="Specify category, e.g. Tour guide tip"
                    className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  {errors.categoryDetail && (
                    <p className="mt-1 text-xs text-destructive">{errors.categoryDetail}</p>
                  )}
                </div>
              )}
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
                      {availableMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {displayMemberName(member.id, member.name)}
                          {member.removedAt ? " (former member)" : ""}
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
                    uid={currentMember?.uid ?? currentUser.id}
                    photoVersion={currentMember?.profileImageVersion ?? currentUser.profileImageVersion}
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
                {availableMembers.map((m) => (
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
                      <UserAvatar name={m.name} color={m.color} seed={m.avatarSeed} uid={m.uid} photoVersion={m.profileImageVersion} className="w-8 h-8 rounded-full text-sm" />
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
                {availableMembers.map((m) => (
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
                    <UserAvatar name={m.name} color={m.color} seed={m.avatarSeed} uid={m.uid} photoVersion={m.profileImageVersion} className="w-8 h-8 rounded-full text-sm shrink-0" />
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

            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Expense receipts <span className="text-xs">(optional)</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 cursor-pointer">
                <ImagePlus size={18} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Add receipt images
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Show the group what was charged
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    setReceiptFiles((current) => [...current, ...files].slice(0, 5));
                    setErrors((current) => ({ ...current, receipts: "" }));
                  }}
                />
              </label>
              <ImagePasteControl
                enabled={open}
                disabled={saving || receiptFiles.length >= 5}
                label="Paste receipt"
                onImages={(files) => {
                  setReceiptFiles((current) => [...current, ...files].slice(0, 5));
                  setErrors((current) => ({ ...current, receipts: "" }));
                }}
                onError={(message) =>
                  setErrors((current) => ({ ...current, receipts: message }))
                }
              />
              {(editExpense?.receipts?.length ?? 0) > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {editExpense!.receipts!.length} saved receipt
                  {editExpense!.receipts!.length === 1 ? "" : "s"} will be kept.
                </p>
              )}
              {receiptFiles.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {receiptFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.lastModified}-${index}`}
                      className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2"
                    >
                      <span className="flex-1 truncate text-xs text-foreground">
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setReceiptFiles((current) =>
                            current.filter((_, candidate) => candidate !== index),
                          )
                        }
                        className="p-1 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {errors.receipts && (
                <p className="text-destructive text-xs mt-1.5">
                  {errors.receipts}
                </p>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full py-4 rounded-2xl text-primary-foreground font-semibold text-base transition-all active:scale-95"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {saving
                ? "Saving…"
                : editExpense
                  ? "Save Changes"
                  : "Add Expense"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
