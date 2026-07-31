import * as Dialog from "@radix-ui/react-dialog";
import { BellRing, X } from "lucide-react";

interface Props {
  open: boolean;
  saving: boolean;
  error: string;
  onEnable: () => void;
  onDismiss: () => void;
}

export function SystemAlertsPrompt({
  open,
  saving,
  error,
  onEnable,
  onDismiss,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onDismiss()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-4 bottom-6 z-[80] mx-auto max-w-sm rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-2xl">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent">
              <BellRing size={22} className="text-accent-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold">
                Don’t miss a bayaran
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Get alerts for payments, expenses, and group messages—even when
                BayadTayoOpo is closed.
              </Dialog.Description>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification prompt"
              disabled={saving}
              onClick={onDismiss}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <X size={17} />
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onDismiss}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Not now
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onEnable}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Enabling…" : "Enable system alerts"}
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            You can change this anytime in Profile → Notifications.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
