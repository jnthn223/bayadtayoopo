import { useState } from "react";
import { Wallet, ArrowRight, Mail, Loader2, CheckCircle2 } from "lucide-react";
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import { auth } from "../../lib/firebase";

type Step = "email" | "sent" | "complete_profile";

interface Props {
  onProfileNeeded: (email: string) => void;
}

export function LoginScreen({ onProfileNeeded }: Props) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSendLink() {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    setError("");
    setLoading(true);

    const actionCodeSettings = {
      url: window.location.href,
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(auth, email.trim(), actionCodeSettings);
      // Save email locally so we can complete sign-in when user returns
      window.localStorage.setItem("emailForSignIn", email.trim());
      setStep("sent");
    } catch (err: any) {
      setError(err.message ?? "Failed to send link. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-lg"
          style={{ backgroundColor: "var(--primary)" }}
        >
          <Wallet size={36} className="text-white" />
        </div>
        <h1 className="text-foreground mb-2">SplitWave</h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
          Split expenses with friends and groups — no math, no drama.
        </p>
      </div>

      {/* Form card */}
      <div className="bg-card rounded-t-3xl shadow-lg border-t border-border px-6 pt-8 pb-12">
        {step === "email" && (
          <div className="space-y-4">
            <div>
              <p className="text-foreground font-semibold mb-1">Sign in with email</p>
              <p className="text-sm text-muted-foreground mb-4">
                We'll send a magic link — no password needed.
              </p>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendLink()}
                  autoFocus
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              {error && <p className="text-destructive text-xs mt-1.5">{error}</p>}
            </div>

            <button
              onClick={handleSendLink}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-primary-foreground font-semibold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Send Magic Link
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        )}

        {step === "sent" && (
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center">
              <CheckCircle2 size={32} className="text-accent-foreground" />
            </div>
            <div>
              <p className="text-foreground font-semibold mb-1">Check your inbox</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We sent a magic link to{" "}
                <span className="font-medium text-foreground">{email}</span>.
                Click it to sign in instantly — no password needed.
              </p>
            </div>
            <button
              onClick={() => setStep("email")}
              className="text-sm text-primary font-medium"
            >
              Use a different email
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-5">
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

// Separate component for collecting name after first sign-in
interface CompleteProfileProps {
  email: string;
  onComplete: (name: string) => Promise<void>;
}

export function CompleteProfileScreen({ email, onComplete }: CompleteProfileProps) {
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
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-lg"
          style={{ backgroundColor: "var(--primary)" }}
        >
          <Wallet size={36} className="text-white" />
        </div>
        <h1 className="text-foreground mb-2">Almost there!</h1>
        <p className="text-sm text-muted-foreground">Signed in as {email}</p>
      </div>

      <div className="bg-card rounded-t-3xl shadow-lg border-t border-border px-6 pt-8 pb-12 space-y-4">
        <div>
          <p className="text-foreground font-semibold mb-1">What's your name?</p>
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
          {loading ? <Loader2 size={18} className="animate-spin" /> : <>Get Started <ArrowRight size={18} /></>}
        </button>
      </div>
    </div>
  );
}
