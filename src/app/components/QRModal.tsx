import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Check, Share2 } from "lucide-react";
import type { Group } from "./types";
import { buildInviteMessage } from "./inviteMessage";

interface Props {
  group: Group;
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

export function QRModal({ group, open, onClose, isAdmin }: Props) {
  const qrContainerRef = useRef<HTMLDivElement | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [includeBalance, setIncludeBalance] = useState(true);
  const [shareError, setShareError] = useState("");
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
  const inviteMessage = buildInviteMessage({
    group,
    joinUrl,
    member: selectedMember,
    includeBalance,
  });

  function handleClose() {
    setCopyStatus("");
    setSelectedMemberId("");
    setIncludeBalance(true);
    setShareError("");
    onClose();
  }

  async function createQrFile(): Promise<File | undefined> {
    const svg = qrContainerRef.current?.querySelector("svg");
    if (!svg) return undefined;

    const serialized = new XMLSerializer().serializeToString(svg);
    const source = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(source);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 700;
      const context = canvas.getContext("2d");
      if (!context) return undefined;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#5b4cf5";
      context.fillRect(0, 0, canvas.width, 92);
      context.fillStyle = "#ffffff";
      context.font = "700 32px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("BayadTayoOpo", 300, 58);
      context.fillStyle = "#17171c";
      context.font = "600 26px system-ui, sans-serif";
      const displayName = group.name.length > 34
        ? `${group.name.slice(0, 33)}…`
        : group.name;
      context.fillText(displayName, 300, 137);
      context.drawImage(image, 70, 160, 460, 460);
      context.fillStyle = "#6f7082";
      context.font = "500 21px system-ui, sans-serif";
      context.fillText("Scan to join the group", 300, 658);
      context.font = "400 16px system-ui, sans-serif";
      context.fillText("Ambagan without the awkward singilan.", 300, 684);
      const png = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!png) return undefined;
      const safeGroupName = group.name
        .trim()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "") || "group";
      return new File([png], `${safeGroupName}-invite-qr.png`, {
        type: "image/png",
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleCopy() {
    setShareError("");
    try {
      const qrFile = await createQrFile();
      if (qrFile && navigator.clipboard?.write && "ClipboardItem" in window) {
        const richMessage = buildInviteMessage({
          group,
          joinUrl,
          member: selectedMember,
          includeBalance,
          includeQrNote: true,
        });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([richMessage], { type: "text/plain" }),
            "image/png": qrFile,
          }),
        ]);
        setCopyStatus("Invite + QR copied!");
      } else {
        await navigator.clipboard.writeText(inviteMessage);
        setCopyStatus("Invite copied!");
      }
      setTimeout(() => setCopyStatus(""), 2400);
    } catch {
      try {
        await navigator.clipboard.writeText(inviteMessage);
        setCopyStatus("Invite copied!");
        setTimeout(() => setCopyStatus(""), 2400);
      } catch {
        setShareError("Unable to copy the invite. Please select and copy the message below.");
      }
    }
  }

  async function handleShare() {
    if (!navigator.share) {
      await handleCopy();
      return;
    }

    try {
      const qrFile = await createQrFile();
      const canShareQr = !!qrFile && !!navigator.canShare?.({ files: [qrFile] });
      await navigator.share({
        title: `Join ${group.name} on BayadTayoOpo`,
        text: buildInviteMessage({
          group,
          joinUrl,
          member: selectedMember,
          includeBalance,
          includeQrNote: canShareQr,
        }),
        ...(canShareQr ? { files: [qrFile] } : {}),
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
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto bg-card rounded-t-3xl shadow-2xl p-6 pb-10">
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
                    setCopyStatus("");
                    setShareError("");
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

            {selectedMember && (
              <label className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    Include current balance
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Adds what {selectedMember.name} currently needs to settle or receive.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={includeBalance}
                  onChange={(event) => setIncludeBalance(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            )}

            <div ref={qrContainerRef} className="p-4 bg-white rounded-2xl shadow-sm border border-border">
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

            <div className="w-full rounded-2xl border border-border bg-muted/30 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Invite message
              </p>
              <p className="max-h-44 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-foreground">
                {inviteMessage}
              </p>
            </div>

            {shareError && (
              <p className="w-full text-center text-xs text-destructive" role="alert">
                {shareError}
              </p>
            )}

            <div className="w-full flex gap-3">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-border bg-muted text-foreground text-sm font-medium hover:bg-accent transition-all active:scale-95"
              >
                {copyStatus ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                {copyStatus || "Copy invite"}
              </button>
              <button
                onClick={() => void handleShare()}
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
