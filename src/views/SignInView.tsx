/**
 * SignInView — gate that renders when cloud mode is on and the user
 * isn't authenticated yet.
 *
 * GitHub OAuth only (Q1 spec). No passwords, no email signup, no MFA
 * UI — all of that is GitHub's problem. Visual aesthetic mirrors
 * BootView (np-display title, np-pixel chrome, scanline-friendly)
 * so the auth gate feels like a continuation of the app rather than
 * a third-party login form.
 */

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck } from "lucide-react";
import { signInWithGitHub } from "../lib/supabase";
import { toast } from "../lib/toast";

/**
 * GitHub octocat mark, inlined so we don't have to ship a logo asset
 * just for the sign-in button. Path data taken from GitHub's brand
 * guidelines (the simplified `github-mark.svg`).
 */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.96 10.96 0 0 1 5.74 0c2.2-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

/**
 * If the OAuth redirect doesn't complete in this many ms we drop the
 * busy state and toast an error. The Supabase client redirects almost
 * immediately on success, so anything past this is either a popup
 * blocker, a network stall, or a cross-origin script failure — all of
 * which leave the user staring at a frozen "Redirecting…" spinner with
 * no way out otherwise.
 */
const SIGN_IN_TIMEOUT_MS = 15_000;

export function SignInView() {
  const [busy, setBusy] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  async function onSignIn() {
    setBusy(true);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setBusy(false);
      toast.error("Sign-in took too long. Try again.");
    }, SIGN_IN_TIMEOUT_MS);
    try {
      await signInWithGitHub();
      // If we get here without redirecting, something went wrong on
      // Supabase's side — the OAuth flow normally navigates away.
    } catch (err) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Sign-in failed: ${msg}`);
      setBusy(false);
    }
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center px-6">
      {/* Screen-reader-only document title. The np-display visual above is
          a stylized glitch effect with transparent fill; assistive tech
          should hear a plain heading instead. */}
      <h1 className="sr-only">Sign in to Nullpath</h1>
      <div className="w-[520px] max-w-full">
        {/* Pixel logo — same treatment as BootView */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "linear" }}
          className="text-center mb-8"
        >
          <div
            className="np-display text-4xl np-flicker"
            data-text="NULLPATH"
            aria-hidden="true"
            style={{
              background:
                "linear-gradient(180deg, var(--color-cyan) 0%, var(--color-magenta) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            <span className="np-glitch-text" data-text="NULLPATH">
              NULLPATH
            </span>
          </div>
          <div className="np-screen text-[10px] tracking-[0.4em] text-[var(--color-fg-3)] mt-3">
            ◇ AUTHENTICATE OPERATOR ◇
          </div>
        </motion.div>

        {/* Boot-log style intro */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="np-pixel-inset p-4 np-mono text-[13px] leading-[1.7] mb-6"
        >
          <div className="text-[var(--color-fg-2)]">
            <span aria-hidden="true">{">"}</span> link.identity.github
          </div>
          <div className="text-[var(--color-fg-2)]">
            <span aria-hidden="true">{">"}</span> require.consent
          </div>
          <div className="text-[var(--color-fg-1)]">
            sync.progress · sync.notes · sync.achievements
          </div>
          <div className="text-[var(--color-cyan)]">
            handshake delegated to github.com{" "}
            <span className="np-blink inline-block w-[7px] h-[12px] bg-[var(--color-cyan)] align-middle ml-1" />
          </div>
        </motion.div>

        {/* GitHub sign-in button — themed to feel like np-pixel chrome */}
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.2 }}
          type="button"
          onClick={onSignIn}
          disabled={busy}
          aria-live="polite"
          aria-busy={busy}
          className="np-pixel w-full flex items-center justify-center gap-3 px-4 py-3 np-mono text-[13px] tracking-[0.15em] uppercase text-[var(--color-fg-0)] hover:border-[var(--color-cyan)] hover:text-[var(--color-cyan)] hover:np-glow-cyan disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          style={{ background: "var(--color-bg-1)" }}
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Redirecting…</span>
            </>
          ) : (
            <>
              <GithubMark className="w-4 h-4" />
              <span>Continue with GitHub</span>
            </>
          )}
        </motion.button>

        {/* Trust hints — mono, three lines */}
        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.35 }}
          className="mt-6 space-y-1.5 np-mono text-[11px] text-[var(--color-fg-1)]"
        >
          <li className="flex items-start gap-2">
            <ShieldCheck
              className="w-3 h-3 mt-0.5 text-[var(--color-lime)] shrink-0"
              aria-hidden="true"
            />
            <span>
              Stored: GitHub user-id, login, primary email. Not stored: repos, orgs, anything else.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck
              className="w-3 h-3 mt-0.5 text-[var(--color-lime)] shrink-0"
              aria-hidden="true"
            />
            <span>Per-user data is RLS-isolated. Other accounts cannot query your rows.</span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck
              className="w-3 h-3 mt-0.5 text-[var(--color-lime)] shrink-0"
              aria-hidden="true"
            />
            <span>Settings → Account → Delete wipes everything. One click.</span>
          </li>
        </motion.ul>

        {/* Footer links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.5 }}
          className="mt-10 flex items-center justify-center gap-6 np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-fg-2)]"
        >
          <a
            href="/privacy.html"
            className="min-h-[44px] px-2 inline-flex items-center hover:text-[var(--color-cyan)] transition-colors"
          >
            Privacy
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="/terms.html"
            className="min-h-[44px] px-2 inline-flex items-center hover:text-[var(--color-cyan)] transition-colors"
          >
            Terms
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/enrik-m/nullpath"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-2 inline-flex items-center hover:text-[var(--color-cyan)] transition-colors"
          >
            GitHub
          </a>
        </motion.div>
      </div>
    </div>
  );
}
