import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  Coffee,
  ExternalLink,
  MessageCircle,
  MoreVertical,
  Pin,
  Plus,
  Receipt,
  Search,
  Trash2,
  Users,
  Clock3,
  UserRoundPlus,
} from "lucide-react";
import type { AppNotification, Group, CurrentUser } from "./types";
import { BrandWordmark } from "./Brand";
import { UserAvatar } from "./UserAvatar";
import { GroupAvatar } from "./GroupAvatar";
import {
  formatCurrency,
  getMemberById,
  getTotalExpenses,
  getUnsettledPaymentSummary,
} from "./utils";
import { CreateGroupModal } from "./CreateGroupModal";
import { NotificationInbox } from "./NotificationInbox";
import { DirectExpenseModal } from "./DirectExpenseModal";
import { getDirectContact } from "./directExpenses";

interface Props {
  groups: Group[];
  user: CurrentUser;
  onSelectGroup: (group: Group) => void;
  onCreateGroup: (group: Group) => void;
  onAddDirectExpense: (group: Group, expense: import("./types").Expense, receiptFiles: File[]) => Promise<void>;
  onCreateDirectTracker: (group: Group) => Promise<void>;
  onRespondDirectRequest: (
    group: Group,
    status: "active" | "declined" | "withdrawn",
  ) => Promise<void>;
  onOpenProfile: () => void;
  notifications: AppNotification[];
  notificationReadAt?: string;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllNotificationsRead: () => void;
}

export function HomeScreen({
  groups,
  user,
  onSelectGroup,
  onCreateGroup,
  onAddDirectExpense,
  onCreateDirectTracker,
  onRespondDirectRequest,
  onOpenProfile,
  notifications,
  notificationReadAt,
  onOpenNotification,
  onMarkAllNotificationsRead,
}: Props) {
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const [createOpen, setCreateOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [directExpenseOpen, setDirectExpenseOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(() => localStorage.getItem(`bayadtayoopo:home:people-open:${user.id}`) !== "false");
  const [groupsOpen, setGroupsOpen] = useState(() => localStorage.getItem(`bayadtayoopo:home:groups-open:${user.id}`) !== "false");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`bayadtayoopo:home:pins:${user.id}`) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const sortPinned = (items: Group[]) => [...items].sort((a, b) => Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)));
  const ordinaryGroups = sortPinned(groups.filter(
    (group) => group.kind !== "direct" && group.name.toLowerCase().includes(normalizedSearch),
  ));
  const directGroups = sortPinned(groups.filter(
    (group) => group.kind === "direct" && !["declined", "withdrawn"].includes(group.directStatus ?? ""),
  ).filter((group) => {
    const person = getDirectContact(group, user.id);
    return !normalizedSearch || person?.name.toLowerCase().includes(normalizedSearch);
  }));

  function setSectionOpen(section: "people" | "groups", open: boolean) {
    if (section === "people") setPeopleOpen(open);
    else setGroupsOpen(open);
    localStorage.setItem(`bayadtayoopo:home:${section}-open:${user.id}`, String(open));
  }

  function togglePin(id: string) {
    setPinnedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(`bayadtayoopo:home:pins:${user.id}`, JSON.stringify([...next]));
      return next;
    });
  }
  const activity = groups
    .filter((group) => group.kind !== "direct" || group.directStatus === "active")
    .flatMap((group) => {
      const expenseItems = group.expenses
        .filter((expense) => (expense.createdBy ?? expense.paidBy) !== user.id)
        .map((expense) => {
          const creator = getMemberById(
            group,
            expense.createdBy ?? expense.paidBy,
          );
          return {
            id: `${group.id}-expense-${expense.id}`,
            group,
            at: `${expense.date}T12:00:00.000Z`,
            icon: Receipt,
            title: expense.description,
            detail: `${creator?.name ?? "Someone"} added ${formatCurrency(expense.amount, group.currency)}`,
          };
        });

      const deletedItems = (group.deletedExpenses ?? [])
        .filter((expense) => expense.deletedBy !== user.id)
        .map((expense) => {
          const member = getMemberById(group, expense.deletedBy);
          return {
            id: `${group.id}-deleted-${expense.expenseId}-${expense.deletedAt}`,
            group,
            at: expense.deletedAt,
            icon: Trash2,
            title: expense.description,
            detail: `${member?.name ?? "Someone"} deleted an expense`,
          };
        });

      const messageItems = (group.messages ?? [])
        .filter((message) => message.memberId !== user.id)
        .map((message) => {
          const member = getMemberById(group, message.memberId);
          return {
            id: `${group.id}-message-${message.id}`,
            group,
            at: message.createdAt,
            icon: MessageCircle,
            title: message.text,
            detail: `${member?.name ?? "Someone"} sent a message`,
          };
        });

      return [...expenseItems, ...deletedItems, ...messageItems];
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);

  function formatActivityTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 pt-14 pb-6 sm:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground">
              <BrandWordmark className="text-[1.55rem]" />
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Hey {user.name.split(" ")[0]} 👋
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationInbox
              notifications={notifications}
              readAt={notificationReadAt}
              onOpenNotification={onOpenNotification}
              onMarkAllRead={onMarkAllNotificationsRead}
            />
            <button
              onClick={onOpenProfile}
              className="w-10 h-10 rounded-full shadow-sm transition-all active:scale-95 overflow-hidden"
            >
              <UserAvatar
                name={user.name}
                color={user.color}
                seed={user.avatarSeed}
                uid={user.id}
                photoVersion={user.profileImageVersion}
                className="w-full h-full rounded-full"
              />
            </button>
          </div>
        </div>
      </div>

      {/* Groups list */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center mb-5">
              <Users size={36} className="text-accent-foreground" />
            </div>
            <p className="text-foreground font-medium mb-2">Start tracking expenses</p>
            <p className="text-sm text-muted-foreground mb-6">
              Create a group, or start directly with one person by name.
            </p>
            <div className="flex w-full max-w-xs flex-col gap-2">
              <button
                onClick={() => setDirectExpenseOpen(true)}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-primary-foreground font-semibold transition-all active:scale-95"
                style={{ backgroundColor: "var(--primary)" }}
              >
                <UserRoundPlus size={18} />
                Add expense with a person
              </button>
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-3 font-semibold text-foreground transition-all active:scale-95"
              >
                <Plus size={18} />
                Create a group
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <label className="relative block">
              <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search people and groups"
                className="w-full rounded-2xl border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
            <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setSectionOpen("people", !peopleOpen)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={peopleOpen}>
                    <ChevronDown size={17} className={`shrink-0 text-muted-foreground transition-transform ${peopleOpen ? "" : "-rotate-90"}`} />
                    <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      People
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                        Beta
                      </span>
                    </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectExpenseOpen(true)}
                    aria-label="Add expense with a person"
                    title="Add expense with a person"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary active:scale-95 transition-all"
                  >
                    <UserRoundPlus size={17} />
                  </button>
                </div>
                {peopleOpen && (directGroups.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {directGroups.map((group) => {
                      const person = getDirectContact(group, user.id);
                      if (!person) return null;
                      const pending = group.directStatus === "pending";
                      const requestedByMe = group.directRequestedBy === user.id;
                      return (
                        <div
                          key={group.id}
                          className="w-full rounded-2xl border border-border bg-card p-3"
                        >
                          <div className="flex items-center gap-2">
                          <button type="button" onClick={() => onSelectGroup(group)} className="min-w-0 flex flex-1 items-center gap-3 text-left">
                            <UserAvatar name={person.name} color={person.color} seed={person.avatarSeed} uid={person.uid} photoVersion={person.profileImageVersion} className="w-10 h-10 rounded-full" />
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                                <span className="truncate">{person.name}</span>
                                {pinnedIds.has(group.id) && <Pin size={12} fill="currentColor" className="shrink-0 text-primary" aria-label="Pinned" />}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {pending
                                  ? requestedByMe ? "Waiting for approval" : "Wants to start a direct expense history"
                                  : `${group.expenses.length} direct ${group.expenses.length === 1 ? "expense" : "expenses"}`}
                              </p>
                            </div>
                          </button>
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button type="button" aria-label={`Options for ${person.name}`} className="rounded-full p-2 text-muted-foreground hover:bg-muted">
                                <MoreVertical size={17} />
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[150px] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl">
                                <DropdownMenu.Item onSelect={() => togglePin(group.id)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground outline-none hover:bg-muted focus:bg-muted">
                                  <Pin size={15} fill={pinnedIds.has(group.id) ? "currentColor" : "none"} />
                                  {pinnedIds.has(group.id) ? "Unpin person" : "Pin person"}
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                          </div>
                          {pending && (
                            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
                              {requestedByMe ? (
                                <button type="button" onClick={() => void onRespondDirectRequest(group, "withdrawn")} className="col-span-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
                                  Withdraw request
                                </button>
                              ) : (
                                <>
                                  <button type="button" onClick={() => void onRespondDirectRequest(group, "declined")} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">Decline</button>
                                  <button type="button" onClick={() => void onRespondDirectRequest(group, "active")} className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Accept</button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <button type="button" onClick={() => setDirectExpenseOpen(true)} className="w-full rounded-2xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted-foreground">
                    {normalizedSearch ? "No direct histories match your search." : "Add anyone by name—no account or approval needed yet."}
                  </button>
                ))}
            </section>

            <section className="space-y-3">
              <button type="button" onClick={() => setSectionOpen("groups", !groupsOpen)} className="flex w-full items-center gap-2 text-left" aria-expanded={groupsOpen}>
                <ChevronDown size={17} className={`text-muted-foreground transition-transform ${groupsOpen ? "" : "-rotate-90"}`} />
                <p className="text-sm font-medium text-muted-foreground">Your Groups ({ordinaryGroups.length})</p>
              </button>
            {groupsOpen && ordinaryGroups.length > 0 && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ordinaryGroups.map((group) => {
                const total = getTotalExpenses(group);
                const unsettled = getUnsettledPaymentSummary(group, user.id);

                return (
                  <div key={group.id} className={`flex items-center gap-1 rounded-2xl border bg-card pr-2 transition-all hover:border-primary/40 hover:shadow-sm ${pinnedIds.has(group.id) ? "border-primary/30 bg-primary/[0.025]" : "border-border"}`}>
                  <button
                    key={group.id}
                    onClick={() => onSelectGroup(group)}
                    className="min-w-0 flex flex-1 items-center gap-4 rounded-2xl p-4 text-left active:scale-[0.99]"
                  >
                    <GroupAvatar
                      name={group.name}
                      seed={group.avatarSeed}
                      groupId={group.id}
                      photoVersion={group.groupImageVersion}
                      className="w-12 h-12 rounded-2xl text-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                        <span className="truncate">{group.name}</span>
                        {pinnedIds.has(group.id) && <Pin size={12} fill="currentColor" className="shrink-0 text-primary" aria-label="Pinned" />}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {group.members.length} members ·{" "}
                          {group.expenses.length} expenses
                        </span>
                      </div>
                      {unsettled.count > 0 && (
                        <div
                          className={`inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded-full text-[11px] font-semibold ${
                            unsettled.rejectedCount > 0
                              ? "bg-destructive/10 text-destructive"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          <Clock3 size={11} />
                          {unsettled.count} unsettled payment
                          {unsettled.count === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(total, group.currency)}
                      </p>
                    </div>
                  </button>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button type="button" aria-label={`Options for ${group.name}`} className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted">
                        <MoreVertical size={17} />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[150px] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl">
                        <DropdownMenu.Item onSelect={() => togglePin(group.id)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground outline-none hover:bg-muted focus:bg-muted">
                          <Pin size={15} fill={pinnedIds.has(group.id) ? "currentColor" : "none"} />
                          {pinnedIds.has(group.id) ? "Unpin group" : "Pin group"}
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                  </div>
                );
              })}
            </div>}
            {groupsOpen && ordinaryGroups.length === 0 && normalizedSearch && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted-foreground">No groups match your search.</div>
            )}
            </section>

            {activity.length > 0 && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setActivityOpen((open) => !open)}
                  aria-expanded={activityOpen}
                  className="w-full flex items-center justify-between rounded-xl px-1 py-1 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    Recent Activity
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-foreground text-[10px] leading-5 text-center font-semibold">
                      {activity.length}
                    </span>
                  </span>
                  <ChevronDown
                    size={17}
                    className={`text-muted-foreground transition-transform ${
                      activityOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {activityOpen && (
                  <div className="space-y-2">
                    {activity.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => onSelectGroup(item.group)}
                          className="w-full bg-card rounded-2xl border border-border p-4 flex items-center gap-3 text-left hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.99]"
                        >
                          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                            <Icon size={18} className="text-accent-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {item.group.name}
                              </p>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {formatActivityTime(item.at)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {item.detail}
                            </p>
                            <p className="text-xs text-foreground mt-1 truncate">
                              {item.title}
                            </p>
                          </div>
                          <ChevronRight
                            size={16}
                            className="text-muted-foreground shrink-0"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="bg-card rounded-2xl border border-border p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shrink-0">
                  <Coffee size={15} className="text-accent-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Support BayadTayoOpo
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Enjoying the app? Optional support helps keep it running and improving.
                  </p>
                </div>
              </div>
              {kofiUrl && (
                <a
                  href={kofiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-all hover:bg-accent/80 active:scale-[0.98]"
                >
                  Support on Ko-fi
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar with create button */}
      {groups.length > 0 && (
        <div className="p-4 border-t border-border bg-card">
          <button
            onClick={() => setCreateOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-primary-foreground font-semibold transition-all active:scale-95"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <Plus size={20} />
            New Group
          </button>
        </div>
      )}

      <CreateGroupModal
        open={createOpen}
        currentUser={user}
        onClose={() => setCreateOpen(false)}
        onCreate={onCreateGroup}
      />
      <DirectExpenseModal
        open={directExpenseOpen}
        groups={groups}
        user={user}
        onClose={() => setDirectExpenseOpen(false)}
        onAdd={onAddDirectExpense}
        onCreateTracker={onCreateDirectTracker}
      />
    </div>
  );
}
