import { useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Download, Share2, X } from "lucide-react";
import type { Group, Member } from "./types";

interface Props {
  group: Group;
  person: Member;
  open: boolean;
  onClose: () => void;
}

export function DirectClaimInviteModal({ group, person, open, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement | null>(null);
  const claimUrl = useMemo(() => {
    if (!person.claimCode) return "";
    const params = new URLSearchParams({
      joinGroupId: group.id,
      claimMemberId: person.id,
      claimCode: person.claimCode,
      claimMemberName: person.name,
      claimGroupName: group.name,
    });
    return `${window.location.origin}${window.location.pathname}?${params}`;
  }, [group.id, group.name, person.claimCode, person.id, person.name]);
  const message = `Hi ${person.name}! I started tracking our shared expenses on BayadTayoOpo. Claim your profile to review the history and continue from there:\n\n${claimUrl}`;

  async function copyLink() {
    await navigator.clipboard.writeText(claimUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareInvite() {
    const qrFile = await createQrFile();
    if (navigator.share) {
      try {
        const canShareQr = !!qrFile && !!navigator.canShare?.({ files: [qrFile] });
        await navigator.share({
          title: "Your BayadTayoOpo invite",
          text: `${message}${canShareQr ? "\n\nOr scan the attached personal QR code." : ""}`,
          ...(canShareQr ? { files: [qrFile] } : {}),
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(message);
    setCopied(true);
  }

  async function createQrFile(): Promise<File | undefined> {
    const svg = qrContainerRef.current?.querySelector("svg");
    if (!svg) return undefined;
    const source = new Blob(
      [new XMLSerializer().serializeToString(svg)],
      { type: "image/svg+xml;charset=utf-8" },
    );
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
      context.fillRect(0, 0, 600, 700);
      context.fillStyle = "#5b4cf5";
      context.fillRect(0, 0, 600, 92);
      context.fillStyle = "#ffffff";
      context.font = "700 32px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("BayadTayoOpo", 300, 58);
      context.fillStyle = "#17171c";
      context.font = "600 26px system-ui, sans-serif";
      context.fillText(`For ${person.name.slice(0, 28)}`, 300, 137);
      context.drawImage(image, 70, 160, 460, 460);
      context.fillStyle = "#6f7082";
      context.font = "500 20px system-ui, sans-serif";
      context.fillText("Scan to claim your direct expense history", 300, 662);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) return undefined;
      const safeName = person.name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "person";
      return new File([png], `${safeName}-bayadtayoopo-claim-qr.png`, { type: "image/png" });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function downloadQr() {
    const file = await createQrFile();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card p-5 pb-10 shadow-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(92vw,40rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border md:border-border">
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">Invite {person.name} to claim</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                They did not need an account or approval while you were tracking privately. Send this only when you are ready for them to claim and review the history.
              </Dialog.Description>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-muted" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div ref={qrContainerRef} className="mx-auto mt-5 w-fit rounded-2xl border border-border bg-white p-4 shadow-sm">
            {claimUrl && <QRCodeSVG value={claimUrl} size={210} level="M" includeMargin />}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">Personal QR for {person.name} only</p>
          <div className="mt-5 rounded-2xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground break-all">{claimUrl}</div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => void copyLink()} aria-label="Copy personal claim link" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground">
              {copied ? <Check size={16} /> : <Copy size={16} />}<span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </button>
            <button type="button" onClick={() => void downloadQr()} aria-label="Download personal claim QR" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground">
              <Download size={16} /><span className="hidden sm:inline">Download</span>
            </button>
            <button type="button" onClick={() => void shareInvite()} aria-label="Share personal claim invite" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
              <Share2 size={16} /><span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
