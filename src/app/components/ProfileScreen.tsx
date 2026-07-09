import { useState } from "react";
import { ArrowLeft, LogOut, Edit2, Check, X, Mail, Shield, ChevronRight } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { CurrentUser } from "./types";
import { MEMBER_COLORS } from "./utils";

interface Props {
  user: CurrentUser;
  groupCount: number;
  expenseCount: number;
  onBack: () => void;
  onLogout: () => void;
  onUpdateUser: (user: CurrentUser) => void;
}

export function ProfileScreen({ user, groupCount, expenseCount, onBack, onLogout, onUpdateUser }: Props) {
  const [editName, setEditName] = useState(false);
  const [nameInput, setNameInput] = useState(user.name);
  const [colorInput, setColorInput] = useState(user.color);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  function handleSaveName() {
    if (!nameInput.trim()) return;
    onUpdateUser({ ...user, name: nameInput.trim(), color: colorInput });
    setEditName(false);
  }

  const MENU_SECTIONS = [
    {
      title: "Account",
      items: [
        {
          icon: Mail,
          label: "Email",
          value: user.email,
          action: null,
        },
        {
          icon: Shield,
          label: "Privacy",
          value: "How BayadTayoOpo uses your data",
          action: () => setPrivacyOpen(true),
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-12 pb-4">
        <div className="flex items-center justify-between mb-5">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <span className="text-base font-semibold text-foreground">Profile</span>
          <div className="w-10" />
        </div>

        {/* Avatar + name */}
        <div className="flex flex-col items-center pb-2">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl text-white font-bold mb-3 shadow-md"
            style={{ backgroundColor: editName ? colorInput : user.color }}
          >
            {user.name[0].toUpperCase()}
          </div>

          {editName ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                autoFocus
                className="px-3 py-2 rounded-xl bg-input-background border border-primary text-foreground text-center outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
              />
              <button onClick={handleSaveName} className="p-2 rounded-full bg-primary text-white">
                <Check size={14} />
              </button>
              <button onClick={() => { setEditName(false); setNameInput(user.name); setColorInput(user.color); }} className="p-2 rounded-full bg-muted">
                <X size={14} className="text-muted-foreground" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditName(true)}
              className="flex items-center gap-2 group"
            >
              <span className="text-lg font-semibold text-foreground">{user.name}</span>
              <Edit2 size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          {editName && (
            <div className="flex gap-2 mt-3">
              {MEMBER_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setColorInput(color)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    colorInput === color ? "border-foreground scale-110" : "border-card"
                  }`}
                  style={{ backgroundColor: color }}
                  title="Profile color"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="bg-card rounded-2xl border border-border p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{groupCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Groups</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{expenseCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Expenses</p>
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto px-4 space-y-4">
        {MENU_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-xs text-muted-foreground font-medium mb-2 px-1">{section.title}</p>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {section.items.map((item, i) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-4 px-4 py-3.5 ${
                    i < section.items.length - 1 ? "border-b border-border" : ""
                  } ${item.action ? "hover:bg-muted cursor-pointer active:bg-muted/80" : ""}`}
                  onClick={item.action ?? undefined}
                >
                  <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shrink-0">
                    <item.icon size={15} className="text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    {item.value && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.value}</p>
                    )}
                  </div>
                  {item.action && <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Logout */}
        <div>
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <button
              onClick={() => setConfirmLogout(true)}
              className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-muted transition-colors"
            >
              <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                <LogOut size={15} className="text-destructive" />
              </div>
              <span className="text-sm font-medium text-destructive">Log Out</span>
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground py-4">BayadTayoOpo v1.0 · Account data synced securely</p>
      </div>

      <Dialog.Root open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 bottom-8 z-50 bg-card rounded-3xl p-6 shadow-2xl">
            <Dialog.Title className="text-base font-semibold text-foreground mb-1">
              Privacy Policy
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground space-y-3">
              <span className="block">
                BayadTayoOpo stores your email, display name, profile color,
                group memberships, expenses, settlements, messages, and activity
                history so your groups can sync across devices and members.
              </span>
              <span className="block">
                Your data is used only to provide app features. We do not sell
                your personal data.
              </span>
              <span className="block">
                You can update your display name and profile color from this
                profile screen. Group data remains available to other members of
                the same group.
              </span>
            </Dialog.Description>
            <button
              onClick={() => setPrivacyOpen(false)}
              className="w-full mt-5 py-3.5 rounded-2xl text-primary-foreground text-sm font-semibold transition-all active:scale-95"
              style={{ backgroundColor: "var(--primary)" }}
            >
              Done
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Confirm logout dialog */}
      <Dialog.Root open={confirmLogout} onOpenChange={setConfirmLogout}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-4 bottom-8 z-50 bg-card rounded-3xl p-6 shadow-2xl">
            <Dialog.Title className="text-base font-semibold text-foreground mb-1">Log out?</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mb-5">
              You'll return to the login screen. Your groups stay saved in your account.
            </Dialog.Description>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 py-3.5 rounded-2xl bg-muted text-foreground text-sm font-medium transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={onLogout}
                className="flex-1 py-3.5 rounded-2xl bg-destructive text-white text-sm font-semibold transition-all active:scale-95"
              >
                Log Out
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
