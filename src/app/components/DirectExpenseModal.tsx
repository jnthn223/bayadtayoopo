import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, Plus, Search, X } from "lucide-react";
import type { CurrentUser, Expense, Group } from "./types";
import { AddExpenseModal } from "./AddExpenseModal";
import {
  createDirectLedger,
  directLedgerId,
  getDirectContacts,
} from "./directExpenses";
import { UserAvatar } from "./UserAvatar";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { generateId, MEMBER_COLORS } from "./utils";

interface Props {
  open: boolean;
  groups: Group[];
  user: CurrentUser;
  onClose: () => void;
  onAdd: (group: Group, expense: Expense, receiptFiles: File[]) => Promise<void>;
  onCreateTracker: (group: Group) => Promise<void>;
}

export function DirectExpenseModal({ open, groups, user, onClose, onAdd, onCreateTracker }: Props) {
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [ledger, setLedger] = useState<Group | null>(null);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [error, setError] = useState("");
  const contacts = useMemo(() => getDirectContacts(groups, user.id), [groups, user.id]);
  const filteredContacts = contacts.filter((contact) =>
    contact.member.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function close() {
    setSearch("");
    setLedger(null);
    setExpenseFormOpen(false);
    setError("");
    onClose();
  }

  function choosePerson(contact: (typeof contacts)[number]) {
    const existing = groups.find(
      (group) =>
        group.kind === "direct" &&
        group.id === (contact.directGroupId ?? directLedgerId(user.id, contact.uid ?? contact.member.id)),
    );
    if (existing?.directStatus === "pending") {
      setError(
        existing.directRequestedBy === user.id
          ? `Your request to ${contact.member.name} is still waiting for approval.`
          : `Respond to ${contact.member.name}’s pending request first.`,
      );
      return;
    }
    setError("");
    setLedger(
      existing && ["draft", "active"].includes(existing.directStatus ?? "")
        ? existing
        : createDirectLedger(user, contact.member, currency),
    );
  }

  function chooseNewPerson() {
    const name = search.trim();
    if (!name) return;
    const id = generateId();
    setError("");
    setLedger(
      createDirectLedger(
        user,
        {
          id,
          name,
          color: MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)],
          avatarSeed: id,
          claimCode: crypto.randomUUID(),
        },
        currency,
      ),
    );
  }

  return (
    <>
      <Dialog.Root open={open && !ledger} onOpenChange={(value) => !value && close()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[86vh] overflow-y-auto rounded-t-3xl bg-card shadow-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(92vw,40rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border md:border-border">
            <div className="sticky top-0 border-b border-border bg-card px-5 pb-3 pt-4 flex items-center justify-between">
              <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Add expense with a person
              </Dialog.Title>
              <button type="button" onClick={close} className="p-2 rounded-full hover:bg-muted">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 pb-10 space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Start privately with anyone by name. They do not need an account or approval yet—you can invite them only when you are ready.
              </p>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search or enter any person's name"
                  className="w-full rounded-xl border border-border bg-input-background py-3 pl-10 pr-4 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">
                  Currency for a new direct history
                </label>
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm outline-none focus:border-primary"
                >
                  {SUPPORTED_CURRENCIES.map(([code, name]) => (
                    <option key={code} value={code}>{code} — {name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                {error && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>
                )}
                {filteredContacts.map((contact) => (
                  <button
                    key={contact.key}
                    type="button"
                    onClick={() => choosePerson(contact)}
                    className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left hover:border-primary/40 active:scale-[0.99] transition-all"
                  >
                    <UserAvatar
                      name={contact.member.name}
                      color={contact.member.color}
                      seed={contact.member.avatarSeed}
                      uid={contact.uid}
                      photoVersion={contact.member.profileImageVersion}
                      className="w-10 h-10 rounded-full shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{contact.member.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {contact.sharedGroupNames.length > 0
                          ? `Together in ${contact.sharedGroupNames.slice(0, 2).join(" and ")}`
                          : "Direct expense history"}
                      </p>
                    </div>
                    <ChevronRight size={17} className="text-muted-foreground" />
                  </button>
                ))}
                {search.trim() && !contacts.some(
                  (contact) => contact.member.name.toLowerCase() === search.trim().toLowerCase(),
                ) && (
                  <button
                    type="button"
                    onClick={chooseNewPerson}
                    className="w-full flex items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-left active:scale-[0.99] transition-all"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Plus size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">Start with “{search.trim()}”</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Add now and invite them when you are ready</span>
                    </span>
                    <ChevronRight size={17} className="text-primary" />
                  </button>
                )}
                {filteredContacts.length === 0 && !search.trim() && (
                  <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    Type a name to start a new direct expense history.
                  </div>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={!!ledger && !expenseFormOpen} onOpenChange={(value) => !value && close()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-card p-5 pb-10 shadow-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(92vw,36rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border md:border-border">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Start with {ledger?.members.find((member) => member.id !== user.id && member.uid !== user.id)?.name ?? "this person"}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  You can create their private person view first to see balances across shared groups, then add a direct expense whenever you need it.
                </Dialog.Description>
              </div>
              <button type="button" onClick={close} className="rounded-full p-2 hover:bg-muted" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="mt-5 space-y-2">
              <button type="button" onClick={() => setExpenseFormOpen(true)} className="w-full rounded-2xl bg-primary py-4 text-sm font-semibold text-primary-foreground active:scale-[0.99]">
                Add an expense now
              </button>
              <button type="button" onClick={() => ledger && void onCreateTracker(ledger)} className="w-full rounded-2xl border border-border bg-card py-4 text-sm font-semibold text-foreground active:scale-[0.99]">
                Create person view only
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">Nothing is shared with them until you send an invite.</p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {ledger && expenseFormOpen && (
        <AddExpenseModal
          group={ledger}
          open
          onClose={close}
          onAdd={(expense, receiptFiles) => onAdd(ledger, expense, receiptFiles)}
          currentUser={user}
          isAdmin
        />
      )}
    </>
  );
}
