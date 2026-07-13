import { useState } from "react";
import {
  ChevronRight,
  MessageCircle,
  Plus,
  Receipt,
  Trash2,
  Users,
  Clock3,
} from "lucide-react";
import type { Group, CurrentUser } from "./types";
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

interface Props {
  groups: Group[];
  user: CurrentUser;
  onSelectGroup: (group: Group) => void;
  onCreateGroup: (group: Group) => void;
  onOpenProfile: () => void;
}

export function HomeScreen({
  groups,
  user,
  onSelectGroup,
  onCreateGroup,
  onOpenProfile,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const activity = groups
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
      <div className="bg-card border-b border-border px-5 pt-14 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground">
              <BrandWordmark className="text-[1.55rem]" />
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Hey {user.name.split(" ")[0]} 👋
            </p>
          </div>
          <button
            onClick={onOpenProfile}
            className="w-10 h-10 rounded-full shadow-sm transition-all active:scale-95 overflow-hidden"
          >
            <UserAvatar
              name={user.name}
              color={user.color}
              seed={user.avatarSeed}
              className="w-full h-full rounded-full"
            />
          </button>
        </div>
      </div>

      {/* Groups list */}
      <div className="flex-1 overflow-y-auto p-4">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center mb-5">
              <Users size={36} className="text-accent-foreground" />
            </div>
            <p className="text-foreground font-medium mb-2">No groups yet</p>
            <p className="text-sm text-muted-foreground mb-6">
              Create a group to start splitting expenses with friends
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl text-primary-foreground font-semibold transition-all active:scale-95"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <Plus size={18} />
              Create Group
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">
                Your Groups ({groups.length})
              </p>
            </div>
            <div className="space-y-3">
              {groups.map((group) => {
                const total = getTotalExpenses(group);
                const unsettled = getUnsettledPaymentSummary(group, user.id);

                return (
                  <button
                    key={group.id}
                    onClick={() => onSelectGroup(group)}
                    className="w-full bg-card rounded-2xl border border-border p-4 flex items-center gap-4 text-left hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.99]"
                  >
                    <GroupAvatar
                      name={group.name}
                      seed={group.avatarSeed}
                      className="w-12 h-12 rounded-2xl text-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {group.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex -space-x-1.5">
                          {group.members.slice(0, 4).map((m) => (
                            <UserAvatar
                              key={m.id}
                              name={m.name}
                              color={m.color}
                              seed={m.avatarSeed}
                              className="w-5 h-5 rounded-full border border-card text-[9px]"
                            />
                          ))}
                        </div>
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
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(total, group.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        total
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

            {activity.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">
                  Recent Activity
                </p>
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
              </div>
            )}
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
    </div>
  );
}
