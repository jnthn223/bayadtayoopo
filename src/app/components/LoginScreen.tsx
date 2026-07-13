import { useState } from "react";
import { ArrowRight, Mail, Loader2, CheckCircle2, Copy, ExternalLink, Check } from "lucide-react";
import { sendMagicLink } from "../../lib/firebaseRest";
import type { AuthUser } from "../../lib/firebaseRest";
import { BrandMark, BrandWordmark } from "./Brand";
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
  const inAppBrowser = detectInAppBrowser();

  async function copyBrowserLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("Copying was blocked. Use the Share or ••• menu and choose Open in Browser.");
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
    const continueUrlValue = new URL(window.location.pathname, window.location.origin);
    const joinGroupId = localStorage.getItem("pendingJoinGroupId");
    const claimMemberId = localStorage.getItem("pendingClaimMemberId");
    const claimCode = localStorage.getItem("pendingClaimCode");
    if (joinGroupId) continueUrlValue.searchParams.set("joinGroupId", joinGroupId);
    if (claimMemberId) continueUrlValue.searchParams.set("claimMemberId", claimMemberId);
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
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <BrandMark className="w-20 h-20 mb-6 shadow-lg rounded-[1.4rem]" />
        <h1 className="text-foreground mb-2">
          <BrandWordmark className="text-[1.75rem]" />
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
          Split expenses with friends and groups — no math, no drama.
        </p>
      </div>

      <div className="bg-card rounded-t-3xl shadow-lg border-t border-border px-6 pt-8 pb-12">
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
                      Open in {inAppBrowser.isIOS ? "Safari" : "your browser"} to use Google
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Google blocks sign-in inside {inAppBrowser.appName}. Tap the Share or ••• menu and choose {inAppBrowser.isIOS ? "Open in Safari" : "Open in Chrome / Browser"}, or copy this page's link below.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copyBrowserLink}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-200 bg-card text-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
                >
                  {linkCopied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
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
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  autoFocus
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
          By continuing, you agree to BayadTayoOpo storing your account and group
          data to run the app.
        </p>
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
