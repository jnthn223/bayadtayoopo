import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BellRing,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Coins,
  ListChecks,
  Sparkles,
  X,
} from "lucide-react";
import type { CurrentUser } from "./types";

export interface ReleaseAnnouncement {
  id: string;
  title: string;
  intro: string;
  publishedLabel: string;
  targetEmails?: string[];
  sections: Array<{
    title: string;
    summary: string;
    details: string[];
  }>;
}

export const CURRENT_RELEASE_ANNOUNCEMENT: ReleaseAnnouncement = {
  id: "2026-10-flexible-payments",
  title: "What’s new in BayadTayoOpo 💜",
  intro: "Mas flexible na ang expenses at singilan.",
  publishedLabel: "October 2026",
  targetEmails: ["aplacadorjonathan0@gmail.com"],
  sections: [
    {
      title: "More ways to record expenses",
      summary: "More currencies, optional notes, and useful categories.",
      details: [
        "Record foreign-currency expenses with an editable suggested conversion.",
        "Choose from an expanded currency list.",
        "Add optional notes to expenses.",
        "Select a common category or specify your own.",
      ],
    },
    {
      title: "Clearer balances and payments",
      summary: "See how totals were calculated and where payments went.",
      details: [
        "Expand balances to see every expense and payment behind the total.",
        "Choose fewer transfers or return payments to the original payees.",
        "Review who paid whom and which expenses each payment covered.",
      ],
    },
    {
      title: "Better support for everyone",
      summary: "Admins can help temporary members settle correctly.",
      details: [
        "Record payments between temporary members.",
        "Confirm payments and approve balance offsets for members who have not created accounts yet.",
      ],
    },
    {
      title: "Deadlines and payment schedules",
      summary: "Plan installments and receive reminders at the right time.",
      details: [
        "Add optional expense deadlines with due and overdue reminders.",
        "Suggest weekly, biweekly, or monthly schedules for a balance or selected expenses.",
        "Accept, decline, or suggest changes before a schedule starts.",
        "Pause, resume, edit, withdraw, or end a schedule anytime.",
        "Scheduled reminders never record a payment automatically.",
      ],
    },
  ],
};

const SECTION_ICONS = [Coins, ListChecks, Sparkles, CalendarClock];

export function announcementIsAvailable(
  announcement: ReleaseAnnouncement,
  email: string,
): boolean {
  if (!announcement.targetEmails?.length) return true;
  const normalized = email.trim().toLowerCase();
  return announcement.targetEmails.some(
    (target) => target.trim().toLowerCase() === normalized,
  );
}

export function ReleaseAnnouncementBody({
  announcement,
  emailOptIn,
  onEmailOptInChange,
  showEmailPreference = true,
}: {
  announcement: ReleaseAnnouncement;
  emailOptIn: boolean;
  onEmailOptInChange: (enabled: boolean) => void;
  showEmailPreference?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-accent p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {announcement.publishedLabel}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          {announcement.intro}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {announcement.sections.map((section, index) => {
          const Icon = SECTION_ICONS[index] ?? Sparkles;
          return (
            <article key={section.title} className="rounded-2xl border border-border p-3.5">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon size={17} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{section.summary}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
        aria-expanded={detailsOpen}
      >
        {detailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {detailsOpen ? "Hide details" : "View all details"}
      </button>

      {detailsOpen && (
        <div className="space-y-4 rounded-2xl bg-muted/60 p-4">
          {announcement.sections.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <ul className="mt-2 space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                {section.details.map((detail) => (
                  <li key={detail} className="list-disc">{detail}</li>
                ))}
              </ul>
            </section>
          ))}
          <section>
            <h3 className="text-sm font-semibold text-foreground">Also new</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Report a problem or send feedback directly from the app, with an optional screenshot.
            </p>
          </section>
        </div>
      )}

      {showEmailPreference && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
          <input
            type="checkbox"
            checked={emailOptIn}
            onChange={(event) => onEmailOptInChange(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <BellRing size={15} className="text-primary" />
              Email me occasional product updates
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              Optional and separate from payment reminders. Change this anytime in Profile → Notifications.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

export function ReleaseAnnouncementPrompt({
  user,
  enabled,
  onUpdateUser,
}: {
  user: CurrentUser;
  enabled: boolean;
  onUpdateUser: (user: CurrentUser) => void;
}) {
  const announcement = CURRENT_RELEASE_ANNOUNCEMENT;
  const available = announcementIsAvailable(announcement, user.email);
  const alreadySeen = (user.seenAnnouncementIds ?? []).includes(announcement.id);
  const [open, setOpen] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(
    user.productUpdateEmailsEnabled === true,
  );

  useEffect(() => {
    if (!enabled || !available || alreadySeen) return;
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [enabled, available, alreadySeen]);

  function finish() {
    setOpen(false);
    onUpdateUser({
      ...user,
      productUpdateEmailsEnabled: emailOptIn,
      seenAnnouncementIds: [
        ...new Set([...(user.seenAnnouncementIds ?? []), announcement.id]),
      ],
    });
  }

  if (!available || alreadySeen) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && finish()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-3 bottom-3 z-[80] max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-3xl bg-card p-5 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-3rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-xl font-bold text-foreground">
                {announcement.title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                A quick look at the latest improvements.
              </Dialog.Description>
            </div>
            <button type="button" onClick={finish} className="rounded-full bg-muted p-2" aria-label="Close announcement">
              <X size={18} />
            </button>
          </div>
          <div className="mt-5">
            <ReleaseAnnouncementBody
              announcement={announcement}
              emailOptIn={emailOptIn}
              onEmailOptInChange={setEmailOptIn}
            />
          </div>
          <button type="button" onClick={finish} className="mt-5 w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground">
            Got it
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
