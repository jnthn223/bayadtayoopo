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
} from "lucide-react";
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
  tab: GroupTab;
  tourTarget: GroupTourTarget | null;
  unreadChatCount: number;
  outstandingMemberCount: number;
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
  tab,
  tourTarget,
  unreadChatCount,
  outstandingMemberCount,
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
}: Props) {
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
            <HeaderAction
              active={tourTarget === "members"}
              label="Manage members"
              onClick={onManageMembers}
            >
              <Users size={19} />
            </HeaderAction>
            <HeaderAction
              active={tourTarget === "share"}
              label="Share QR code"
              onClick={onShare}
            >
              <QrCode size={19} />
            </HeaderAction>

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
                  <MenuItem icon={HelpCircle} onSelect={onShowGuide}>
                    Show group guide
                  </MenuItem>
                  {isAdmin && (
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
          <GroupAvatar
            name={group.name}
            seed={group.avatarSeed}
            className="w-12 h-12 rounded-2xl shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-foreground mb-1 truncate">{group.name}</h1>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex -space-x-2">
                {group.members.slice(0, 5).map((member) => (
                  <UserAvatar
                    key={member.id}
                    name={member.name}
                    color={member.color}
                    seed={member.avatarSeed}
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
              <span className="text-sm text-muted-foreground">
                {group.members.length} members
              </span>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm font-medium text-foreground">
                {formatCurrency(total, group.currency)} total
              </span>
            </div>
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

function HeaderAction({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
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
      {children}
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
