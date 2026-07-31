import { useState } from "react";
import { ArrowLeft, LogOut, Edit2, Check, X, Mail, Shield, ChevronRight, Shuffle, Coffee, ExternalLink, Bell, Camera, ImageOff } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { CurrentUser, Group, NotificationPreferences } from "./types";
import { MEMBER_COLORS } from "./utils";
import { UserAvatar } from "./UserAvatar";
import { normalizeNotificationPreferences } from "./notifications";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushAvailability,
} from "../../lib/pushNotifications";
import {
  deleteProfileImage,
  saveProfileImage,
} from "../../lib/profileImageService";

interface Props {
  user: CurrentUser;
  groupCount: number;
  expenseCount: number;
  groups: Group[];
  onBack: () => void;
  onLogout: () => void;
  onUpdateUser: (user: CurrentUser) => void;
}

export function ProfileScreen({ user, groupCount, expenseCount, groups, onBack, onLogout, onUpdateUser }: Props) {
  const kofiUrl = import.meta.env.VITE_KOFI_URL?.trim();
  const [editName, setEditName] = useState(false);
  const [nameInput, setNameInput] = useState(user.name);
  const [colorInput, setColorInput] = useState(user.color);
  const [avatarSeedInput, setAvatarSeedInput] = useState(user.avatarSeed);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationDraft, setNotificationDraft] =
    useState<NotificationPreferences>(() =>
      normalizeNotificationPreferences(user.notificationPreferences),
    );
  const [notificationError, setNotificationError] = useState("");
  const [pushSaving, setPushSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState("");

  function handleSaveName() {
    if (!nameInput.trim()) return;
    onUpdateUser({
      ...user,
      name: nameInput.trim(),
      color: colorInput,
      avatarSeed: avatarSeedInput,
    });
    setEditName(false);
  }

  async function handlePhotoSelected(file?: File) {
    if (!file || photoSaving) return;
    setPhotoSaving(true);
    setPhotoError("");
    try {
      const profileImageVersion = await saveProfileImage(user.id, file);
      onUpdateUser({ ...user, profileImageVersion });
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : "Unable to save that photo.",
      );
    } finally {
      setPhotoSaving(false);
    }
  }

  async function handleRemovePhoto() {
    if (photoSaving || !user.profileImageVersion) return;
    setPhotoSaving(true);
    setPhotoError("");
    try {
      await deleteProfileImage(user.id);
      onUpdateUser({ ...user, profileImageVersion: "" });
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : "Unable to remove your photo.",
      );
    } finally {
      setPhotoSaving(false);
    }
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
          icon: Bell,
          label: "Notifications",
          value: user.notificationPreferences?.systemNotifications
            ? "In-app and system alerts"
            : "In-app alerts",
          action: () => {
            setNotificationDraft(
              normalizeNotificationPreferences(user.notificationPreferences),
            );
            setNotificationError("");
            setNotificationsOpen(true);
          },
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
          <button
            type="button"
            onClick={() => setEditName(true)}
            disabled={editName}
            className="rounded-full mb-3 transition-transform active:scale-95 disabled:active:scale-100"
            aria-label="Edit profile and avatar"
          >
            <UserAvatar
              name={editName ? nameInput || user.name : user.name}
              color={editName ? colorInput : user.color}
              seed={editName ? avatarSeedInput : user.avatarSeed}
              uid={user.id}
              photoVersion={user.profileImageVersion}
              className="w-20 h-20 rounded-full shadow-md"
            />
          </button>

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
              <button onClick={() => { setEditName(false); setNameInput(user.name); setColorInput(user.color); setAvatarSeedInput(user.avatarSeed); }} className="p-2 rounded-full bg-muted">
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
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-all active:scale-95">
              <Camera size={14} />
              {photoSaving ? "Saving…" : user.profileImageVersion ? "Replace photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoSaving}
                onChange={(event) => {
                  void handlePhotoSelected(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {user.profileImageVersion && (
              <button
                type="button"
                disabled={photoSaving}
                onClick={() => void handleRemovePhoto()}
                className="inline-flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground transition-all active:scale-95 disabled:opacity-60"
              >
                <ImageOff size={14} />
                Use avatar
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Photos are cropped and compressed to a lightweight 128px thumbnail.
          </p>
          {photoError && (
            <p className="mt-1 text-center text-xs text-destructive">{photoError}</p>
          )}
          {editName && (
            <div className="flex flex-col items-center gap-3 mt-3">
              <button
                onClick={() => setAvatarSeedInput(crypto.randomUUID())}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-semibold active:scale-95 transition-all"
              >
                <Shuffle size={14} />
                Randomize avatar
              </button>
              <div className="flex gap-2">
                {MEMBER_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setColorInput(color)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      colorInput === color ? "border-foreground scale-110" : "border-card"
                    }`}
                    style={{ backgroundColor: color }}
                    title="Avatar background color"
                  />
                ))}
              </div>
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

        {/* Optional support */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2 px-1">Support</p>
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shrink-0">
                <Coffee size={15} className="text-accent-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Support BayadTayoOpo</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  BayadTayoOpo is free to use. Optional support helps cover hosting and ongoing development.
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
                avatar selection or compressed profile photo,
                group memberships, expenses, settlements, messages, and activity
                history, plus your notification preferences and read status, so
                your groups can sync across devices and members.
              </span>
              <span className="block">
                If you enable system alerts, a device-specific push token is
                stored by our push-delivery service so your browser can receive
                notifications. Turning system alerts off removes that device.
              </span>
              <span className="block">
                Your data is used only to provide app features. We do not sell
                your personal data.
              </span>
              <span className="block">
                You can update your display name, avatar, and profile color from this
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

      <Dialog.Root open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 pb-3 pt-5">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Notifications
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                  Choose what appears in your notification inbox.
                </Dialog.Description>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                className="rounded-full p-2 hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5 pb-10">
              <div className="space-y-2">
                <NotificationToggle
                  label="Payments"
                  detail="Submissions, confirmations, corrections, and reversals"
                  checked={notificationDraft.payments}
                  onChange={(payments) =>
                    setNotificationDraft((current) => ({
                      ...current,
                      payments,
                    }))
                  }
                />
                <NotificationToggle
                  label="Expenses involving me"
                  detail="New, updated, and deleted expenses"
                  checked={notificationDraft.expenses}
                  onChange={(expenses) =>
                    setNotificationDraft((current) => ({
                      ...current,
                      expenses,
                    }))
                  }
                />
                <NotificationToggle
                  label="Group chat"
                  detail="Messages from other members"
                  checked={notificationDraft.chat}
                  onChange={(chat) =>
                    setNotificationDraft((current) => ({ ...current, chat }))
                  }
                />
                <NotificationToggle
                  label="Member activity"
                  detail="Let admins know when someone joins"
                  checked={notificationDraft.memberActivity}
                  onChange={(memberActivity) =>
                    setNotificationDraft((current) => ({
                      ...current,
                      memberActivity,
                    }))
                  }
                />
              </div>

              {notificationDraft.chat && groups.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Chat notifications by group
                  </p>
                  <div className="overflow-hidden rounded-2xl border border-border">
                    {groups.map((group, index) => {
                      const enabled =
                        !notificationDraft.mutedChatGroupIds.includes(group.id);
                      return (
                        <NotificationToggle
                          key={group.id}
                          label={group.name}
                          detail={enabled ? "Chat alerts on" : "Muted"}
                          checked={enabled}
                          bordered={index < groups.length - 1}
                          onChange={(nextEnabled) =>
                            setNotificationDraft((current) => ({
                              ...current,
                              mutedChatGroupIds: nextEnabled
                                ? current.mutedChatGroupIds.filter(
                                    (id) => id !== group.id,
                                  )
                                : [
                                    ...new Set([
                                      ...current.mutedChatGroupIds,
                                      group.id,
                                    ]),
                                  ],
                            }))
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent">
                    <Bell size={16} className="text-accent-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      System and closed-app alerts
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Receive browser notifications through Web Push, including
                      while the installed app is closed when the device supports
                      it.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pushSaving}
                  onClick={async () => {
                    setPushSaving(true);
                    setNotificationError("");
                    try {
                      if (notificationDraft.systemNotifications) {
                        await disablePushNotifications(user.id);
                        setNotificationDraft((current) => ({
                          ...current,
                          systemNotifications: false,
                        }));
                        return;
                      }
                      const availability = getPushAvailability();
                      if (!availability.available) {
                        throw new Error(availability.reason);
                      }
                      await enablePushNotifications(user.id, {
                        ...notificationDraft,
                        systemNotifications: true,
                      });
                      setNotificationDraft((current) => ({
                        ...current,
                        systemNotifications: true,
                      }));
                    } catch (error) {
                      setNotificationError(
                        error instanceof Error
                          ? error.message
                          : "Unable to enable push notifications.",
                      );
                    } finally {
                      setPushSaving(false);
                    }
                  }}
                  className={`mt-4 w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 ${
                    notificationDraft.systemNotifications
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {pushSaving
                    ? "Updating…"
                    : notificationDraft.systemNotifications
                    ? "Turn off system alerts"
                    : "Enable system alerts"}
                </button>
              </div>

              {notificationError && (
                <p className="text-xs text-destructive">{notificationError}</p>
              )}

              <button
                type="button"
                onClick={() => {
                  onUpdateUser({
                    ...user,
                    notificationPreferences: notificationDraft,
                  });
                  setNotificationsOpen(false);
                }}
                className="w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground"
              >
                Save notification settings
              </button>
            </div>
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

function NotificationToggle({
  label,
  detail,
  checked,
  onChange,
  bordered = false,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  bordered?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-3 bg-card px-4 py-3 text-left ${
        bordered ? "border-b border-border" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}
