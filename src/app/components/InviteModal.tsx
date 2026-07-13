import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Mail, Loader2, CheckCircle2, Send, UserPlus, Merge, Trash2, Share2, MessageSquareText } from "lucide-react";
import { sendMagicLink } from "../../lib/firebaseRest";
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
}

type Step = "form" | "sent";

export function InviteModal({
  group,
  open,
  onClose,
  isAdmin,
  onAddPending,
  onMergePending,
  onDeletePending,
}: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [sentTo, setSentTo] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [pendingError, setPendingError] = useState("");
  const [showSharePreview, setShowSharePreview] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const pendingMembers = group.members.filter((member) => !member.uid);
  const joinedMembers = group.members.filter((member) => !!member.uid);

  function handleClose() {
    setEmail("");
    setError("");
    setStep("form");
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
      .map((member) => `${member.name} click here: ${personalJoinUrl(member.id, member.claimCode!)}`)
      .join("\n");

    setShareMessage(message);
    setShareError("");
    setShowSharePreview(true);
  }

  async function sharePendingInvites() {
    if (!navigator.share) {
      setShareError("Native sharing is not available in this browser. Open BayadTayoOpo on a supported mobile browser to share this message.");
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

  async function handleSend() {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }
    setError("");
    setLoading(true);

    // continueUrl encodes only the groupId — Firestore is the source of truth
    const continueUrl = `${window.location.origin}${window.location.pathname}?joinGroupId=${group.id}`;

    try {
      await sendMagicLink(trimmed, continueUrl);
      setSentTo(trimmed);
      setStep("sent");
    } catch (err: any) {
      setError(err.message ?? "Failed to send invite. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSendAnother() {
    setEmail("");
    setError("");
    setStep("form");
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="w-10 h-1 bg-border rounded-full mx-auto mt-4 mb-5" />
          <div className="flex items-center justify-between px-5 mb-5">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              Invite to {group.name}
            </Dialog.Title>
            <button
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-muted transition-colors"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <div className="px-5 pb-10">
            {step === "form" ? (
              <div className="space-y-4">
                {isAdmin && (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Add now, let them join later</p>
                      <p className="text-xs text-muted-foreground mt-1">Pending members can be included in expenses immediately.</p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={pendingName}
                        onChange={(event) => {
                          setPendingName(event.target.value);
                          setPendingError("");
                        }}
                        onKeyDown={(event) => event.key === "Enter" && addPendingMember()}
                        placeholder="Member name"
                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary"
                      />
                      <button onClick={addPendingMember} className="px-3 rounded-xl bg-primary text-primary-foreground" title="Add pending member">
                        <UserPlus size={17} />
                      </button>
                    </div>
                    {pendingError && <p className="text-xs text-destructive">{pendingError}</p>}

                    {pendingMembers.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {pendingMembers.map((member) => (
                          <div key={member.id} className="rounded-xl bg-card border border-border p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <UserAvatar name={member.name} color={member.color} seed={member.avatarSeed} className="w-8 h-8 rounded-full" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{member.name}</p>
                                <p className="text-[11px] text-amber-700">Pending</p>
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
                                  onChange={(event) => setMergeTargets((value) => ({ ...value, [member.id]: event.target.value }))}
                                  className="flex-1 min-w-0 px-2 py-2 rounded-lg bg-input-background border border-border text-xs"
                                >
                                  <option value="">Merge into joined member…</option>
                                  {joinedMembers.map((joined) => (
                                    <option key={joined.id} value={joined.id}>{joined.name}</option>
                                  ))}
                                </select>
                                <button
                                  disabled={!mergeTargets[member.id]}
                                  onClick={() => onMergePending?.(member.id, mergeTargets[member.id])}
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
                            <MessageSquareText size={17} className="text-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-foreground">Invite your placeholder members</p>
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                Placeholder members let you record expenses before someone joins. Each person below has a unique link that connects them to their existing expenses.
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
                              <p className="text-sm font-semibold text-foreground">Message preview</p>
                              <p className="text-xs text-muted-foreground mt-1">This exact message will be sent to the app you choose.</p>
                            </div>
                            <textarea
                              value={shareMessage}
                              readOnly
                              rows={Math.min(Math.max(pendingMembers.length * 2, 4), 10)}
                              className="w-full resize-none rounded-xl border border-border bg-input-background p-3 text-xs leading-relaxed text-foreground outline-none"
                              aria-label="Pending member invite message preview"
                            />
                            {shareError && <p className="text-xs text-destructive" role="alert">{shareError}</p>}
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

                <p className="text-sm text-muted-foreground">
                  We'll email them a magic link. When they click it, they'll be
                  signed in and automatically added to this group.
                </p>

                <div>
                  <label className="block text-sm text-muted-foreground mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="email"
                      placeholder="friend@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSend()}
                      autoFocus
                      className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  {error && (
                    <p className="text-destructive text-xs mt-1.5">{error}</p>
                  )}
                </div>

                <button
                  onClick={handleSend}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-primary-foreground font-semibold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      <Send size={17} />
                      Send Invite
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center space-y-4 py-4">
                <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-accent-foreground" />
                </div>
                <div>
                  <p className="text-foreground font-semibold mb-1">
                    Invite sent!
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    A magic link was sent to{" "}
                    <span className="font-medium text-foreground">
                      {sentTo}
                    </span>
                    . They'll join the group when they click it.
                  </p>
                </div>
                <div className="flex gap-3 w-full pt-2">
                  <button
                    onClick={handleSendAnother}
                    className="flex-1 py-3.5 rounded-2xl border border-border bg-muted text-foreground text-sm font-medium transition-all active:scale-95"
                  >
                    Invite another
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 py-3.5 rounded-2xl text-primary-foreground text-sm font-semibold transition-all active:scale-95"
                    style={{ backgroundColor: "var(--primary)" }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
