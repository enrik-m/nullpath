/**
 * BootView — fake terminal boot sequence.
 *
 * Plays once on first launch (when app_state.onboarded_at is null) and then
 * sets the route to atlas. Subsequent launches skip straight to atlas.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useUi } from "../store";
import { sfx, unlockAudio } from "../lib/sfx";
import * as db from "../db";

const LINES = [
  { delay: 0, text: "// nullpath kernel v0.1.0 — initialising...", color: "fg-2" },
  { delay: 200, text: "[ ok ] mounting atlas...", color: "fg-1" },
  { delay: 360, text: "[ ok ] decoding constellation maps", color: "fg-1" },
  { delay: 540, text: "[ ok ] indexing 23 zones, 713 nodes", color: "fg-1" },
  { delay: 720, text: "[ ok ] loading skill graph (web region)", color: "fg-1" },
  { delay: 880, text: "[ ok ] establishing local sqlite link", color: "fg-1" },
  { delay: 1040, text: "[ ok ] linking idle telemetry hooks", color: "fg-1" },
  { delay: 1200, text: "[ ok ] preparing operator profile", color: "fg-1" },
  { delay: 1360, text: "$ welcome, operator.", color: "cyan" },
  { delay: 1480, text: "$ proceed to atlas? [ y ]", color: "magenta" },
];

export function BootView() {
  const go = useUi((s) => s.go);
  const [shown, setShown] = useState(0);
  const [skip, setSkip] = useState(false);

  // Fast-skip if already onboarded
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const state = await db.getAppState();
        if (state.onboarded_at) {
          // Fade-by quickly: still show 600ms of intro, then atlas
          window.setTimeout(() => {
            if (!cancelled) go({ name: "atlas" });
          }, 600);
          if (!cancelled) setSkip(true);
        } else {
          // First boot — full sequence
          unlockAudio();
          sfx.bootStart();
        }
      } catch {
        // DB not ready: show full sequence anyway
        if (!cancelled) sfx.bootStart();
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [go]);

  useEffect(() => {
    if (skip) return;
    const timers = LINES.map((line, i) =>
      window.setTimeout(() => {
        setShown((s) => Math.max(s, i + 1));
        sfx.bootChunk();
      }, line.delay),
    );
    const finish = window.setTimeout(async () => {
      await db.updateAppState({ onboarded_at: new Date().toISOString() });
      sfx.success();
      go({ name: "atlas" });
    }, 2300);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(finish);
    };
  }, [skip, go]);

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="w-[560px] max-w-full px-6">
        {!skip ? (
          <motion.div
            className="np-mono text-[12px] leading-[1.8] tracking-wide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {LINES.slice(0, shown).map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={
                  line.color === "cyan"
                    ? "text-[var(--color-cyan)]"
                    : line.color === "magenta"
                      ? "text-[var(--color-magenta)]"
                      : line.color === "fg-1"
                        ? "text-[var(--color-fg-1)]"
                        : "text-[var(--color-fg-2)]"
                }
              >
                {line.text}
                {i === shown - 1 && (
                  <span className="ml-1 inline-block w-2 h-[10px] align-middle bg-[var(--color-cyan)] np-pulse" />
                )}
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-bold tracking-tight bg-gradient-to-br from-[var(--color-cyan)] via-[var(--color-fg-0)] to-[var(--color-magenta)] bg-clip-text text-transparent">
                null
              </span>
              <span className="text-5xl font-bold tracking-tight text-[var(--color-fg-0)]">
                path
              </span>
              <span className="np-mono text-xl text-[var(--color-cyan)] np-pulse">_</span>
            </div>
            <div className="np-mono text-[10px] text-[var(--color-fg-3)] tracking-[0.4em]">
              loading atlas...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
