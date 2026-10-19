import * as Dialog from "@radix-ui/react-dialog";
import { Archive, X } from "lucide-react";

export function ArchiveBlockedDialog({
  reason,
  onClose,
}: {
  reason?: string;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={Boolean(reason)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-4 bottom-6 z-[71] mx-auto max-w-md rounded-3xl border border-border bg-card p-5 shadow-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Archive size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-foreground">
                Settle first before archiving
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {reason}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="-mr-1 -mt-1 rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Close">
                <X size={17} />
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-5 rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            Archiving only hides settled records from your Home screen. Your expense history stays safe and can be restored anytime.
          </div>
          <button type="button" onClick={onClose} className="mt-5 w-full rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]">
            Got it
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
