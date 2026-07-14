import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  UserPlus,
  Merge,
  Trash2,
  Share2,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import type { Group } from "./types";
import { UserAvatar } from "./UserAvatar";

interface Props {
  group: Group;
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  onAddPending?: (name: string) => string | undefined;
  onMergePending?: (pendingId: string, joinedId: string) => void;
  onDeletePending?: (memberId: string) => string | undefined;
  onRemoveMember?: (memberId: string) => string | undefined;
  onSetMemberAdmin?: (
    memberId: string,
    makeAdmin: boolean,
  ) => string | undefined;
}

export function InviteModal({
  group,
  open,
  onClose,
  isAdmin,
  onAddPending,
  onMergePending,
  onDeletePending,
  onRemoveMember,
  onSetMemberAdmin,
}: Props) {
  const [pendingName, setPendingName] = useState("");
  const [pendingError, setPendingError] = useState("");
  const [showSharePreview, setShowSharePreview] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const ownerId = group.adminId ?? group.members[0]?.id;
  const isOwner = (member: Group["members"][number]) =>
    member.id === ownerId || member.uid === ownerId;
  // Legacy groups did not persist the creator's uid. The owner is still a
  // joined member because their member id is their authentication uid.
  const pendingMembers = group.members.filter(
    (member) => !member.uid && !isOwner(member),
  );
  const joinedMembers = group.members.filter(
    (member) => !!member.uid || isOwner(member),
  );
  const memberIsAdmin = (member: Group["members"][number]) =>
    isOwner(member) ||
    (group.adminIds ?? []).some(
      (adminId) => adminId === member.id || adminId === member.uid,
    );

  function setMemberAdmin(memberId: string, makeAdmin: boolean) {
    const adminError = onSetMemberAdmin?.(memberId, makeAdmin);
    if (adminError) setPendingError(adminError);
    else setPendingError("");
  }

  function removeMember(memberId: string, memberName: string) {
    if (!window.confirm(`Remove ${memberName} from this group? Their past expense records will be kept.`)) {
      return;
    }
    const removeError = onRemoveMember?.(memberId);
    if (removeError) setPendingError(removeError);
    else setPendingError("");
  }

  function handleClose() {
    setPendingName("");
    setPendingError("");
    setShowSharePreview(false);
    setShareMessage("");
    setShareError("");
    onClose();
  }

  function addPendingMember() {
    const name = pendingName.trim();
    if (!name) {
      setPendingError("Enter the member's name");
      return;
    }
    const error = onAddPending?.(name);
    if (error) {
      setPendingError(error);
      return;
    }
    setPendingName("");
    setPendingError("");
  }

  function personalJoinUrl(memberId: string, claimCode: string) {
    const params = new URLSearchParams({
      joinGroupId: group.id,
      claimMemberId: memberId,
      claimCode,
    });
    return `${window.location.origin}${window.location.pathname}?${params}`;
  }

  function preparePendingInvites() {
    const message = pendingMembers
      .filter((member) => member.claimCode)
      .map(
        (member) =>
          `${member.name} click here: ${personalJoinUrl(member.id, member.claimCode!)}`,
      )
      .join("\n");

    setShareMessage(message);
    setShareError("");
    setShowSharePreview(true);
  }

  async function sharePendingInvites() {
    if (!navigator.share) {
      setShareError(
        "Native sharing is not available in this browser. Open BayadTayoOpo on a supported mobile browser to share this message.",
      );
      return;
    }

    try {
      await navigator.share({
        title: `Join ${group.name} on BayadTayoOpo`,
        text: shareMessage,
      });
      setShareError("");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareError("The share sheet could not be opened. Please try again.");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="w-10 h-1 bg-border rounded-full mx-auto mt-4 mb-5" />
          <div className="flex items-center justify-between px-5 mb-5">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              Manage members
            </Dialog.Title>
            <button
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-muted transition-colors"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <div className="px-5 pb-10">
            <div className="space-y-4">
                {!isAdmin && (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4">
                    <p className="text-sm font-semibold text-foreground">
                      Members are managed by group admins
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      You can still use the QR button in the group header to
                      share a general join code or link—no email address needed.
                    </p>
                  </div>
                )}
                {isAdmin && (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
                    <div className="space-y-2 pb-3 border-b border-border">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Current members
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Manage roles or remove members from {group.name}. The
                          owner cannot be removed or demoted.
                        </p>
                      </div>
                      {joinedMembers.map((member) => {
                        const owner = isOwner(member);
                        const admin = memberIsAdmin(member);
                        return (
                          <div
                            key={member.id}
                            className="flex items-center gap-2 rounded-xl bg-card border border-border p-2.5"
                          >
                            <UserAvatar
                              name={member.name}
                              color={member.color}
                              seed={member.avatarSeed}
                              className="w-8 h-8 rounded-full"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {member.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {owner
                                  ? "Group owner"
                                  : admin
                                    ? "Co-admin"
                                    : "Member"}
                              </p>
                            </div>
                            {!owner && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMemberAdmin(member.id, !admin)
                                  }
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold ${
                                    admin
                                      ? "bg-muted text-muted-foreground"
                                      : "bg-primary text-primary-foreground"
                                  }`}
                                >
                                  <ShieldCheck size={14} />
                                  {admin ? "Remove admin" : "Make admin"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeMember(member.id, member.name)}
                                  className="p-2 rounded-lg bg-destructive/10 text-destructive"
                                  title={`Remove ${member.name} from group`}
                                  aria-label={`Remove ${member.name} from group`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Add now, let them join later
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Pending members can be included in expenses immediately.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={pendingName}
                        onChange={(event) => {
                          setPendingName(event.target.value);
                          setPendingError("");
                        }}
                        onKeyDown={(event) =>
                          event.key === "Enter" && addPendingMember()
                        }
                        placeholder="Member name"
                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary"
                      />
                      <button
                        onClick={addPendingMember}
                        className="px-3 rounded-xl bg-primary text-primary-foreground"
                        title="Add pending member"
                      >
                        <UserPlus size={17} />
                      </button>
                    </div>
                    {pendingError && (
                      <p className="text-xs text-destructive">{pendingError}</p>
                    )}

                    {pendingMembers.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {pendingMembers.map((member) => (
                          <div
                            key={member.id}
                            className="rounded-xl bg-card border border-border p-3 space-y-2"
                          >
                            <div className="flex items-center gap-2">
                              <UserAvatar
                                name={member.name}
                                color={member.color}
                                seed={member.avatarSeed}
                                className="w-8 h-8 rounded-full"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {member.name}
                                </p>
                                <p className="text-[11px] text-amber-700">
                                  Pending
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  const error = onDeletePending?.(member.id);
                                  if (error) setPendingError(error);
                                }}
                                className="p-2 rounded-lg bg-destructive/10 text-destructive"
                                title="Delete pending member"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            {joinedMembers.length > 1 && (
                              <div className="flex gap-2">
                                <select
                                  value={mergeTargets[member.id] ?? ""}
                                  onChange={(event) =>
                                    setMergeTargets((value) => ({
                                      ...value,
                                      [member.id]: event.target.value,
                                    }))
                                  }
                                  className="flex-1 min-w-0 px-2 py-2 rounded-lg bg-input-background border border-border text-xs"
                                >
                                  <option value="">
                                    Merge into joined member…
                                  </option>
                                  {joinedMembers.map((joined) => (
                                    <option key={joined.id} value={joined.id}>
                                      {joined.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  disabled={!mergeTargets[member.id]}
                                  onClick={() =>
                                    onMergePending?.(
                                      member.id,
                                      mergeTargets[member.id],
                                    )
                                  }
                                  className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
                                  title="Merge members"
                                >
                                  <Merge size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}

                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
                          <div className="flex items-start gap-2.5">
                            <MessageSquareText
                              size={17}
                              className="text-primary mt-0.5 shrink-0"
                            />
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                Invite your placeholder members
                              </p>
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                Placeholder members let you record expenses
                                before someone joins. Each person below has a
                                unique link that connects them to their existing
                                expenses.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={preparePendingInvites}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
                          >
                            <Share2 size={15} />
                            Preview & share all invites
                          </button>
                        </div>

                        {showSharePreview && (
                          <div className="rounded-xl border border-border bg-card p-3 space-y-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                Message preview
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                This exact message will be sent to the app you
                                choose.
                              </p>
                            </div>
                            <textarea
                              value={shareMessage}
                              readOnly
                              rows={Math.min(
                                Math.max(pendingMembers.length * 2, 4),
                                10,
                              )}
                              className="w-full resize-none rounded-xl border border-border bg-input-background p-3 text-xs leading-relaxed text-foreground outline-none"
                              aria-label="Pending member invite message preview"
                            />
                            {shareError && (
                              <p
                                className="text-xs text-destructive"
                                role="alert"
                              >
                                {shareError}
                              </p>
                            )}
                            <button
                              onClick={sharePendingInvites}
                              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
                            >
                              <Share2 size={16} />
                              Share message
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
