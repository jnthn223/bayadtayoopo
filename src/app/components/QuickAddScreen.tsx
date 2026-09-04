import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ReceiptText,
  Users,
  X,
} from "lucide-react";
import type { CurrentUser, Expense, Group } from "./types";
import { BrandMark } from "./Brand";
import { GroupAvatar } from "./GroupAvatar";
import { UserAvatar } from "./UserAvatar";
import {
  allocateCustomShares,
  formatCurrency,
  getCurrencySymbol,
  isGroupAdmin,
} from "./utils";
import {
  buildQuickExpense,
  quickAddGroupsForUser,
  quickAddLastGroupKey,
  resolveQuickAddGroupId,
} from "./quickAddExpense";

interface Props {
  groups: Group[];
  currentUser: CurrentUser;
  loading: boolean;
  onAddExpense: (groupId: string, expense: Expense) => Promise<void>;
  onClose: () => void;
}

export function QuickAddScreen({
  groups,
  currentUser,
  loading,
  onAddExpense,
  onClose,
}: Props) {
  const availableGroups = useMemo(
    () => quickAddGroupsForUser(groups, currentUser.id),
    [groups, currentUser.id],
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [splitPickerOpen, setSplitPickerOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paidByMemberId, setPaidByMemberId] = useState("");
  const [includedMemberIds, setIncludedMemberIds] = useState<string[]>([]);
  const [splitType, setSplitType] = useState<"equal" | "custom">("equal");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const resolvedInitialGroup = useRef(false);
  const submitting = useRef(false);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const storageKey = quickAddLastGroupKey(currentUser.id);
  const selectedGroup = availableGroups.find(
    (group) => group.id === selectedGroupId,
  );
  const currentMember = selectedGroup?.members.find(
    (member) => member.id === currentUser.id || member.uid === currentUser.id,
  );
  const canChoosePayer = !!selectedGroup && isGroupAdmin(selectedGroup, currentMember);
  const payer = selectedGroup?.members.find(
    (member) => member.id === paidByMemberId,
  );
  const numericAmount = Number(amount.replace(/,/g, ""));
  const customTotal = includedMemberIds.reduce(
    (sum, memberId) => sum + (Number(customAmounts[memberId]) || 0),
    0,
  );

  useEffect(() => {
    if (loading) return;

    setSelectedGroupId((current) => {
      if (
        resolvedInitialGroup.current &&
        current &&
        availableGroups.some((group) => group.id === current)
      ) {
        return current;
      }

      const urlGroupId = new URLSearchParams(window.location.search).get("group");
      const rememberedGroupId = localStorage.getItem(storageKey);
      const next = resolveQuickAddGroupId(
        availableGroups,
        currentUser.id,
        resolvedInitialGroup.current ? null : urlGroupId,
        rememberedGroupId,
      );
      resolvedInitialGroup.current = true;
      return next;
    });
  }, [availableGroups, currentUser.id, loading, storageKey]);

  useEffect(() => {
    if (!selectedGroupId) return;
    localStorage.setItem(storageKey, selectedGroupId);
  }, [selectedGroupId, storageKey]);

  useEffect(() => {
    if (!selectedGroup) return;
    const member = selectedGroup.members.find(
      (candidate) =>
        candidate.id === currentUser.id || candidate.uid === currentUser.id,
    );
    setPaidByMemberId(member?.id ?? "");
    setIncludedMemberIds(selectedGroup.members.map((candidate) => candidate.id));
    setSplitType("equal");
    setCustomAmounts({});
    setSplitPickerOpen(false);
  }, [selectedGroup?.id, currentUser.id]);

  useEffect(() => {
    if (!selectedGroup || loading) return;
    const frame = window.requestAnimationFrame(() => {
      amountInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedGroup?.id, loading]);

  useEffect(
    () => () => {
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
    },
    [],
  );

  function chooseGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setGroupPickerOpen(false);
    setError("");
    setSuccess("");
  }

  function selectSplitType(nextType: "equal" | "custom") {
    setSplitType(nextType);
    if (nextType === "equal") {
      setCustomAmounts({});
      return;
    }
    const allocation = allocateCustomShares(
      includedMemberIds,
      Number.isFinite(numericAmount) ? numericAmount : 0,
      {},
    );
    setCustomAmounts(
      Object.fromEntries(
        includedMemberIds.map((memberId) => [
          memberId,
          numericAmount > 0 ? (allocation[memberId] ?? 0).toFixed(2) : "",
        ]),
      ),
    );
  }

  function toggleIncludedMember(memberId: string) {
    setIncludedMemberIds((current) => {
      const next = current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId];
      if (splitType === "custom") {
        setCustomAmounts((amounts) => {
          const updated = { ...amounts };
          if (next.includes(memberId)) updated[memberId] = "";
          else delete updated[memberId];
          return updated;
        });
      }
      return next;
    });
  }

  async function submitExpense(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !selectedGroup) return;

    let expense: Expense;
    try {
      expense = buildQuickExpense({
        group: selectedGroup,
        currentUser,
        amount: numericAmount,
        description,
        paidByMemberId,
        includedMemberIds,
        splitType,
        customAmounts: Object.fromEntries(
          Object.entries(customAmounts).map(([memberId, value]) => [
            memberId,
            Number(value) || 0,
          ]),
        ),
      });
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Check the expense details.",
      );
      return;
    }

    submitting.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await onAddExpense(selectedGroup.id, expense);
      setAmount("");
      setDescription("");
      setPaidByMemberId(currentMember?.id ?? "");
      setIncludedMemberIds(selectedGroup.members.map((member) => member.id));
      setSplitType("equal");
      setCustomAmounts({});
      setSuccess(
        `Added ${formatCurrency(expense.amount, selectedGroup.currency)} to ${selectedGroup.name}`,
      );
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = window.setTimeout(() => setSuccess(""), 3500);
      window.requestAnimationFrame(() => amountInputRef.current?.focus());
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to add the expense.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div
      className="flex h-full flex-col bg-background"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Back to home"
        >
          <ArrowLeft size={20} />
        </button>
        <BrandMark className="h-9 w-9 rounded-xl" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Quick Expense</h1>
          <p className="text-xs text-muted-foreground">Add it before you forget</p>
        </div>
      </header>

      <form
        id="quick-add-expense-form"
        onSubmit={submitExpense}
        className="flex min-h-0 flex-1 flex-col"
      >
        <main className="flex-1 overflow-y-auto px-5 py-6">
          {loading ? (
            <div className="space-y-5 animate-pulse" aria-label="Loading groups">
              <div className="h-14 rounded-2xl bg-muted" />
              <div className="h-24 rounded-2xl bg-muted" />
              <div className="h-14 rounded-2xl bg-muted" />
            </div>
          ) : availableGroups.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-primary">
                <ReceiptText size={28} />
              </span>
              <h2 className="font-semibold text-foreground">No available groups</h2>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                Create or join a group in the main app before using Quick Expense.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                Go to the app
              </button>
            </div>
          ) : (
            <div className="space-y-7">
              <div className="sticky top-0 z-10 -mx-1 bg-background px-1 pb-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Add to
                </p>
                <button
                  type="button"
                  onClick={() => setGroupPickerOpen(true)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left shadow-sm transition-all active:scale-[0.99]"
                >
                  {selectedGroup ? (
                    <GroupAvatar
                      name={selectedGroup.name}
                      seed={selectedGroup.avatarSeed}
                      groupId={selectedGroup.id}
                      photoVersion={selectedGroup.groupImageVersion}
                      className="h-9 w-9 shrink-0 rounded-xl"
                    />
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded-xl bg-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                    {selectedGroup?.name ?? "Choose a group"}
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-primary" />
                </button>
              </div>

              <div>
                <label htmlFor="quick-expense-amount" className="mb-2 block text-sm font-medium text-foreground">
                  Amount
                </label>
                <div className="flex items-center rounded-2xl border border-border bg-input-background px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="text-3xl font-semibold text-muted-foreground">
                    {getCurrencySymbol(selectedGroup?.currency ?? "PHP")}
                  </span>
                  <input
                    ref={amountInputRef}
                    id="quick-expense-amount"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setError("");
                      setSuccess("");
                    }}
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="next"
                    placeholder="0.00"
                    className="min-w-0 flex-1 bg-transparent px-3 py-5 text-3xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/45"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="quick-expense-description" className="mb-2 block text-sm font-medium text-foreground">
                  What was it for?
                </label>
                <input
                  id="quick-expense-description"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setError("");
                    setSuccess("");
                  }}
                  autoComplete="off"
                  enterKeyHint="done"
                  placeholder="e.g. Taxi, lunch, tickets"
                  className="w-full rounded-2xl border border-border bg-input-background px-4 py-4 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <button
                type="button"
                onClick={() => setSplitPickerOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left shadow-sm transition-all active:scale-[0.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <Users size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    Paid by {payer?.id === currentMember?.id ? "you" : (payer?.name ?? "a member")}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {splitType === "equal" ? "Split equally" : "Custom split"} with {includedMemberIds.length} member{includedMemberIds.length === 1 ? "" : "s"}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-primary" />
              </button>

              {success && (
                <div role="status" className="flex items-center gap-2 rounded-xl bg-green-100 px-3.5 py-3 text-sm font-medium text-green-700">
                  <Check size={17} /> {success}
                </div>
              )}
              {error && (
                <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
        </main>

        {availableGroups.length > 0 && !loading && (
          <footer
            className="border-t border-border bg-card px-5 pt-4"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <button
              type="submit"
              disabled={saving || !selectedGroup}
              className="w-full rounded-2xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {saving ? "Adding…" : "Add Expense"}
            </button>
          </footer>
        )}
      </form>

      <Dialog.Root open={groupPickerOpen} onOpenChange={setGroupPickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[75vh] max-w-sm overflow-y-auto rounded-t-3xl bg-card shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 pb-3 pt-5">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Choose a group
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  Your choice is remembered for next time.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Close group picker">
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
            <div className="space-y-1 p-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
              {availableGroups.map((group) => {
                const selected = group.id === selectedGroupId;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => chooseGroup(group.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                      selected ? "bg-accent" : "hover:bg-muted"
                    }`}
                  >
                    <GroupAvatar
                      name={group.name}
                      seed={group.avatarSeed}
                      groupId={group.id}
                      photoVersion={group.groupImageVersion}
                      className="h-11 w-11 shrink-0 rounded-xl"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {group.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {group.members.length} member{group.members.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    {selected && <Check size={19} className="shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={splitPickerOpen} onOpenChange={setSplitPickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-h-[88vh] max-w-sm flex-col rounded-t-3xl bg-card shadow-2xl">
            <div className="flex shrink-0 items-start justify-between border-b border-border px-5 pb-3 pt-5">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Payer and split
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  Choose who paid and who shares this expense.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Close payer and split settings">
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {canChoosePayer ? (
                <div>
                  <label htmlFor="quick-expense-payer" className="mb-1.5 block text-sm font-medium text-foreground">
                    Who paid?
                  </label>
                  <select
                    id="quick-expense-payer"
                    value={paidByMemberId}
                    onChange={(event) => setPaidByMemberId(event.target.value)}
                    className="w-full rounded-xl border border-border bg-input-background px-3 py-3 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {selectedGroup?.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.id === currentMember?.id ? "You" : member.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Admins can record an expense on another member’s behalf.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                  Paid by <span className="font-semibold text-foreground">you</span>
                </div>
              )}

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-foreground">How should it be split?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["equal", "custom"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => selectSplitType(option)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                        splitType === option
                          ? "border-primary bg-accent text-primary"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      {option === "equal" ? "Equally" : "Custom amounts"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="sr-only">Members included in this expense</legend>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Split with</p>
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = includedMemberIds.length === selectedGroup?.members.length;
                      const next = allSelected
                        ? []
                        : (selectedGroup?.members.map((member) => member.id) ?? []);
                      setIncludedMemberIds(next);
                      if (splitType === "custom") {
                        setCustomAmounts(
                          Object.fromEntries(next.map((memberId) => [memberId, ""])),
                        );
                      }
                    }}
                    className="text-xs font-semibold text-primary"
                  >
                    {includedMemberIds.length === selectedGroup?.members.length
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {selectedGroup?.members.map((member) => {
                    const checked = includedMemberIds.includes(member.id);
                    return (
                      <div key={member.id} className={`rounded-xl border px-3 py-2.5 ${checked ? "border-primary/25 bg-accent/45" : "border-border"}`}>
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleIncludedMember(member.id)}
                            className="h-4 w-4 accent-primary"
                          />
                          <UserAvatar
                            name={member.name}
                            color={member.color}
                            seed={member.avatarSeed}
                            uid={member.uid}
                            photoVersion={member.profileImageVersion}
                            className="h-8 w-8 shrink-0 rounded-full text-xs"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {member.id === currentMember?.id ? "You" : member.name}
                          </span>
                        </label>
                        {checked && splitType === "custom" && (
                          <div className="ml-7 mt-2 flex items-center rounded-lg border border-border bg-input-background px-2.5 focus-within:border-primary">
                            <span className="text-xs text-muted-foreground">
                              {getCurrencySymbol(selectedGroup.currency)}
                            </span>
                            <input
                              value={customAmounts[member.id] ?? ""}
                              onChange={(event) =>
                                setCustomAmounts((current) => ({
                                  ...current,
                                  [member.id]: event.target.value,
                                }))
                              }
                              inputMode="decimal"
                              placeholder="0.00"
                              aria-label={`${member.name}'s share`}
                              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-foreground outline-none"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>

              {includedMemberIds.length === 0 && (
                <p className="text-xs text-destructive">Choose at least one member.</p>
              )}
              {splitType === "custom" && numericAmount > 0 && (
                <p className={`text-xs ${Math.abs(customTotal - numericAmount) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                  Assigned {formatCurrency(customTotal, selectedGroup?.currency)} of {formatCurrency(numericAmount, selectedGroup?.currency)}
                </p>
              )}
            </div>

            <div className="shrink-0 border-t border-border bg-card px-5 pt-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
              <button
                type="button"
                disabled={includedMemberIds.length === 0}
                onClick={() => setSplitPickerOpen(false)}
                className="w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Done
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
