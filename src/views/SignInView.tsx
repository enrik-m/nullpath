/**
 * SignInView — gate that renders when cloud mode is on and the user
 * isn't authenticated yet.
 *
 * GitHub OAuth only (Q1 spec). No passwords, no email signup, no MFA
 * UI — all of that is GitHub's problem. The button kicks off the OAuth
 * dance; Supabase's `detectSessionInUrl` finishes the flow when the
 * user lands back on our origin with a `?code=` query param.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * GitHub octocat mark, inlined so we don't have to ship a logo asset
 * just for the sign-in button. Path data taken from GitHub's brand
 * guidelines (the simplified `github-mark.svg`).
 */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden role="img">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.96 10.96 0 0 1 5.74 0c2.2-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
import { signInWithGitHub } from "../lib/supabase";
import { toast } from "../lib/toast";

export function SignInView() {
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    setBusy(true);
    try {
      await signInWithGitHub();
      // If we get here without redirecting, something went wrong on
      // Supabase's side — the OAuth flow normally navigates away.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Sign-in failed: ${msg}`);
      setBusy(false);
    }
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center px-6 bg-[var(--bg)]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-[440px] max-w-full"
      >
        <div className="font-mono text-[var(--fg-2)] text-xs mb-6">{">"}_ nullpath / sign-in</div>

        <h1 className="font-pixel text-2xl text-[var(--fg-1)] mb-3">Sign in to nullpath</h1>

        <p className="text-sm text-[var(--fg-2)] leading-relaxed mb-8">
          Your progress, notes, achievements and bounty ledger sync to your account. No password —
          auth is delegated to GitHub, with whatever MFA you've already configured there. We never
          see your password.
        </p>

        <button
          type="button"
          onClick={onSignIn}
          disabled={busy}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[var(--fg-1)] text-[var(--bg)] font-pixel text-sm hover:bg-[var(--fg-1)]/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              <span>Redirecting to GitHub…</span>
            </>
          ) : (
            <>
              <GithubMark className="w-4 h-4" />
              <span>Continue with GitHub</span>
            </>
          )}
        </button>

        <ul className="mt-8 space-y-2 text-xs text-[var(--fg-2)]">
          <li className="flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-[var(--accent)]" aria-hidden />
            <span>
              We store your GitHub user-id and login. We don't read your repositories, email, or any
              other GitHub data.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-[var(--accent)]" aria-hidden />
            <span>
              All per-user data is row-level-security isolated; another account literally can't
              query your rows.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-[var(--accent)]" aria-hidden />
            <span>
              You can delete everything from Settings. Account deletion also revokes the OAuth
              grant.
            </span>
          </li>
        </ul>

        <div className="mt-10 flex items-center gap-4 text-[10px] text-[var(--fg-3,var(--fg-2))]">
          <a
            href="/privacy.html"
            className="hover:text-[var(--fg-1)] underline-offset-4 hover:underline"
          >
            Privacy
          </a>
          <span aria-hidden>·</span>
          <a
            href="/terms.html"
            className="hover:text-[var(--fg-1)] underline-offset-4 hover:underline"
          >
            Terms
          </a>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/seskar/nullpath"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--fg-1)] underline-offset-4 hover:underline"
          >
            GitHub
          </a>
        </div>
      </motion.div>
    </div>
  );
}
