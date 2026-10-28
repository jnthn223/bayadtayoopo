import { Check, ChevronDown, Cloud, CloudOff, Clock3, Loader2, X } from "lucide-react";
import { useState } from "react";

export interface PendingSyncGroup {
  id: string;
  name: string;
  expenseNames: string[];
}

interface Props {
  online: boolean;
  pendingGroups: PendingSyncGroup[];
  cachedGroupCount: number;
  lastSyncedAt?: string;
  failedGroups?: Array<{ id: string; name: string; message: string }>;
}

function relativeTime(value?: string): string {
  if (!value) return "Not synced in this session yet";
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  if (elapsed < 60_000) return "Synced just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours} hr ago`;
  return `Last synced ${new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export function SyncStatus({ online, pendingGroups, cachedGroupCount, lastSyncedAt, failedGroups = [] }: Props) {
  const [open, setOpen] = useState(false);
  const pendingCount = pendingGroups.length;
  const state = !online ? "offline" : failedGroups.length > 0 ? "error" : pendingCount > 0 ? "saving" : cachedGroupCount > 0 ? "cached" : "synced";
  const label = state === "offline"
    ? "Offline"
    : state === "error"
      ? "Sync needs attention"
      : state === "saving"
      ? `Saving${pendingCount > 1 ? ` ${pendingCount}` : ""}…`
      : state === "cached"
        ? "Using cached data"
        : "Synced";
  const Icon = state === "offline" ? CloudOff : state === "saving" ? Loader2 : state === "cached" ? Clock3 : state === "error" ? CloudOff : Check;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`absolute bottom-20 right-4 z-30 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur ${
          state === "offline" || state === "error"
            ? "border-amber-300 bg-amber-50/95 text-amber-900"
            : state === "saving"
              ? "border-primary/20 bg-card/95 text-primary"
              : state === "cached"
                ? "border-border bg-card/95 text-muted-foreground"
                : "border-emerald-200 bg-emerald-50/95 text-emerald-700"
        }`}
        aria-label={`Sync status: ${label}`}
      >
        <Icon size={14} className={state === "saving" ? "animate-spin" : ""} />
        {label}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute inset-0 z-[80] flex items-end bg-black/35 sm:items-center sm:justify-center" role="presentation" onClick={() => setOpen(false)}>
          <section className="w-full rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:max-w-md sm:rounded-3xl" role="dialog" aria-modal="true" aria-labelledby="sync-status-title" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${online ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}`}>
                {online ? <Cloud size={19} /> : <CloudOff size={19} />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="sync-status-title" className="font-semibold text-foreground">{online ? "Group sync status" : "You’re offline"}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(lastSyncedAt)}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-muted p-2 text-foreground" aria-label="Close sync status"><X size={17} /></button>
            </div>

            {!online && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">You can keep viewing cached groups. Changes saved on this device will sync automatically after you reconnect.</p>}

            <div className="mt-4 space-y-2">
              {failedGroups.map((group) => (
                <div key={group.id} className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3">
                  <p className="text-sm font-semibold text-destructive">Couldn’t sync {group.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{group.message} Review the group before trying the change again.</p>
                </div>
              ))}
              {pendingGroups.length === 0 && failedGroups.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
                  <Check size={18} className="text-emerald-600" />
                  <div><p className="text-sm font-semibold text-foreground">No pending group changes</p><p className="text-xs text-muted-foreground">Everything received by the server is up to date.</p></div>
                </div>
              ) : pendingGroups.map((group) => (
                <div key={group.id} className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
                  <div className="flex items-center gap-2"><Loader2 size={15} className="animate-spin text-primary" /><p className="text-sm font-semibold text-foreground">{group.name}</p></div>
                  <p className="mt-1 text-xs text-muted-foreground">Waiting to sync{group.expenseNames.length ? ` · ${group.expenseNames.join(", ")}` : ""}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
