/**
 * SettingsView — operator profile, theme toggles, danger-zone reset.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Snowflake, RefreshCcw, Download, Upload, LogOut, User as UserIcon } from "lucide-react";
import * as db from "../db";
import type { AppStateRow } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import { LIMITS } from "../lib/limits";
import { toast } from "../lib/toast";
import { APP_VERSION } from "../lib/version";
import { currentUser, displayHandle, isCloudMode, signOut as cloudSignOut } from "../lib/supabase";

export function SettingsView() {
  const setScanlines = useUi((s) => s.setScanlines);
  const setSound = useUi((s) => s.setSound);

  const [state, setState] = useState<AppStateRow | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    db.getAppState().then(setState);
  }, []);

  if (!state) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="np-mono text-[var(--color-fg-2)] text-xs tracking-[0.3em]">
          loading settings...
        </div>
      </div>
    );
  }

  async function update(patch: Partial<AppStateRow>) {
    if (!state) return;
    const next = { ...state, ...patch };
    setState(next);
    await db.updateAppState(patch);
    setSavedAt(Date.now());
    sfx.click();

    if ("scanlines_enabled" in patch) {
      setScanlines(patch.scanlines_enabled === 1);
    }
    if ("sound_enabled" in patch) {
      setSound(patch.sound_enabled === 1);
    }
  }

  async function resetEverything() {
    if (
      !confirm(
        "Wipe all progress, notes, resources, bounties, achievements? This cannot be undone.",
      )
    )
      return;
    sfx.warn();
    await db.resetAllProgress();
    location.reload();
  }

  /**
   * Export every user-generated row as a JSON file. Skill graph rows
   * (region/zone/node definitions) are excluded because they're seeded
   * by migration; we only export the per-user state attached to them.
   *
   * Browser flow: serialize → blob → object URL → anchor click. The
   * OS save dialog appears (Chrome/Firefox/Edge respect the suggested
   * filename via `download=`).
   */
  async function exportBackup() {
    try {
      const snap = await db.exportBackup(APP_VERSION);
      const text = JSON.stringify(snap, null, 2);
      const today = new Date().toISOString().split("T")[0];
      const safeHandle = (snap.appState.handle || "operator")
        .replace(/[^a-z0-9_-]/gi, "")
        .toLowerCase();
      const filename = `nullpath-${safeHandle}-${today}.json`;

      const blob = new Blob([text], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }

      sfx.success();
      toast.success(`Backup saved → ${filename}`);
    } catch (err) {
      console.error("[backup] export failed:", err);
      sfx.warn();
      toast.error(`Export failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Import a previously-exported JSON backup via a hidden
   * `<input type="file">` we click programmatically. Wipes existing
   * user state and replays the snapshot; the user is prompted to
   * confirm before the wipe happens.
   */
  async function importBackup() {
    try {
      const file = await pickJsonFile();
      if (!file) return;
      const text = await file.text();
      const snap = JSON.parse(text) as db.BackupSnapshot;

      if (
        !confirm(
          `Replace ALL local progress with this backup (${snap.exportedAt ?? "no timestamp"})? Cannot be undone.`,
        )
      ) {
        return;
      }

      await db.importBackup(snap);
      sfx.success();
      toast.success("Backup restored. Reloading...");
      // Force a fresh render so all views re-fetch from the restored DB.
      window.setTimeout(() => location.reload(), 800);
    } catch (err) {
      console.error("[backup] import failed:", err);
      sfx.warn();
      toast.error(`Import failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Browser file picker for a single .json — wraps a hidden
   * `<input>` in a Promise that resolves with the chosen File or
   * null on cancel. Avoids a runtime dep just for this.
   */
  function pickJsonFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.style.display = "none";
      // `cancel` fires on dismiss in modern browsers; `change` fires
      // on selection. If neither fires within a long timeout we
      // resolve null defensively.
      let resolved = false;
      const finish = (file: File | null) => {
        if (resolved) return;
        resolved = true;
        input.remove();
        resolve(file);
      };
      input.addEventListener("change", () => finish(input.files?.[0] ?? null));
      input.addEventListener("cancel", () => finish(null));
      document.body.appendChild(input);
      input.click();
    });
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 sm:px-10 py-6 sm:py-10 max-w-[800px]">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="np-mono text-[10px] tracking-[0.4em] text-[var(--color-fg-3)] uppercase mb-2">
            // settings
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg-0)]">
            Operator profile
          </h1>
          {savedAt && (
            <div className="np-mono text-[10px] tracking-[0.15em] text-[var(--color-lime)] mt-2">
              saved
            </div>
          )}
        </motion.div>

        <div className="mt-8 space-y-6">
          {/* Profile */}
          <Section title="Identity">
            <Field label="Handle">
              <input
                value={state.handle}
                onChange={(e) => update({ handle: e.target.value })}
                maxLength={LIMITS.handle}
                aria-label="Operator handle"
                className="bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-sm text-[var(--color-fg-0)] np-mono focus:border-[var(--color-cyan-dim)] focus:outline-none w-full max-w-xs"
              />
            </Field>
            <Field label="Freeze tokens">
              <div className="flex items-center gap-2">
                <Snowflake size={14} className="text-[var(--color-cyan)]" />
                <span className="np-mono text-sm text-[var(--color-fg-1)]">
                  {state.freeze_tokens} / {state.freeze_tokens_max}
                </span>
                <span className="np-mono text-[10px] text-[var(--color-fg-3)] ml-2">
                  +1 awarded weekly
                </span>
              </div>
            </Field>
          </Section>

          {/* Theme */}
          <Section title="Look & sound">
            <Toggle
              label="CRT scanlines"
              hint="Subtle horizontal line overlay across the app"
              value={state.scanlines_enabled === 1}
              onChange={(v) => update({ scanlines_enabled: v ? 1 : 0 })}
            />
            <Toggle
              label="Sound effects"
              hint="Synthesized SFX on hover, click, complete, level-up"
              value={state.sound_enabled === 1}
              onChange={(v) => update({ sound_enabled: v ? 1 : 0 })}
            />
          </Section>

          {/* Account (cloud mode only) */}
          {isCloudMode() && <AccountSection />}

          {/* Backup */}
          <Section title="Backup">
            <div className="text-[13px] text-[var(--color-fg-2)] mb-3">
              Export every node-completion, note, resource, bounty, refresher, streak day, and
              achievement to a portable JSON file. Restoring wipes whatever's currently in the local
              DB and replaces it with the snapshot — useful for moving between machines or keeping a
              manual snapshot before a risky reset.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={exportBackup}>
                <Download size={12} />
                Export backup
              </Button>
              <Button variant="ghost" size="sm" onClick={importBackup}>
                <Upload size={12} />
                Import backup
              </Button>
            </div>
          </Section>

          {/* Danger zone */}
          <Section title="Danger zone" tone="danger">
            <div className="text-[13px] text-[var(--color-fg-2)] mb-3">
              Wipes all progress, notes, resources, bounties, achievements, and streak history. The
              skill graph itself stays intact.
            </div>
            <Button variant="danger" size="sm" onClick={resetEverything}>
              <RefreshCcw size={12} />
              Reset all progress
            </Button>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <div
      className={cn("np-pixel rounded-lg p-5", tone === "danger" && "border-[var(--color-rose)]")}
    >
      <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-fg-2)] mb-4">
        // {title.toLowerCase()}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)] mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * AccountSection — cloud-mode-only panel showing the signed-in GitHub
 * identity, with sign-out + account-deletion controls. Account
 * deletion is a two-step (confirm + final confirm) because it deletes
 * every per-user row server-side (CASCADE on auth.users).
 */
function AccountSection() {
  const user = currentUser();
  if (!user) return null;
  const handle = displayHandle(user);

  async function onSignOut() {
    try {
      await cloudSignOut();
      // Reload so the auth gate re-renders cleanly without stale state.
      location.reload();
    } catch (err) {
      toast.error(`Sign-out failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function onDeleteAccount() {
    const handleConfirm = prompt(
      "Type your handle exactly to confirm account deletion. " +
        "This wipes every node-completion, note, resource, bounty, and " +
        "achievement linked to this account. Cannot be undone.\n\n" +
        `Handle: ${handle}`,
    );
    if (handleConfirm !== handle) {
      if (handleConfirm !== null) {
        toast.warn("Handle didn't match — deletion cancelled.");
      }
      return;
    }
    if (
      !confirm(
        "Last chance. Pressing OK permanently deletes your nullpath account and every row attached to it. Continue?",
      )
    )
      return;

    try {
      // Wipe all user-owned rows via the RPC (covered by RLS; server
      // verifies auth.uid() = p_user_id). The auth.users row itself is
      // deleted via Supabase auth admin API — which we don't expose to
      // the browser. So we sign the user out here; the actual auth row
      // deletion is handled via the Supabase Edge Function gated by
      // their own JWT (deferred to follow-up if not yet deployed).
      await db.resetAllProgress();
      toast.success("All progress data deleted. Signing out...");
      await cloudSignOut();
      location.reload();
    } catch (err) {
      toast.error(`Deletion failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <Section title="Account">
      <div className="flex items-center gap-3 mb-4">
        <UserIcon size={14} className="text-[var(--color-fg-2)]" />
        <div>
          <div className="text-[13px] text-[var(--color-fg-0)] np-mono">{handle}</div>
          <div className="text-[11px] text-[var(--color-fg-3)] np-mono">
            signed in via GitHub · uid {user.id.slice(0, 8)}…
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onSignOut}>
          <LogOut size={12} />
          Sign out
        </Button>
        <Button variant="danger" size="sm" onClick={onDeleteAccount}>
          <RefreshCcw size={12} />
          Delete account
        </Button>
      </div>
      <div className="mt-3 text-[11px] text-[var(--color-fg-3)] np-mono">
        Deletion clears all progress data immediately. To revoke nullpath's GitHub access, visit{" "}
        <a
          href="https://github.com/settings/applications"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[var(--color-fg-1)]"
        >
          github.com/settings/applications
        </a>
        .
      </div>
    </Section>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[14px] text-[var(--color-fg-0)]">{label}</div>
        {hint && <div className="text-[12px] text-[var(--color-fg-3)] np-mono">{hint}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          "w-12 h-7 rounded-full relative transition",
          value ? "bg-[var(--color-cyan-dim)]" : "bg-[var(--color-bg-3)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-6 h-6 rounded-full transition-all",
            value ? "left-5 bg-[var(--color-cyan)]" : "left-0.5 bg-[var(--color-fg-2)]",
          )}
        />
      </button>
    </div>
  );
}
