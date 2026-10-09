import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Link2,
  MousePointer2,
  Plus,
  QrCode,
  Receipt,
  Signal,
  UserPlus,
  Wifi,
} from "lucide-react";

const STEPS = [
  ["create", "Step 1", "Create the group", "Start the trip fund in seconds—ikaw muna ang bahala."],
  ["members", "Step 2", "Add everyone by name", "No accounts or email addresses needed yet."],
  ["expense", "Step 3", "Track expenses right away", "Temporary members can already be included in every split."],
  ["share", "Step 4", "Share when they’re ready", "Send one QR code or link through any messaging app."],
  ["claim", "Step 5", "They pick up where you started", "Their existing expenses and balance connect after sign-in."],
] as const;

type DemoStep = (typeof STEPS)[number][0];

const MEMBERS = [
  ["Alex", "A", "bg-sky-100 text-sky-700"],
  ["Sam", "S", "bg-amber-100 text-amber-700"],
  ["Mika", "M", "bg-rose-100 text-rose-700"],
] as const;

export function LandingDemo() {
  const [step, setStep] = useState<DemoStep>("create");
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [resumeVersion, setResumeVersion] = useState(0);
  const [resumeDelay, setResumeDelay] = useState(1800);
  const stepIndex = STEPS.findIndex(([id]) => id === step);
  const active = STEPS[stepIndex];

  useEffect(() => {
    const timeout = window.setTimeout(() => setAutoPlaying(true), resumeDelay);
    return () => window.clearTimeout(timeout);
  }, [resumeDelay, resumeVersion]);

  useEffect(() => {
    if (!autoPlaying) return;
    const interval = window.setInterval(() => {
      setStep((current) => {
        const index = STEPS.findIndex(([id]) => id === current);
        return STEPS[(index + 1) % STEPS.length][0];
      });
    }, 7000);
    return () => window.clearInterval(interval);
  }, [autoPlaying]);

  function selectStep(next: DemoStep) {
    setStep(next);
    setAutoPlaying(false);
    setResumeDelay(5000);
    setResumeVersion((version) => version + 1);
  }

  return (
    <section id="demo" className="px-4 pb-12 lg:w-full lg:px-0 lg:pb-0">
      <div className="mb-3 px-2 lg:mb-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">See it in action</p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
            <span className={`size-1.5 rounded-full ${autoPlaying ? "animate-pulse bg-green-500" : "bg-muted-foreground/40"}`} />
            {autoPlaying ? "Auto demo" : "Paused"}
          </span>
        </div>
        <h2 className="mt-1 text-xl font-semibold text-foreground">Add now. Track now. Invite later.</h2>
        <p className="mt-1 text-sm text-muted-foreground">A mobile walkthrough from setup to a claimed profile.</p>
      </div>

      <div className="landing-demo-panel relative h-[600px] overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_top,hsl(var(--accent)),hsl(var(--background))_65%)] shadow-xl shadow-black/5 sm:h-[620px] lg:h-[555px]">
        <div className="px-5 pb-3 pt-4 text-center lg:hidden">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{active[1]}</p>
          <p className="mt-1 text-base font-semibold text-foreground">{active[2]}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{active[3]}</p>
        </div>

        <div className="lg:grid lg:h-[500px] lg:grid-cols-[minmax(210px,0.85fr)_minmax(240px,1.15fr)] lg:items-center lg:gap-5 lg:px-7">
          <div className="hidden lg:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{active[1]}</p>
            <h3 className="mt-2 text-2xl font-semibold leading-tight text-foreground">{active[2]}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{active[3]}</p>
            <div className="mt-6 space-y-2">
              {STEPS.map(([id, eyebrow, title], index) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectStep(id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${step === id ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "bg-card/70 text-muted-foreground hover:bg-card"}`}
                >
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold ${step === id ? "bg-white/20" : "bg-accent text-primary"}`}>{index + 1}</span>
                  <span className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-wide opacity-70">{eyebrow}</span><span className="block truncate text-xs font-semibold">{title}</span></span>
                </button>
              ))}
            </div>
          </div>

          <div className="mx-auto w-[250px] overflow-hidden rounded-[2.1rem] border-[5px] border-slate-900 bg-card shadow-2xl sm:w-[258px] lg:w-[228px]">
            <MobileStatusBar />
            <div key={step} className="landing-demo-phone-screen h-[430px] overflow-hidden animate-in fade-in slide-in-from-right-3 duration-700 sm:h-[445px] lg:h-[380px]">
              {step === "create" && <CreateScene autoPlaying={autoPlaying} />}
              {step === "members" && <MembersScene autoPlaying={autoPlaying} />}
              {step === "expense" && <ExpenseScene autoPlaying={autoPlaying} />}
              {step === "share" && <ShareScene autoPlaying={autoPlaying} />}
              {step === "claim" && <ClaimScene autoPlaying={autoPlaying} />}
            </div>
            <div className="flex h-6 items-center justify-center bg-card">
              <span className="h-1 w-20 rounded-full bg-slate-900" />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => selectStep(STEPS[(stepIndex - 1 + STEPS.length) % STEPS.length][0])}
          className="absolute left-3 top-1/2 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/95 text-foreground shadow-lg backdrop-blur active:scale-95 lg:hidden"
          aria-label="Previous demo step"
        >
          <ArrowLeft size={17} />
        </button>
        <button
          type="button"
          onClick={() => selectStep(STEPS[(stepIndex + 1) % STEPS.length][0])}
          className="absolute right-3 top-1/2 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/95 text-foreground shadow-lg backdrop-blur active:scale-95 lg:hidden"
          aria-label="Next demo step"
        >
          <ArrowRight size={17} />
        </button>

      </div>
    </section>
  );
}

function MobileStatusBar() {
  return (
    <div className="relative flex h-7 items-center justify-between bg-card px-4 text-[8px] font-bold text-foreground">
      <span>9:41</span>
      <span className="absolute left-1/2 top-1 h-4 w-16 -translate-x-1/2 rounded-full bg-slate-900" />
      <span className="flex items-center gap-1"><Signal size={9} /><Wifi size={9} /><span className="h-2 w-3 rounded-[2px] border border-current" /></span>
    </div>
  );
}

function DemoTap({ className = "" }: { className?: string }) {
  return (
    <span className={`pointer-events-none absolute text-primary ${className}`} aria-hidden="true">
      <span className="absolute -inset-2 rounded-full bg-primary/20 animate-ping [animation-duration:1.8s]" />
      <MousePointer2 size={14} className="relative" />
    </span>
  );
}

function AppHeader({ subtitle = "4 people · PHP" }: { subtitle?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
      <div><p className="text-xs font-bold text-foreground">Weekend Getaway</p><p className="text-[8px] text-muted-foreground">{subtitle}</p></div>
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-[8px] font-bold text-primary-foreground">WG</span>
    </div>
  );
}

function CreateScene({ autoPlaying }: { autoPlaying: boolean }) {
  return (
    <div className="h-full bg-card">
      <div className="pt-2"><span className="mx-auto block h-1 w-9 rounded-full bg-border" /></div>
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5"><p className="text-xs font-semibold">New Group</p><span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] text-muted-foreground">×</span></div>
      <div className="space-y-2.5 p-3.5">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary text-[9px] font-bold text-primary-foreground shadow-sm">WG</div>
        <Field label="Group name" value="Weekend Getaway" active />
        <Field label="Currency" value="PHP — Philippine Peso  ⌄" />
        <div><p className="mb-1 text-[8px] font-medium text-muted-foreground">Members joining later <span className="opacity-70">(optional)</span></p><div className="flex gap-1.5"><div className="flex-1 rounded-xl border border-border px-3 py-2 text-[9px] text-muted-foreground">Member name</div><span className="grid size-8 place-items-center rounded-xl bg-accent text-primary"><UserPlus size={12} /></span></div></div>
        <button className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[10px] font-semibold text-primary-foreground"><Plus size={13} /> Create group{autoPlaying && <DemoTap className="right-7 text-white" />}</button>
      </div>
    </div>
  );
}

function MembersScene({ autoPlaying }: { autoPlaying: boolean }) {
  return (
    <div className="h-full bg-card">
      <AppHeader />
      <div className="p-3.5">
        <div className="flex items-center justify-between"><div><p className="text-xs font-semibold">Add members</p><p className="text-[8px] text-muted-foreground">Names are enough for now.</p></div><UserPlus size={16} className="text-primary" /></div>
        <div className="mt-3 flex gap-2"><div className="flex-1 rounded-xl border border-primary/35 px-3 py-2 text-[10px]">Mika</div><button className="relative grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground"><Plus size={14} />{autoPlaying && <DemoTap className="-right-1 -top-1" />}</button></div>
        <div className="mt-3 space-y-1.5"><MemberRow name="You" initial="Y" joined />{MEMBERS.map(([name, initial, color]) => <MemberRow key={name} name={name} initial={initial} color={color} />)}</div>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[8px] leading-relaxed text-amber-800">Pending members can already be included in expenses and balances.</div>
      </div>
    </div>
  );
}

function MemberRow({ name, initial, color = "bg-accent text-primary", joined = false }: { name: string; initial: string; color?: string; joined?: boolean }) {
  return <div className="flex items-center gap-2 rounded-xl border border-border px-2.5 py-2"><span className={`grid size-7 place-items-center rounded-full text-[8px] font-bold ${color}`}>{initial}</span><p className="flex-1 text-[10px] font-semibold">{name}</p><span className={`rounded-full px-1.5 py-0.5 text-[7px] font-semibold ${joined ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{joined ? "Joined" : "Pending"}</span></div>;
}

function ExpenseScene({ autoPlaying }: { autoPlaying: boolean }) {
  return (
    <div className="h-full bg-card">
      <AppHeader />
      <div className="space-y-2.5 p-3.5">
        <div className="flex items-center gap-2"><Receipt size={14} className="text-primary" /><p className="text-xs font-semibold">Add expense</p></div>
        <div className="grid grid-cols-[1fr_0.7fr] gap-2"><Field label="Expense" value="Beach house" /><Field label="Amount" value="₱8,000" /></div>
        <Field label="Initially paid by" value="You" />
        <div><div className="flex justify-between"><p className="text-[8px] text-muted-foreground">Split between</p><p className="text-[8px] font-semibold text-primary">₱2,000 each</p></div><div className="mt-1.5 grid grid-cols-4 gap-1.5">{[["You", "Y"], ...MEMBERS.map(([name, initial]) => [name, initial])].map(([name, initial], index) => <div key={name} className="relative rounded-lg border border-primary/25 bg-accent p-1.5 text-center"><span className="mx-auto grid size-6 place-items-center rounded-full bg-card text-[7px] font-bold text-primary">{initial}</span><p className="mt-1 truncate text-[7px] font-semibold">{name}</p><CheckCircle2 size={9} className="absolute right-0.5 top-0.5 text-primary" />{index > 0 && <span className="text-[6px] text-amber-700">Pending</span>}</div>)}</div></div>
        <button className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[10px] font-semibold text-primary-foreground"><Check size={13} /> Save expense{autoPlaying && <DemoTap className="right-7 text-white" />}</button>
        <p className="text-center text-[8px] text-muted-foreground">No one had to sign up before you recorded this.</p>
      </div>
    </div>
  );
}

function Field({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return <div><p className="mb-1 text-[8px] font-medium text-muted-foreground">{label}</p><div className={`rounded-xl border bg-input-background px-3 py-2.5 text-[10px] font-semibold ${active ? "border-primary/35 ring-2 ring-primary/10" : "border-border"}`}>{value}</div></div>;
}

function ShareScene({ autoPlaying }: { autoPlaying: boolean }) {
  return (
    <div className="h-full bg-card"><AppHeader /><div className="p-3.5 text-center"><p className="text-xs font-semibold">Bring everyone into the group</p><p className="mt-1 text-[8px] text-muted-foreground">No email invite required.</p><div className="mx-auto mt-3 grid size-32 place-items-center rounded-2xl border border-primary/20 bg-white p-3 shadow-sm"><QrCode size={82} className="text-slate-900" /></div><div className="mt-3 grid grid-cols-2 gap-2"><button className="relative flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-[9px] font-semibold text-white"><Link2 size={12} /> Share link{autoPlaying && <DemoTap className="right-1 top-0 text-white" />}</button><button className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-[9px] font-semibold"><Copy size={12} /> Copy link</button></div><div className="mt-3 rounded-xl bg-accent p-2.5 text-[8px] leading-relaxed text-muted-foreground">Share through Messenger, Viber, WhatsApp, or anywhere your group already talks.</div></div></div>
  );
}

function ClaimScene({ autoPlaying }: { autoPlaying: boolean }) {
  return (
    <div className="h-full bg-card"><div className="bg-primary px-4 py-4 text-white"><p className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/70">BayadTayoOpo invite</p><p className="mt-1.5 text-base font-bold">You’ve been invited, Alex</p><p className="mt-0.5 text-[9px] text-white/75">Weekend Getaway</p></div><div className="space-y-3 p-3.5"><div className="rounded-2xl border border-border p-3"><div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-700">A</span><div className="flex-1"><p className="text-[10px] font-semibold">Is this you?</p><p className="text-[8px] text-muted-foreground">Alex · pending member</p></div><CheckCircle2 size={16} className="text-green-600" /></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-accent p-2.5"><p className="text-[7px] text-muted-foreground">Already included in</p><p className="mt-1 text-[10px] font-bold">1 expense</p></div><div className="rounded-xl bg-accent p-2.5"><p className="text-[7px] text-muted-foreground">Current balance</p><p className="mt-1 text-[10px] font-bold text-destructive">Owes ₱2,000</p></div></div></div><button className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[10px] font-semibold text-white"><Check size={13} /> Claim my profile{autoPlaying && <DemoTap className="right-7 text-white" />}</button><div className="rounded-xl bg-green-50 p-2.5 text-center text-[8px] font-medium leading-relaxed text-green-800">Expenses, balances, and payment history connect automatically.</div></div></div>
  );
}
