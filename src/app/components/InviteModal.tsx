import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Mail, Loader2, CheckCircle2, Send } from "lucide-react";
import { sendMagicLink } from "../../lib/firebaseRest";
import type { Group } from "./types";

interface Props {
  group: Group;
  open: boolean;
  onClose: () => void;
}

type Step = "form" | "sent";

export function InviteModal({ group, open, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [sentTo, setSentTo] = useState("");

  function handleClose() {
    setEmail("");
    setError("");
    setStep("form");
    onClose();
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
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl shadow-2xl">
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
