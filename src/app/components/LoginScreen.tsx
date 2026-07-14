import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  Mail,
  Loader2,
  MessageCircle,
  MoreVertical,
  QrCode,
  Receipt,
  Share2,
  Shield,
  Smartphone,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { sendMagicLink } from "../../lib/firebaseRest";
import type { AuthUser } from "../../lib/firebaseRest";
import { BrandMark, BrandWordmark } from "./Brand";
import { LandingDemo } from "./LandingDemo";
import { detectInAppBrowser } from "../../lib/inAppBrowser";

interface Props {
  onProfileNeeded: () => void; // unused but kept for API compat
  onGoogleSignIn: () => Promise<AuthUser>;
}

export function LoginScreen({ onGoogleSignIn }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [mobileInstallPromptOpen, setMobileInstallPromptOpen] = useState(false);
  const [mobileInstallGuideOpen, setMobileInstallGuideOpen] = useState(false);
  const [mobileInstallPlatform, setMobileInstallPlatform] = useState<
    "ios" | "android"
  >("android");
  const inAppBrowser = detectInAppBrowser();
  const isInAppBrowser = Boolean(inAppBrowser);

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & {
      standalone?: boolean;
    };
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone === true;
    const userAgent = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    const isMobile =
      isIOS ||
      /Android/i.test(userAgent) ||
      window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches;
    const wasDismissed =
      localStorage.getItem("bayadtayoopo:install-prompt-dismissed") === "true";

    if (!isMobile || isStandalone || isInAppBrowser || wasDismissed) return;

    setMobileInstallPlatform(isIOS ? "ios" : "android");
    const timeout = window.setTimeout(() => {
      setMobileInstallPromptOpen(true);
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [isInAppBrowser]);

  function scrollToSignIn() {
    document.getElementById("sign-in")?.scrollIntoView({ behavior: "smooth" });
  }

  function dismissMobileInstallPrompt() {
    localStorage.setItem("bayadtayoopo:install-prompt-dismissed", "true");
    setMobileInstallPromptOpen(false);
    setMobileInstallGuideOpen(false);
  }

  async function copyBrowserLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError(
        "Copying was blocked. Use the Share or ••• menu and choose Open in Browser.",
      );
    }
  }

  async function handleSend() {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }
    setError("");
    setLoading(true);

    // Preserve group/placeholder claim context when the email is opened elsewhere.
    const continueUrlValue = new URL(
      window.location.pathname,
      window.location.origin,
    );
    const joinGroupId = localStorage.getItem("pendingJoinGroupId");
    const claimMemberId = localStorage.getItem("pendingClaimMemberId");
    const claimCode = localStorage.getItem("pendingClaimCode");
    if (joinGroupId)
      continueUrlValue.searchParams.set("joinGroupId", joinGroupId);
    if (claimMemberId)
      continueUrlValue.searchParams.set("claimMemberId", claimMemberId);
    if (claimCode) continueUrlValue.searchParams.set("claimCode", claimCode);
    const continueUrl = continueUrlValue.toString();

    try {
      await sendMagicLink(trimmed, continueUrl);
      localStorage.setItem("emailForSignIn", trimmed);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send link");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    try {
      await onGoogleSignIn();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="landing-scroll h-full overflow-y-auto bg-background scroll-smooth">
      <div className="lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12 lg:max-w-6xl lg:mx-auto lg:px-10 lg:py-16">
        <section className="relative overflow-hidden px-6 pt-10 pb-12 text-center lg:px-0 lg:py-0 lg:text-left">
          <div className="absolute inset-x-8 top-16 h-56 rounded-full bg-accent blur-3xl opacity-80" />
          <div className="relative">
            <div className="flex items-center justify-center gap-3 lg:justify-start">
              <BrandMark className="w-12 h-12 rounded-2xl shadow-lg" />
              <BrandWordmark className="text-[1.45rem] text-foreground" />
            </div>
            <div className="inline-flex items-center gap-1.5 mt-8 px-3 py-1.5 rounded-full bg-card border border-border text-[11px] font-semibold text-primary shadow-sm">
              <Check size={13} /> Free to use · Walang password
            </div>
            <h1 className="mt-5 text-[2rem] leading-[1.15] font-semibold tracking-tight text-foreground lg:text-[3.4rem]">
              May nagbayad. May may utang.
              <span className="block mt-1 text-primary">
                Kami na bahala sa math.
              </span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground max-w-sm mx-auto lg:mx-0 lg:text-base">
              Track ambagan, shared expenses, and repayments without
              spreadsheets or awkward singilan.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <button
                type="button"
                onClick={scrollToSignIn}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
              >
                Sign in, Tara? <ArrowRight size={17} />
              </button>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("demo")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="rounded-2xl bg-card border border-border px-6 py-3.5 text-sm font-semibold text-foreground active:scale-[0.98] transition-transform"
              >
                Tingnan ang sample
              </button>
            </div>
          </div>
        </section>

        <LandingDemo />
      </div>
      <section className="pt-12 px-6 pb-12 lg:max-w-6xl lg:mx-auto lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Built for real ambagan
        </p>
        <h2 className="mt-1 text-xl font-semibold text-foreground">
          Walang gulatan. Walang kalkulan.
        </h2>
        <div className="mt-5 rounded-3xl bg-card border border-border p-5">
          <p className="text-sm font-semibold text-foreground">
            Start now. Settle with proof.
          </p>
          <div className="mt-4 space-y-4">
            {[
              [
                "1",
                "Add everyone—kahit pending",
                "No need to wait for every friend to sign up. Add their names and record expenses right away.",
              ],
              [
                "2",
                "Show exactly how to pay",
                "Share GCash, bank details, instructions, or a payment QR—no more asking where to send it.",
              ],
              [
                "3",
                "Send proof, then confirm",
                "Members attach a reference or receipt. The recipient reviews it and marks the payment complete.",
              ],
            ].map(([number, title, copy]) => (
              <div key={number} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {number}
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            [
              Receipt,
              "Flexible splits",
              "Equal or custom amounts for every expense.",
            ],
            [
              BarChart2,
              "Clear balances",
              "See who owes and who gets money back.",
            ],
            [Users, "Easy invites", "Add friends now and let them join later."],
            [
              Shield,
              "Payment tracking",
              "Submit, review, and confirm repayments.",
            ],
            [
              UserPlus,
              "Pending members",
              "Include someone in expenses before they create an account.",
            ],
            [
              QrCode,
              "QR invitations",
              "Let friends scan a code to join or claim their pending profile.",
            ],
            [
              MessageCircle,
              "Group messages",
              "Keep expense conversations and updates inside the group.",
            ],
            [
              CreditCard,
              "Payment instructions & proof",
              "Share GCash, bank, account, or QR details, then attach a reference, note, or receipt for confirmation.",
            ],
            [
              FileSpreadsheet,
              "CSV import & export",
              "Move expenses in bulk or download a clean group record.",
            ],
            [
              Smartphone,
              "Install on mobile",
              "Add it from Safari or Chrome and use it like a regular app.",
            ],
          ].map(([Icon, title, copy]) => {
            const FeatureIcon = Icon as typeof Receipt;
            return (
              <div
                key={String(title)}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="grid size-9 place-items-center rounded-xl bg-accent">
                  <FeatureIcon size={17} className="text-primary" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">
                  {String(title)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {String(copy)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section
        id="sign-in"
        className="w-full bg-card rounded-t-[2rem] shadow-2xl border-t border-border px-6 pt-8 pb-12 sm:max-w-xl sm:mx-auto sm:mb-16 sm:rounded-[2rem] sm:border"
      >
        <div className="mb-6 text-center">
          <p className="text-xl font-semibold text-foreground">
            Ready na makihati?
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a group and start tracking for free.
          </p>
        </div>
        {!sent ? (
          <div className="space-y-4">
            {inAppBrowser ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <ExternalLink size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Open in {inAppBrowser.isIOS ? "Safari" : "your browser"}{" "}
                      to use Google
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Google blocks sign-in inside {inAppBrowser.appName}. Tap
                      the Share or ••• menu and choose{" "}
                      {inAppBrowser.isIOS
                        ? "Open in Safari"
                        : "Open in Chrome / Browser"}
                      , or copy this page's link below.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copyBrowserLink}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-200 bg-card text-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
                >
                  {linkCopied ? (
                    <Check size={16} className="text-green-600" />
                  ) : (
                    <Copy size={16} />
                  )}
                  {linkCopied ? "Link copied" : "Copy link for browser"}
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-card border border-border text-foreground font-semibold transition-all active:scale-95 disabled:opacity-60"
              >
                {googleLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <span className="grid place-items-center size-5 rounded-full bg-white text-sm font-bold text-[#4285f4] border border-border">
                      G
                    </span>
                    Continue with Google
                  </>
                )}
              </button>
            )}

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div>
              <p className="text-foreground font-semibold mb-1">
                Sign in with email
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                We'll send a magic link — no password needed.
              </p>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              {error && (
                <p className="text-destructive text-xs mt-1.5">{error}</p>
              )}
            </div>
            <button
              onClick={handleSend}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-primary-foreground font-semibold transition-all active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Send Magic Link <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
              <CheckCircle2 size={32} className="text-accent-foreground" />
            </div>
            <div>
              <p className="text-foreground font-semibold mb-1">
                Check your inbox
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Magic link sent to{" "}
                <span className="font-medium text-foreground">{email}</span>.
                Click it to sign in instantly.
              </p>
            </div>
            <button
              onClick={() => setSent(false)}
              className="text-sm text-primary font-medium"
            >
              Use a different email
            </button>
          </div>
        )}
        <p className="text-center text-xs text-muted-foreground mt-5">
          By continuing, you agree to BayadTayoOpo storing your account and
          group data to run the app.
        </p>
      </section>

      {mobileInstallPromptOpen && (
        <aside
          role="dialog"
          aria-label="Install BayadTayoOpo on your phone"
          className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-500"
        >
          <div className="relative rounded-3xl border border-primary/15 bg-card p-4 shadow-2xl shadow-black/20">
            <button
              type="button"
              onClick={dismissMobileInstallPrompt}
              className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Skip install guide"
            >
              <X size={16} />
            </button>

            <div className="flex items-start gap-3 pr-8">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <Smartphone size={21} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Wait—nasa mobile ka!
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Install mo na para one tap lang next time. Parang regular app,
                  pero walang App Store.
                </p>
              </div>
            </div>

            {mobileInstallGuideOpen ? (
              <div className="mt-4 rounded-2xl bg-accent p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  {mobileInstallPlatform === "ios" ? (
                    <Share2 size={15} className="text-primary" />
                  ) : (
                    <MoreVertical size={15} className="text-primary" />
                  )}
                  {mobileInstallPlatform === "ios"
                    ? "Sa Safari:"
                    : "Sa Chrome:"}
                </div>
                <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  {mobileInstallPlatform === "ios" ? (
                    <>
                      <li>1. Tap Share sa browser toolbar.</li>
                      <li>2. Choose “Add to Home Screen.”</li>
                      <li>3. Tap Add.</li>
                    </>
                  ) : (
                    <>
                      <li>1. Tap the ⋮ menu sa upper-right.</li>
                      <li>2. Choose “Install app.”</li>
                      <li>3. Confirm Install.</li>
                    </>
                  )}
                </ol>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={dismissMobileInstallPrompt}
                className="rounded-xl border border-border py-2.5 text-xs font-semibold text-muted-foreground"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mobileInstallGuideOpen) {
                    dismissMobileInstallPrompt();
                  } else {
                    setMobileInstallGuideOpen(true);
                  }
                }}
                className="rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground"
              >
                {mobileInstallGuideOpen ? "Got it" : "Paano?"}
              </button>
            </div>

            <span
              className={`absolute text-primary ${
                mobileInstallPlatform === "ios"
                  ? "-bottom-9 left-1/2 -translate-x-1/2 text-3xl"
                  : "-top-9 right-5 text-3xl"
              }`}
              aria-hidden="true"
            >
              {mobileInstallPlatform === "ios" ? "↓" : "↑"}
            </span>
          </div>
        </aside>
      )}
    </div>
  );
}

interface MagicLinkEmailProps {
  error?: string;
  onContinue: (email: string) => void;
}

export function MagicLinkEmailScreen({
  error: initialError,
  onContinue,
}: MagicLinkEmailProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(initialError ?? "");

  function handleContinue() {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter the email address that received this link");
      return;
    }
    setError("");
    onContinue(trimmed);
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <BrandMark className="w-20 h-20 mb-6 shadow-lg rounded-[1.4rem]" />
        <h1 className="text-foreground mb-2">Confirm your email</h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
          For your security, confirm the address that received this magic link.
          Your browser can autofill it for you.
        </p>
      </div>

      <div className="bg-card rounded-t-3xl shadow-lg border-t border-border px-6 pt-8 pb-12">
        <label className="block text-sm text-muted-foreground mb-1.5">
          Email address
        </label>
        <div className="relative">
          <Mail
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => event.key === "Enter" && handleContinue()}
            className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        {error && (
          <p className="text-destructive text-xs mt-1.5" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleContinue}
          className="mt-4 w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-primary-foreground font-semibold transition-all active:scale-95"
        >
          Continue <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

// ─── Complete profile after first sign-in ───────────────────────────────────

interface CompleteProfileProps {
  email: string;
  onComplete: (name: string) => Promise<void>;
}

export function CompleteProfileScreen({
  email,
  onComplete,
}: CompleteProfileProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Enter your display name");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onComplete(name.trim());
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <BrandMark className="w-20 h-20 mb-6 shadow-lg rounded-[1.4rem]" />
        <h1 className="text-foreground mb-2">Almost there!</h1>
        <p className="text-sm text-muted-foreground">Signed in as {email}</p>
      </div>
      <div className="bg-card rounded-t-3xl shadow-lg border-t border-border px-6 pt-8 pb-12 space-y-4">
        <div>
          <p className="text-foreground font-semibold mb-1">
            What's your name?
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            This is how you'll appear in expense groups.
          </p>
          <input
            type="text"
            placeholder="Alex Johnson"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoFocus
            className="w-full px-4 py-3.5 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {error && <p className="text-destructive text-xs mt-1.5">{error}</p>}
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-primary-foreground font-semibold transition-all active:scale-95 disabled:opacity-60"
          style={{ backgroundColor: "var(--primary)" }}
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              Get Started <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
