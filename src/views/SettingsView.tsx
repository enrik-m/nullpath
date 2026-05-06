/**
 * SettingsView — operator profile, theme toggles, danger-zone reset.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Snowflake, RefreshCcw } from "lucide-react";
import * as db from "../db";
import type { AppStateRow } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import { LIMITS } from "../lib/limits";

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
    if (!confirm("Wipe all progress, notes, resources, bounties, achievements? This cannot be undone.")) return;
    sfx.warn();
    await db.resetAllProgress();
    location.reload();
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

          {/* Danger zone */}
          <Section title="Danger zone" tone="danger">
            <div className="text-[13px] text-[var(--color-fg-2)] mb-3">
              Wipes all progress, notes, resources, bounties, achievements, and
              streak history. The skill graph itself stays intact.
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
      className={cn(
        "np-pixel rounded-lg p-5",
        tone === "danger" && "border-[var(--color-rose)]",
      )}
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
