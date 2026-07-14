import {
  CreditCard,
  FileCheck2,
  HelpCircle,
  Receipt,
  Share2,
  UserPlus,
} from "lucide-react";

export const GROUP_TOUR_TARGETS = [
  "welcome",
  "members",
  "share",
  "expense",
  "settle",
  "done",
] as const;

export type GroupTourTarget = (typeof GROUP_TOUR_TARGETS)[number];

interface Props {
  groupName: string;
  isAdmin: boolean;
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}

export function getGroupTourTarget(step: number | null): GroupTourTarget | null {
  return step === null ? null : (GROUP_TOUR_TARGETS[step] ?? null);
}

export function GroupTour({
  groupName,
  isAdmin,
  step,
  onStepChange,
  onClose,
}: Props) {
  const steps = [
    {
      icon: HelpCircle,
      eyebrow: "Quick group tour",
      title: `Welcome to ${groupName}`,
      copy: "Let’s show you the fastest way to add everyone, record expenses, and settle payments—no spreadsheets or awkward follow-ups.",
    },
    {
      icon: UserPlus,
      eyebrow: "Add now, join later",
      title: "Hindi kailangang maghintay",
      copy: isAdmin
        ? "Open Manage members and add names as pending members. You can include them in expenses immediately, even before they create an account."
        : "Group admins can add names as pending members and include them in expenses before those people create an account.",
    },
    {
      icon: Share2,
      eyebrow: "No email address needed",
      title: "Share a QR code or link",
      copy: "Send the general group link, or choose a pending member to create a personal claim link that reconnects them with their existing expenses.",
    },
    {
      icon: Receipt,
      eyebrow: "Start tracking immediately",
      title: "Add the expense now",
      copy: "Choose who paid, split equally or enter custom amounts, and include joined or pending members in the same expense.",
    },
    {
      icon: CreditCard,
      eyebrow: "Clear payment flow",
      title: "Instructions in, proof out",
      copy: "In Settle Up, add your GCash, bank, or QR instructions. The borrower submits a reference or receipt, then the person owed confirms or rejects it.",
    },
    {
      icon: FileCheck2,
      eyebrow: "You’re ready",
      title: "Walang gulatan sa singilan",
      copy: "Balances, repayment status, payment proof, and group chat stay together. You can replay this guide anytime from the ⋮ menu.",
    },
  ] as const;
  const active = steps[step];
  if (!active) return null;

  const Icon = active.icon;
  const target = GROUP_TOUR_TARGETS[step];
  const isLast = step === steps.length - 1;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Group onboarding guide"
        className={`fixed inset-x-4 z-[70] mx-auto max-w-sm animate-in fade-in zoom-in-95 duration-300 ${
          target === "expense" ? "top-20" : "bottom-6"
        }`}
      >
        <div className="rounded-3xl border border-primary/15 bg-card p-5 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div className="grid size-11 place-items-center rounded-2xl bg-accent">
              <Icon size={21} className="text-primary" />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Skip
            </button>
          </div>

          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            {active.eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-snug text-foreground">
            {active.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {active.copy}
          </p>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div
              className="flex gap-1.5"
              aria-label={`Step ${step + 1} of ${steps.length}`}
            >
              {steps.map((item, index) => (
                <span
                  key={item.eyebrow}
                  className={`h-1.5 rounded-full transition-all ${
                    index === step
                      ? "w-5 bg-primary"
                      : index < step
                        ? "w-1.5 bg-primary/45"
                        : "w-1.5 bg-border"
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => onStepChange(step - 1)}
                  className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-foreground"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => (isLast ? onClose() : onStepChange(step + 1))}
                className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"
              >
                {isLast ? "Start tracking" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
