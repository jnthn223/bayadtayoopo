import {
  ArrowLeft,
  BarChart2,
  Edit2,
  FileSpreadsheet,
  HelpCircle,
  MessageCircle,
  MoreVertical,
  QrCode,
  Receipt,
  Trash2,
  Users,
  Archive,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { CurrentUser, Group } from "./types";
import type { GroupTourTarget } from "./GroupTour";
import { formatCurrency } from "./utils";
import { GroupAvatar } from "./GroupAvatar";
import { UserAvatar } from "./UserAvatar";

export type GroupTab = "expenses" | "balances" | "settle" | "chat";

interface Props {
  group: Group;
  currentUser: CurrentUser;
  total: number;
  unsettledTotal?: number;
  tab: GroupTab;
  tourTarget: GroupTourTarget | null;
  unreadChatCount: number;
  outstandingMemberCount: number;
  memberRequestCount: number;
  isAdmin: boolean;
  isOwner: boolean;
  onBack: () => void;
  onTabChange: (tab: GroupTab) => void;
  onManageMembers: () => void;
  onShare: () => void;
  onCsvTools: () => void;
  onShowGuide: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  archiveDisabledReason?: string;
  onArchiveBlocked?: (reason: string) => void;
  includeArchivedGroups?: boolean;
  onIncludeArchivedGroupsChange?: (include: boolean) => void;
  isArchived?: boolean;
  directExpenseSummary?: {
    direct: Array<{ currency: string; amount: number }>;
    shared: Array<{ currency: string; amount: number }>;
    all: Array<{ currency: string; amount: number }>;
  };
  directUnsettledExpenseSummary?: {
    direct: Array<{ currency: string; amount: number }>;
    shared: Array<{ currency: string; amount: number }>;
    all: Array<{ currency: string; amount: number }>;
  };
  totalView?: "unsettled" | "all";
  onTotalViewChange?: (view: "unsettled" | "all") => void;
}

const tabs = [
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "balances", label: "Balances", icon: BarChart2 },
  { id: "settle", label: "Settle Up", icon: Users },
  { id: "chat", label: "Chat", icon: MessageCircle },
] as const;

export function GroupHeader({
  group,
  currentUser,
  total,
  unsettledTotal = total,
  tab,
  tourTarget,
  unreadChatCount,
  outstandingMemberCount,
  memberRequestCount,
  isAdmin,
  isOwner,
  onBack,
  onTabChange,
  onManageMembers,
  onShare,
  onCsvTools,
  onShowGuide,
  onEdit,
  onDelete,
  onArchive,
  archiveDisabledReason,
  onArchiveBlocked,
  includeArchivedGroups = false,
  onIncludeArchivedGroupsChange,
  isArchived = false,
  directExpenseSummary,
  directUnsettledExpenseSummary,
  totalView: controlledTotalView,
  onTotalViewChange,
}: Props) {
  const [localTotalView, setLocalTotalView] = useState<"unsettled" | "all">("unsettled");
  const totalView = controlledTotalView ?? localTotalView;
  const setTotalView = (view: "unsettled" | "all") => {
    setLocalTotalView(view);
    onTotalViewChange?.(view);
  };
  const isDirect = group.kind === "direct";
  const directPerson = isDirect
    ? group.members.find(
        (member) => member.uid !== currentUser.id && member.id !== currentUser.id,
      )
    : undefined;
  const visibleDirectSummary = totalView === "unsettled"
    ? (directUnsettledExpenseSummary ?? directExpenseSummary)
    : directExpenseSummary;
  return (
    <>
      <div className="bg-card border-b border-border px-4 pt-12 pb-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={20} className="text-foreground" />
          </button>

          <div className="flex items-center gap-1">
            {isDirect && directPerson && !directPerson.uid && <HeaderAction
              active={false}
              label={`Invite ${directPerson.name} to claim`}
              onClick={onShare}
            >
              <QrCode size={19} />
            </HeaderAction>}
            {!isDirect && <HeaderAction
              active={tourTarget === "members"}
              label={isAdmin ? "Manage members" : "View members"}
              onClick={onManageMembers}
              badge={isAdmin ? memberRequestCount : 0}
            >
              <Users size={19} />
            </HeaderAction>}
            {!isDirect && <HeaderAction
              active={tourTarget === "share"}
              label="Share QR code"
              onClick={onShare}
            >
              <QrCode size={19} />
            </HeaderAction>}

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Group menu">
                  <MoreVertical size={19} className="text-foreground" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-[170px] bg-card border border-border rounded-2xl shadow-xl overflow-hidden py-1"
                >
                  <MenuItem icon={FileSpreadsheet} onSelect={onCsvTools}>
                    CSV Tools
                  </MenuItem>
                  {!isDirect && <MenuItem icon={HelpCircle} onSelect={onShowGuide}>
                    Show group guide
                  </MenuItem>}
                  {isDirect && onIncludeArchivedGroupsChange && (
                    <MenuItem icon={includeArchivedGroups ? EyeOff : Eye} onSelect={() => onIncludeArchivedGroupsChange(!includeArchivedGroups)}>
                      {includeArchivedGroups ? "Hide archived groups" : "Include archived groups"}
                    </MenuItem>
                  )}
                  <MenuItem icon={isArchived ? RotateCcw : Archive} onSelect={() => {
                    if (archiveDisabledReason) onArchiveBlocked?.(archiveDisabledReason);
                    else onArchive();
                  }}>
                    {isArchived
                      ? (isDirect ? "Unarchive person" : "Unarchive group")
                      : (isDirect ? "Archive person" : "Archive group")}
                  </MenuItem>
                  {!isDirect && isAdmin && (
                    <>
                      <MenuItem icon={Edit2} onSelect={onEdit}>
                        Edit Details
                      </MenuItem>
                      {isOwner && (
                        <MenuItem icon={Trash2} onSelect={onDelete} destructive>
                          Delete Group
                        </MenuItem>
                      )}
                    </>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {directPerson ? (
            <UserAvatar
              name={directPerson.name}
              color={directPerson.color}
              seed={directPerson.avatarSeed}
              uid={directPerson.uid}
              photoVersion={directPerson.profileImageVersion}
              className="w-12 h-12 rounded-full shrink-0"
            />
          ) : (
            <GroupAvatar
              name={group.name}
              seed={group.avatarSeed}
              groupId={group.id}
              photoVersion={group.groupImageVersion}
              className="w-12 h-12 rounded-2xl shrink-0"
            />
          )}
          <div className="min-w-0">
            <h1 className="mb-1 flex items-center gap-2 text-foreground">
              <span className="truncate">{directPerson?.name ?? group.name}</span>
              {isArchived && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Archived</span>}
            </h1>
            {isDirect ? (
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <TotalViewToggle value={totalView} onChange={setTotalView} />
                <div className="space-y-0.5">
                  <p>Direct <strong className="font-semibold text-foreground">{(visibleDirectSummary?.direct ?? [{ currency: group.currency, amount: totalView === "unsettled" ? unsettledTotal : total }]).map((item) => formatCurrency(item.amount, item.currency)).join(" / ")}</strong></p>
                  <p>Across groups <strong className="font-semibold text-foreground">{visibleDirectSummary?.shared.length ? visibleDirectSummary.shared.map((item) => formatCurrency(item.amount, item.currency)).join(" / ") : formatCurrency(0, group.currency)}</strong></p>
                  <p className="text-primary">Total <strong className="font-semibold">{visibleDirectSummary?.all.map((item) => formatCurrency(item.amount, item.currency)).join(" / ")}</strong></p>
                </div>
              </div>
            ) : <div className="flex items-center gap-3 flex-wrap">
              <div className="flex -space-x-2">
                {group.members.slice(0, 5).map((member) => (
                  <UserAvatar
                    key={member.id}
                    name={member.name}
                    color={member.color}
                    seed={member.avatarSeed}
                    uid={member.uid}
                    photoVersion={member.profileImageVersion}
                    className={`w-7 h-7 rounded-full text-xs border-2 ${
                      member.uid || member.id === currentUser.id
                        ? "border-card"
                        : "border-amber-400"
                    }`}
                    title={`${member.name}${
                      member.uid || member.id === currentUser.id
                        ? ""
                        : " (pending)"
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">{group.members.length} members</span>
              <TotalViewToggle value={totalView} onChange={setTotalView} />
              <span className="text-sm font-medium text-foreground">{formatCurrency(totalView === "unsettled" ? unsettledTotal : total, group.currency)}</span>
            </div>}
          </div>
        </div>
      </div>

      <div className="flex border-b border-border bg-card">
        {tabs.map(({ id, label, icon: Icon }) => {
          const badge =
            id === "settle"
              ? outstandingMemberCount
              : id === "chat"
                ? unreadChatCount
                : 0;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-label={`${label}${badge ? `, ${badge} notifications` : ""}`}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium border-b-2 transition-all ${
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              } ${
                id === "settle" && tourTarget === "settle"
                  ? "relative z-[60] rounded-xl bg-card text-primary ring-4 ring-primary/35 shadow-xl"
                  : ""
              }`}
            >
              <span className="relative">
                <Icon size={16} />
                {badge > 0 && (
                  <span className="absolute -right-3 -top-2 min-w-4 h-4 px-1 rounded-full bg-destructive text-white text-[9px] leading-4 text-center font-bold shadow-sm">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function TotalViewToggle({ value, onChange }: { value: "unsettled" | "all"; onChange: (value: "unsettled" | "all") => void }) {
  return (
    <span className="inline-flex rounded-lg bg-muted p-0.5">
      <button type="button" onClick={() => onChange("unsettled")} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${value === "unsettled" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>Unsettled</button>
      <button type="button" onClick={() => onChange("all")} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${value === "all" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>All tracked</button>
    </span>
  );
}

function HeaderAction({
  active,
  label,
  onClick,
  children,
  badge = 0,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-full hover:bg-muted transition-all ${
        active
          ? "relative z-[60] bg-card text-primary ring-4 ring-primary/35 shadow-xl scale-110"
          : "text-foreground"
      }`}
      title={label}
      aria-label={label}
    >
      <span className="relative block">
        {children}
        {badge > 0 && (
          <span className="absolute -right-2.5 -top-2.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[9px] font-bold leading-4 text-white shadow-sm">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
    </button>
  );
}

function MenuItem({
  icon: Icon,
  onSelect,
  destructive = false,
  children,
}: {
  icon: typeof HelpCircle;
  onSelect: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex items-center gap-3 px-4 py-3 text-sm cursor-pointer outline-none transition-colors ${
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-muted"
      }`}
    >
      <Icon size={15} />
      {children}
    </DropdownMenu.Item>
  );
}
