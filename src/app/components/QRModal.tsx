import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Check, Share2 } from "lucide-react";
import type { Group } from "./types";

interface Props {
  group: Group;
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

export function QRModal({ group, open, onClose, isAdmin }: Props) {
  const [copied, setCopied] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const pendingMembers = group.members.filter(
    (member) => !member.uid && member.claimCode,
  );
  const selectedMember = pendingMembers.find(
    (member) => member.id === selectedMemberId,
  );

  const joinParams = new URLSearchParams({ joinGroupId: group.id });
  if (selectedMember?.claimCode) {
    joinParams.set("claimMemberId", selectedMember.id);
    joinParams.set("claimCode", selectedMember.claimCode);
  }
  const joinUrl = `${window.location.origin}${window.location.pathname}?${joinParams}`;

  function handleClose() {
    setCopied(false);
    setSelectedMemberId("");
    onClose();
  }

  function handleCopy() {
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: `Join ${group.name} on BayadTayoOpo`,
        text: selectedMember
          ? `Claim your place as ${selectedMember.name} in the "${group.name}" expense group.`
          : `You've been invited to join the "${group.name}" expense group.`,
        url: joinUrl,
      });
    } else {
      handleCopy();
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl shadow-2xl p-6 pb-10">
          <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5" />
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-lg font-semibold text-foreground">Invite to {group.name}</Dialog.Title>
            <button onClick={handleClose} className="p-2 rounded-full hover:bg-muted transition-colors">
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-6">
            {isAdmin && pendingMembers.length > 0 && (
              <div className="w-full">
                <label className="block text-sm text-muted-foreground mb-1.5">
                  Invite link for
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(event) => {
                    setSelectedMemberId(event.target.value);
                    setCopied(false);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-foreground text-sm outline-none focus:border-primary"
                >
                  <option value="">Anyone — general group invite</option>
                  {pendingMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} — personal claim invite
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="p-4 bg-white rounded-2xl shadow-sm border border-border">
              <QRCodeSVG value={joinUrl} size={220} level="M" />
            </div>

            <p className="text-center text-sm text-muted-foreground max-w-xs">
              {selectedMember ? (
                <>
                  This personal QR lets <span className="font-medium text-foreground">{selectedMember.name}</span> claim their existing expenses in <span className="font-medium text-foreground">{group.name}</span>.
                </>
              ) : (
                <>
                  Scan this QR code or share the link to let others join <span className="font-medium text-foreground">{group.name}</span>.
                </>
              )}
            </p>

            <div className="w-full flex gap-3">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-border bg-muted text-foreground text-sm font-medium hover:bg-accent transition-all active:scale-95"
              >
                {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                {copied ? "Copied!" : "Copy link"}
              </button>
              <button
                onClick={handleShare}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all active:scale-95"
                style={{ backgroundColor: "var(--primary)" }}
              >
                <Share2 size={16} />
                Share
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
