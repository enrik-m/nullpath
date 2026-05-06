/**
 * BootView — pixel terminal boot.
 *
 * Plays full sequence on first launch (when app_state.onboarded_at is null)
 * and a quick fade on subsequent launches.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useUi } from "../store";
import { sfx, unlockAudio } from "../lib/sfx";
import * as db from "../db";

const LINES = [
  { delay: 0,    text: ">>> nullpath_kernel.boot()", color: "fg-2" },
  { delay: 200,  text: "[ OK ] CRT warm-up.................. green", color: "fg-1" },
  { delay: 360,  text: "[ OK ] mounting atlas............... green", color: "fg-1" },
  { delay: 520,  text: "[ OK ] decoding constellation maps.. green", color: "fg-1" },
  { delay: 680,  text: "[ OK ] indexing 23 zones / 820 nodes green", color: "fg-1" },
  { delay: 840,  text: "[ OK ] loading skill graph (web).... green", color: "fg-1" },
  { delay: 1000, text: "[ OK ] linking sqlite store......... green", color: "fg-1" },
  { delay: 1160, text: "[ OK ] idle telemetry hooks armed... green", color: "fg-1" },
  { delay: 1320, text: "[ OK ] operator profile ready....... green", color: "fg-1" },
  { delay: 1500, text: "$ welcome, operator.", color: "cyan" },
  { delay: 1640, text: "$ enter the atlas? [Y]_", color: "magenta" },
];

export function BootView() {
  const go = useUi((s) => s.go);
  const [shown, setShown] = useState(0);
  const [skip, setSkip] = useState(false);
  const titleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const state = await db.getAppState();
        if (state.onboarded_at) {
          window.setTimeout(() => {
            if (!cancelled) go({ name: "atlas" });
          }, 700);
          if (!cancelled) setSkip(true);
        } else {
          unlockAudio();
          sfx.bootStart();
        }
      } catch {
        if (!cancelled) sfx.bootStart();
      }
    }
    check();
    return () => { cancelled = true; };
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
    }, 2500);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(finish);
    };
  }, [skip, go]);

  return (
    <div className="h-screen w-screen flex items-center justify-center px-6">
      <div className="w-[640px] max-w-full">
        {!skip ? (
          <>
            {/* Big pixel logo */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "linear" }}
              className="text-center mb-8"
            >
              <div
                ref={titleRef}
                className="np-display text-4xl np-flicker"
                data-text="NULLPATH"
                style={{
                  background:
                    "linear-gradient(180deg, var(--color-cyan) 0%, var(--color-magenta) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  textShadow: "0 0 20px var(--color-cyan-glow)",
                }}
              >
                <span className="np-glitch-text" data-text="NULLPATH">
                  NULLPATH
                </span>
              </div>
              <div className="np-screen text-[9px] tracking-[0.4em] text-[var(--color-fg-3)] mt-3">
                ◇ OFFENSIVE-SECURITY ATLAS ◇
              </div>
            </motion.div>

            {/* Boot log */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="np-pixel-inset p-4 np-mono text-[14px] leading-[1.7]"
            >
              {LINES.slice(0, shown).map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.08 }}
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
                  {line.text.replace("green", "")}
                  {line.text.includes("green") && (
                    <span className="text-[var(--color-lime)]">[ ok ]</span>
                  )}
                  {i === shown - 1 && (
                    <span className="ml-1 inline-block w-[8px] h-[14px] bg-[var(--color-cyan)] np-blink align-middle" />
                  )}
                </motion.div>
              ))}
            </motion.div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="np-display text-4xl np-flicker text-[var(--color-cyan)]">
              <span className="np-glitch-text" data-text="NULLPATH">NULLPATH</span>
              <span className="np-blink ml-2 text-[var(--color-magenta)]">_</span>
            </div>
            <div className="np-screen text-[9px] tracking-[0.4em] text-[var(--color-fg-3)] np-blink">
              LOADING ATLAS...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
