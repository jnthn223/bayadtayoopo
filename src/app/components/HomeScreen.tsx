import { useState } from "react";
import { Plus, Users, ChevronRight, Wallet } from "lucide-react";
import type { Group, CurrentUser } from "./types";
import { formatCurrency, getTotalExpenses, computeBalances } from "./utils";
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

  console.log(
    "AUTH",
    `User = ${user.id}, Name = ${user.name}, Color = ${user.color}`,
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 pt-14 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground">SplitWave</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Hey {user.name.split(" ")[0]} 👋
            </p>
          </div>
          <button
            onClick={onOpenProfile}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm transition-all active:scale-95"
            style={{ backgroundColor: user.color }}
          >
            {user.name[0].toUpperCase()}
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
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">
                Your Groups ({groups.length})
              </p>
            </div>
            {groups.map((group) => {
              const total = getTotalExpenses(group);
              const balances = computeBalances(group);
              const myBalance = balances.reduce((sum, b) => sum + b.net, 0);

              return (
                <button
                  key={group.id}
                  onClick={() => onSelectGroup(group)}
                  className="w-full bg-card rounded-2xl border border-border p-4 flex items-center gap-4 text-left hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.99]"
                >
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold text-white shrink-0"
                    style={{
                      backgroundColor:
                        group.members[0]?.color ?? "var(--primary)",
                    }}
                  >
                    {group.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {group.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex -space-x-1.5">
                        {group.members.slice(0, 4).map((m) => (
                          <div
                            key={m.id}
                            className="w-5 h-5 rounded-full border border-card flex items-center justify-center text-[9px] text-white font-bold"
                            style={{ backgroundColor: m.color }}
                          >
                            {m.name[0].toUpperCase()}
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {group.members.length} members · {group.expenses.length}{" "}
                        expenses
                      </span>
                    </div>
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
        onClose={() => setCreateOpen(false)}
        onCreate={onCreateGroup}
      />
    </div>
  );
}
