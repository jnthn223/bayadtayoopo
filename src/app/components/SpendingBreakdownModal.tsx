import * as Dialog from "@radix-ui/react-dialog";
import { BarChart3, X } from "lucide-react";
import type { Member } from "./types";
import { formatCurrency } from "./utils";
import { UserAvatar } from "./UserAvatar";

export interface SpendingBreakdownEntry {
  member: Member;
  amount: number;
}

export interface SpendingBreakdownSection {
  currency: string;
  entries: SpendingBreakdownEntry[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  view: "unsettled" | "all";
  sections: SpendingBreakdownSection[];
}

export function SpendingBreakdownModal({ open, onClose, view, sections }: Props) {
  const hasSpending = sections.some((section) =>
    section.entries.some((entry) => entry.amount > 0.005),
  );

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[80] max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:inset-x-4 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border sm:border-border">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-primary/10 p-2 text-primary"><BarChart3 size={19} /></span>
                <Dialog.Title className="text-lg font-semibold text-foreground">Spending breakdown</Dialog.Title>
              </div>
              <Dialog.Description className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {view === "all"
                  ? "Each member’s allocated share across all tracked expenses."
                  : "Each member’s allocated share from expenses that still have an unpaid portion."}
                {" "}This is spending, not the balance they currently owe.
              </Dialog.Description>
            </div>
            <Dialog.Close className="shrink-0 rounded-full bg-muted p-2 text-foreground" aria-label="Close spending breakdown">
              <X size={19} />
            </Dialog.Close>
          </div>

          <div className="space-y-6 p-5">
            {!hasSpending && (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm font-semibold text-foreground">No spending to show</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {view === "all" ? "Add an expense to see member shares here." : "There are no open expenses in this view."}
                </p>
              </div>
            )}

            {sections.filter((section) => section.entries.some((entry) => entry.amount > 0.005)).map((section) => {
              const entries = [...section.entries]
                .filter((entry) => entry.amount > 0.005)
                .sort((a, b) => b.amount - a.amount || a.member.name.localeCompare(b.member.name));
              const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
              const maximum = Math.max(...entries.map((entry) => entry.amount), 0);
              return (
                <section key={section.currency}>
                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {view === "all" ? "Total member shares" : "Shares in open expenses"}
                      </p>
                      <p className="mt-0.5 text-xl font-bold text-foreground">{formatCurrency(total, section.currency)}</p>
                    </div>
                    {sections.length > 1 && <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{section.currency}</span>}
                  </div>

                  <div className="space-y-4">
                    {entries.map((entry) => {
                      const percentage = total > 0 ? (entry.amount / total) * 100 : 0;
                      const barWidth = maximum > 0 ? (entry.amount / maximum) * 100 : 0;
                      return (
                        <div key={entry.member.id}>
                          <div className="mb-1.5 flex items-center gap-2.5">
                            <UserAvatar
                              name={entry.member.name}
                              color={entry.member.color}
                              seed={entry.member.avatarSeed}
                              uid={entry.member.uid}
                              photoVersion={entry.member.profileImageVersion}
                              className="h-8 w-8 shrink-0 rounded-full text-xs"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{entry.member.name}</span>
                            <span className="shrink-0 text-right">
                              <strong className="block text-sm font-semibold text-foreground">{formatCurrency(entry.amount, section.currency)}</strong>
                              <span className="block text-[10px] text-muted-foreground">{percentage.toFixed(percentage >= 10 ? 0 : 1)}%</span>
                            </span>
                          </div>
                          <div className="ml-[42px] h-2.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full min-w-[3px] rounded-full bg-primary transition-[width] duration-300"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
