import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  FileCheck2,
  FileSpreadsheet,
  MessageCircle,
  MoreVertical,
  MousePointer2,
  Plus,
  QrCode,
  Share2,
  Smartphone,
  Upload,
  UserPlus,
  X,
} from "lucide-react";

const DEMO_TABS = [
  { id: "expenses", label: "Expenses" },
  { id: "balances", label: "Balances" },
  { id: "settle", label: "Settle Up" },
  { id: "chat", label: "Chat" },
] as const;

type DemoTab = (typeof DEMO_TABS)[number]["id"];
type DemoScene =
  | DemoTab
  | "addExpense"
  | "csv"
  | "install"
  | "members"
  | "instructions"
  | "proof";

const DEMO_SCENES: DemoScene[] = [
  "expenses",
  "addExpense",
  "balances",
  "members",
  "settle",
  "instructions",
  "proof",
  "chat",
  "csv",
  "install",
];

const DEMO_SCENE_LABELS: Record<DemoScene, string> = {
  expenses: "Expenses",
  addExpense: "Add expense",
  csv: "CSV tools",
  install: "Install on mobile",
  members: "Manage members",
  balances: "Balances",
  settle: "Settle Up",
  instructions: "Payment instructions",
  proof: "Payment proof",
  chat: "Chat",
};

export function LandingDemo() {
  const [demoScene, setDemoScene] = useState<DemoScene>("expenses");
  const [demoAutoPlaying, setDemoAutoPlaying] = useState(false);
  const [demoIdleVersion, setDemoIdleVersion] = useState(0);
  const [demoResumeDelay, setDemoResumeDelay] = useState(1000);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDemoScene((current) => {
        const index = DEMO_SCENES.indexOf(current);
        return DEMO_SCENES[(index + 1) % DEMO_SCENES.length];
      });
      setDemoAutoPlaying(true);
    }, demoResumeDelay);
    return () => window.clearTimeout(timeout);
  }, [demoIdleVersion, demoResumeDelay]);

  useEffect(() => {
    if (!demoAutoPlaying) return;
    const interval = window.setInterval(() => {
      setDemoScene((current) => {
        const index = DEMO_SCENES.indexOf(current);
        return DEMO_SCENES[(index + 1) % DEMO_SCENES.length];
      });
    }, 6500);
    return () => window.clearInterval(interval);
  }, [demoAutoPlaying]);

  function selectDemoTab(tab: DemoTab) {
    selectDemoScene(tab);
  }

  function selectDemoScene(scene: DemoScene) {
    setDemoAutoPlaying(false);
    setDemoScene(scene);
    setDemoResumeDelay(5000);
    setDemoIdleVersion((version) => version + 1);
  }

  const activeDemoTab: DemoTab =
    demoScene === "members" ||
    demoScene === "addExpense" ||
    demoScene === "csv" ||
    demoScene === "install"
      ? "expenses"
      : demoScene === "instructions" || demoScene === "proof"
        ? "settle"
        : demoScene;

  return (
        <section id="demo" className="px-4 pb-12 lg:px-0 lg:pb-0">
          <div className="mb-4 px-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Preview
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                <span
                  className={`size-1.5 rounded-full ${demoAutoPlaying ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`}
                />
                {demoAutoPlaying ? "Auto demo" : "Waiting for you"}
              </span>
            </div>
            <h2 className="mt-1 text-xl font-semibold text-foreground">
              Ganito lang kasimple
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap the tabs or carousel dots to explore a sample barkada trip.
            </p>
          </div>

          <div className="relative h-[540px] overflow-hidden rounded-3xl border border-border bg-card shadow-xl shadow-black/5 sm:h-[560px]">
            {demoScene === "members" ? (
              <div className="h-full overflow-hidden bg-card pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-center pt-3">
                  <span className="h-1 w-10 rounded-full bg-border" />
                </div>
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      Manage members
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Boracay Trip
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectDemoTab("expenses")}
                    className="relative rounded-full p-2 text-muted-foreground hover:bg-muted"
                    aria-label="Close manage members demo"
                  >
                    <X size={17} />
                    {demoAutoPlaying && (
                      <span
                        className="absolute right-0 top-0 text-primary"
                        aria-hidden="true"
                      >
                        <span className="absolute -inset-1 rounded-full bg-primary/20 animate-ping [animation-duration:1.6s]" />
                        <MousePointer2 size={11} className="relative" />
                      </span>
                    )}
                  </button>
                </div>

                <div className="space-y-4 p-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Current members
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Manage roles or remove people from the group.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {[
                      ["Y", "You", "Group owner", "Owner"],
                      ["J", "Julianne", "Member", "Make admin"],
                    ].map(([initial, name, role, action]) => (
                      <div
                        key={name}
                        className="flex items-center gap-3 rounded-xl border border-border p-3"
                      >
                        <span className="grid size-9 place-items-center rounded-full bg-accent text-xs font-bold text-primary">
                          {initial}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">
                            {name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {role}
                          </p>
                        </div>
                        <span
                          className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${
                            action === "Owner"
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary text-primary-foreground"
                          }`}
                        >
                          {action}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Add now, let them join later
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Record expenses without waiting for sign-ups.
                        </p>
                      </div>
                      <UserPlus size={18} className="text-primary" />
                    </div>
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                          C
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">
                            Camille
                          </p>
                          <p className="text-[11px] font-medium text-amber-700">
                            Pending · already included in expenses
                          </p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700">
                          Pending
                        </span>
                      </div>
                      <button
                        type="button"
                        className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground"
                      >
                        <QrCode size={14} /> Share personal claim invite
                        {demoAutoPlaying && (
                          <span
                            className="absolute right-5 text-white"
                            aria-hidden="true"
                          >
                            <span className="absolute -inset-1 rounded-full bg-white/40 animate-ping [animation-duration:1.6s]" />
                            <MousePointer2 size={12} className="relative" />
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : demoScene === "addExpense" ? (
              <div className="h-full overflow-hidden bg-card pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-center pt-3">
                  <span className="h-1 w-10 rounded-full bg-border" />
                </div>
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      Add Expense
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Boracay Trip
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectDemoTab("expenses")}
                    className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    aria-label="Close add expense demo"
                  >
                    <X size={17} />
                  </button>
                </div>

                <div className="space-y-3 p-4">
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                      Description
                    </p>
                    <div className="rounded-xl border border-primary/30 bg-input-background px-3.5 py-2.5 text-sm font-medium text-foreground ring-2 ring-primary/10">
                      Dinner at the beach
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                      Amount (PHP)
                    </p>
                    <div className="flex items-center rounded-xl border border-border bg-input-background px-3.5 py-2.5">
                      <span className="mr-2 text-sm text-muted-foreground">
                        ₱
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        2,400.00
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-[10px] text-muted-foreground">
                        Paid by
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-foreground">
                        You
                      </p>
                    </div>
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-[10px] text-muted-foreground">Split</p>
                      <p className="mt-0.5 text-xs font-semibold text-foreground">
                        Equally
                      </p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Included members
                      </p>
                      <p className="text-[10px] font-semibold text-primary">
                        ₱600 each
                      </p>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[
                        ["Y", "You"],
                        ["J", "Julianne"],
                        ["M", "Marco"],
                        ["C", "Camille"],
                      ].map(([initial, name]) => (
                        <div
                          key={name}
                          className="relative rounded-xl border border-primary/25 bg-accent p-2 text-center"
                        >
                          <span className="mx-auto grid size-7 place-items-center rounded-full bg-card text-[10px] font-bold text-primary">
                            {initial}
                          </span>
                          <p className="mt-1 truncate text-[9px] font-semibold text-foreground">
                            {name}
                          </p>
                          <CheckCircle2
                            size={12}
                            className="absolute right-1 top-1 text-primary"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[10px] text-amber-700">
                      Camille is pending, but can already be included.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectDemoTab("expenses")}
                    className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-semibold text-primary-foreground"
                  >
                    <Check size={15} /> Save Expense
                    {demoAutoPlaying && (
                      <span
                        className="absolute right-8 text-white"
                        aria-hidden="true"
                      >
                        <span className="absolute -inset-1 rounded-full bg-white/40 animate-ping [animation-duration:1.6s]" />
                        <MousePointer2 size={12} className="relative" />
                      </span>
                    )}
                  </button>
                </div>
              </div>
            ) : demoScene === "csv" ? (
              <div className="h-full overflow-hidden bg-card pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-center pt-3">
                  <span className="h-1 w-10 rounded-full bg-border" />
                </div>
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      CSV Tools
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Boracay Trip
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectDemoTab("expenses")}
                    className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    aria-label="Close CSV tools demo"
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="space-y-3 p-4">
                  <div className="rounded-2xl bg-accent p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-xl bg-card">
                        <FileSpreadsheet size={19} className="text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Bring your spreadsheet
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Import expenses in bulk or keep an offline copy.
                        </p>
                      </div>
                    </div>
                  </div>
                  {[
                    [
                      Download,
                      "Download Template",
                      "Start with the correct columns",
                    ],
                    [
                      Upload,
                      "Import Expenses CSV",
                      "Add multiple expenses at once",
                    ],
                    [
                      FileSpreadsheet,
                      "Export Expenses CSV",
                      "Download the group expense history",
                    ],
                  ].map(([Icon, title, copy]) => {
                    const CsvIcon = Icon as typeof Download;
                    return (
                      <button
                        key={String(title)}
                        type="button"
                        className="relative flex w-full items-center gap-3 rounded-2xl border border-border bg-input-background p-4 text-left"
                      >
                        <CsvIcon size={18} className="shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-foreground">
                            {String(title)}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {String(copy)}
                          </span>
                        </span>
                        <ArrowRight
                          size={14}
                          className="text-muted-foreground"
                        />
                        {demoAutoPlaying && title === "Import Expenses CSV" && (
                          <span
                            className="absolute right-7 text-primary"
                            aria-hidden="true"
                          >
                            <span className="absolute -inset-1 rounded-full bg-primary/20 animate-ping [animation-duration:1.6s]" />
                            <MousePointer2 size={12} className="relative" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <p className="px-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                    Admins can import. Every member can download a template or
                    export the expense history.
                  </p>
                </div>
              </div>
            ) : demoScene === "install" ? (
              <div className="h-full overflow-hidden bg-card pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-center pt-3">
                  <span className="h-1 w-10 rounded-full bg-border" />
                </div>
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      Install on your phone
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      No App Store or Play Store needed
                    </p>
                  </div>
                  <div className="grid size-9 place-items-center rounded-xl bg-accent">
                    <Smartphone size={18} className="text-primary" />
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className="rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          iPhone · Safari
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Open bayadtayoopo.web.app in Safari
                        </p>
                      </div>
                      <Share2 size={18} className="text-primary" />
                    </div>
                    <div className="mt-3 space-y-2">
                      {[
                        ["1", "Tap the Share button"],
                        ["2", "Choose Add to Home Screen"],
                        ["3", "Tap Add"],
                      ].map(([number, instruction]) => (
                        <div key={number} className="flex items-center gap-2.5">
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-bold text-primary">
                            {number}
                          </span>
                          <span className="text-[11px] font-medium text-foreground">
                            {instruction}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Android · Chrome
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Open bayadtayoopo.web.app in Chrome
                        </p>
                      </div>
                      <MoreVertical size={18} className="text-primary" />
                    </div>
                    <div className="mt-3 space-y-2">
                      {[
                        ["1", "Open the browser menu (⋮)"],
                        ["2", "Tap Install app"],
                        ["3", "Confirm Install"],
                      ].map(([number, instruction]) => (
                        <div key={number} className="flex items-center gap-2.5">
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-bold text-primary">
                            {number}
                          </span>
                          <span className="text-[11px] font-medium text-foreground">
                            {instruction}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-semibold text-primary-foreground">
                    <Download size={15} /> Use it like a regular app
                    {demoAutoPlaying && (
                      <span
                        className="absolute right-8 text-white"
                        aria-hidden="true"
                      >
                        <span className="absolute -inset-1 rounded-full bg-white/40 animate-ping [animation-duration:1.6s]" />
                        <MousePointer2 size={12} className="relative" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col pb-8">
                <div className="p-5 bg-gradient-to-br from-primary to-[#796df8] text-primary-foreground">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">Boracay Trip 🏝️</p>
                      <p className="mt-1 text-xs text-primary-foreground/75">
                        4 friends · 6 expenses
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => selectDemoScene("members")}
                        className="relative flex -space-x-2 rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                        aria-label="Open Manage Members demo"
                      >
                        {["J", "D", "M", "A"].map((name, index) => (
                          <span
                            key={name}
                            className="grid size-8 place-items-center rounded-full border-2 border-primary bg-card text-[10px] font-bold text-primary"
                            style={{ zIndex: 4 - index }}
                          >
                            {name}
                          </span>
                        ))}
                        {demoAutoPlaying && demoScene === "balances" && (
                          <span
                            className="absolute -bottom-2 right-0 z-10 text-white"
                            aria-hidden="true"
                          >
                            <span className="absolute -inset-1 rounded-full bg-white/40 animate-ping [animation-duration:1.6s]" />
                            <MousePointer2
                              size={14}
                              className="relative drop-shadow-md"
                            />
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => selectDemoScene("csv")}
                        className="relative grid size-8 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                        aria-label="Open CSV tools demo"
                      >
                        <MoreVertical size={16} />
                        {demoAutoPlaying && demoScene === "chat" && (
                          <span
                            className="absolute -bottom-2 right-0 text-white"
                            aria-hidden="true"
                          >
                            <span className="absolute -inset-1 rounded-full bg-white/40 animate-ping [animation-duration:1.6s]" />
                            <MousePointer2 size={13} className="relative" />
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="mt-5 flex items-end justify-between">
                    <div>
                      <p className="text-[11px] text-primary-foreground/70">
                        Group total
                      </p>
                      <p className="text-2xl font-semibold">₱12,480.00</p>
                    </div>
                    <span className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold">
                      2 pending
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-4 border-b border-border bg-card p-1.5">
                  {DEMO_TABS.map(({ id, label }) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => selectDemoTab(id)}
                      aria-pressed={activeDemoTab === id}
                      className={`relative rounded-xl py-2.5 text-xs font-semibold transition-colors ${
                        activeDemoTab === id
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {label}
                      {demoAutoPlaying && demoScene === id && (
                        <span
                          className="absolute right-2 top-1.5 text-primary"
                          aria-hidden="true"
                        >
                          <span className="absolute -inset-1 rounded-full bg-primary/20 animate-ping [animation-duration:1.6s]" />
                          <MousePointer2
                            size={12}
                            className="relative drop-shadow-sm"
                          />
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="min-h-0 flex-1 overflow-hidden p-4 pb-10">
                  {demoScene === "expenses" && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-right-2 duration-500">
                      {[
                        ["🍕", "Pizza night", "Paid by Julianne", "₱1,998"],
                        ["🚐", "Airport van", "Paid by Marco", "₱2,400"],
                        ["🏨", "Beach hotel", "Paid by You", "₱8,082"],
                      ].map(([icon, title, detail, amount]) => (
                        <div
                          key={title}
                          className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3"
                        >
                          <span className="grid size-10 place-items-center rounded-xl bg-card text-lg">
                            {icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">
                              {title}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {detail}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-foreground">
                            {amount}
                          </p>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => selectDemoScene("addExpense")}
                        className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-semibold text-primary-foreground"
                      >
                        <Plus size={15} /> Add Expense
                        {demoAutoPlaying && (
                          <span
                            className="absolute right-8 text-white"
                            aria-hidden="true"
                          >
                            <span className="absolute -inset-1 rounded-full bg-white/40 animate-ping [animation-duration:1.6s]" />
                            <MousePointer2 size={12} className="relative" />
                          </span>
                        )}
                      </button>
                    </div>
                  )}

                  {demoScene === "balances" && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-right-2 duration-500">
                      {[
                        ["You", "gets back", "+₱1,240", "text-green-600"],
                        [
                          "Julianne",
                          "unpaid share",
                          "−₱540",
                          "text-destructive",
                        ],
                        ["Marco", "unpaid share", "−₱700", "text-destructive"],
                      ].map(([name, status, amount, color]) => (
                        <div
                          key={name}
                          className="flex items-center gap-3 rounded-2xl border border-border p-3"
                        >
                          <span className="grid size-9 place-items-center rounded-full bg-accent text-xs font-bold text-primary">
                            {name[0]}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-foreground">
                              {name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {status}
                            </p>
                          </div>
                          <p className={`text-sm font-semibold ${color}`}>
                            {amount}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {demoScene === "settle" && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-500">
                      <div className="rounded-2xl border border-border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              Julianne pays You
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              GCash · Awaiting payment
                            </p>
                          </div>
                          <p className="font-semibold text-foreground">₱540</p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              Marco pays You
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Bank transfer
                            </p>
                          </div>
                          <p className="font-semibold text-foreground">₱700</p>
                        </div>
                      </div>
                      <p className="text-center text-xs text-muted-foreground">
                        Walang hulaan. Everyone knows what to pay.
                      </p>
                    </div>
                  )}

                  {demoScene === "instructions" && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-500">
                      <div className="flex items-center gap-3">
                        <div className="grid size-10 place-items-center rounded-xl bg-accent">
                          <CreditCard size={19} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Your payment instructions
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Tell members exactly where to send payment.
                          </p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Method
                              </p>
                              <p className="text-sm font-semibold text-foreground">
                                BPI Bank Transfer
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Account
                              </p>
                              <p className="text-xs text-foreground">
                                Juan Dela Cruz · 1234 5678 90
                              </p>
                            </div>
                          </div>
                          <div className="grid size-16 place-items-center rounded-xl border border-primary/20 bg-accent">
                            <QrCode size={36} className="text-primary" />
                          </div>
                        </div>
                      </div>
                      <p className="text-center text-[11px] text-muted-foreground">
                        Bank, e-wallet, account details, notes, and payment QR.
                      </p>
                    </div>
                  )}

                  {demoScene === "proof" && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-500">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Payment submitted
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Julianne sent ₱540.00 via GCash.
                          </p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                          For review
                        </span>
                      </div>
                      <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
                        <div className="grid size-14 place-items-center rounded-xl bg-gradient-to-br from-[#eef0ff] to-[#d8dcff]">
                          <FileCheck2 size={25} className="text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground">
                            GCash receipt attached
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Ref. 8452 1093 6621 · “Pizza share”
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold text-primary">
                          View
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="rounded-xl border border-destructive/20 bg-destructive/5 py-2.5 text-xs font-semibold text-destructive"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="rounded-xl bg-green-600 py-2.5 text-xs font-semibold text-white"
                        >
                          Confirm paid
                        </button>
                      </div>
                    </div>
                  )}

                  {demoScene === "chat" && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Group chat
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Keep plans and payment updates with the group.
                          </p>
                        </div>
                        <MessageCircle size={18} className="text-primary" />
                      </div>
                      <div className="flex items-end gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                          J
                        </span>
                        <div className="max-w-[78%] rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2.5">
                          <p className="text-[10px] font-semibold text-amber-700">
                            Julianne
                          </p>
                          <p className="mt-0.5 text-xs text-foreground">
                            Sent my GCash payment! Receipt is attached 😊
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="max-w-[78%] rounded-2xl rounded-br-md bg-primary px-3 py-2.5 text-primary-foreground">
                          <p className="text-xs">
                            Got it—I’ll confirm it now. Salamat!
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl bg-input-background px-3 py-2.5 text-xs text-muted-foreground">
                        <span className="flex-1">Message the group…</span>
                        <ArrowRight size={14} className="text-primary" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div
              className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-center gap-2 bg-gradient-to-t from-card via-card to-transparent px-4 pb-3 pt-5"
              aria-label="Demo carousel navigation"
            >
              {DEMO_SCENES.map((scene) => (
                <button
                  key={scene}
                  type="button"
                  onClick={() => selectDemoScene(scene)}
                  aria-label={`Show ${DEMO_SCENE_LABELS[scene]} demo`}
                  aria-current={demoScene === scene ? "step" : undefined}
                  className={`relative h-2 rounded-full transition-all duration-300 ${
                    demoScene === scene
                      ? "w-6 bg-primary"
                      : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                >
                  {demoAutoPlaying && demoScene === scene && (
                    <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping [animation-duration:1.6s]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

  );
}

