/**
 * ModalRoot — single mount point that listens to ui.modal and renders the
 * right modal. Handles backdrop and escape key.
 *
 * Modal kinds: echo-prompt, level-up, achievement, daily-briefing.
 */

import { type PropsWithChildren, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Zap, Trophy, Sparkles, Save } from "lucide-react";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import * as db from "../db";
import type { NodeRow } from "../db/types";
import { Button } from "./ui/Button";
import { LIMITS } from "../lib/limits";
import { resolveAchievementIcon } from "../lib/achievementIcons";

/** All focusable selectors we tab between when a modal is open. */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function ModalRoot() {
  const modal = useUi((s) => s.modal);
  const showModal = useUi((s) => s.showModal);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Esc dismisses + focus trap. While a modal is mounted we cycle Tab
  // within `containerRef` and restore focus to whatever was focused before
  // the modal opened on dismiss (standard accessibility pattern).
  useEffect(() => {
    if (!modal) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;

    // Defer to give framer-motion time to mount the modal DOM
    const focusTimer = window.setTimeout(() => {
      const root = containerRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }, 60);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        showModal(null);
        return;
      }
      if (e.key !== "Tab") return;
      const root = containerRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      // Restore focus to whatever opened the modal
      lastFocusedRef.current?.focus?.();
    };
  }, [modal, showModal]);

  return (
    <AnimatePresence>
      {modal && (
        <Backdrop containerRef={containerRef}>
          {modal.kind === "echo-prompt" && <EchoPromptModal nodeId={modal.nodeId} />}
          {modal.kind === "level-up" && (
            <LevelUpModal oldLevel={modal.oldLevel} newLevel={modal.newLevel} />
          )}
          {modal.kind === "achievement" && (
            <AchievementModal
              id={modal.id}
              name={modal.name}
              description={modal.description}
              icon={modal.icon}
            />
          )}
          {modal.kind === "daily-briefing" && <DailyBriefingModal />}
        </Backdrop>
      )}
    </AnimatePresence>
  );
}

function Backdrop({
  children,
  containerRef,
}: PropsWithChildren<{ containerRef: React.RefObject<HTMLDivElement | null> }>) {
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        background: "color-mix(in oklab, #06070b 65%, transparent)",
        backdropFilter: "blur(8px)",
      }}
    >
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 6 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ===========================================================================
// Echo Mode prompt
// ===========================================================================
function EchoPromptModal({ nodeId }: { nodeId: string }) {
  const showModal = useUi((s) => s.showModal);
  const [node, setNode] = useState<NodeRow | null>(null);
  const [text, setText] = useState("");
  const [existing, setExisting] = useState("");

  useEffect(() => {
    db.getNode(nodeId).then((n) => setNode(n));
    db.getNote(nodeId).then((n) => setExisting(n?.body_md ?? ""));
  }, [nodeId]);

  async function save() {
    sfx.success();
    const stamp = new Date().toLocaleString();
    const echo = `\n\n---\n_echo · ${stamp}_\n${text.trim()}`;
    const body = (existing.trim() ? existing.trim() : "") + (text.trim() ? echo : "");
    if (text.trim()) await db.upsertNote(nodeId, body);
    showModal(null);
  }

  function skip() {
    sfx.click();
    showModal(null);
  }

  return (
    <div className="np-pixel rounded-lg w-[520px] max-w-full p-4 sm:p-6 border-[var(--color-cyan-dim)] np-glow-cyan">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={16} className="text-[var(--color-lime)]" />
        <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-lime)]">
          NODE COMPLETE
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold text-[var(--color-fg-0)] tracking-tight">
        {node?.name ?? "..."}
      </div>
      <div className="np-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-fg-3)] mt-1">
        {node?.id} · echo mode
      </div>
      <div className="text-[var(--color-fg-2)] text-[14px] mt-4 leading-relaxed">
        Three-sentence gist — what did you actually learn? This pins to the node's notes
        and forces synthesis. Skip if you want, but doing this once consolidates 10x more
        than re-reading.
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="In your own words..."
        maxLength={LIMITS.noteBody}
        aria-label="Echo summary"
        className="w-full mt-3 bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-[14px] text-[var(--color-fg-0)] np-mono focus:border-[var(--color-cyan-dim)] focus:outline-none min-h-[100px] resize-y"
      />
      <div className="flex gap-2 justify-end mt-4">
        <Button variant="ghost" size="sm" onClick={skip}>
          Skip
        </Button>
        <Button variant="primary" size="sm" onClick={save}>
          <Save size={12} /> Save echo
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================
// Level Up
// ===========================================================================
function LevelUpModal({ oldLevel, newLevel }: { oldLevel: number; newLevel: number }) {
  const showModal = useUi((s) => s.showModal);
  useEffect(() => {
    sfx.levelUp();
  }, []);
  return (
    <div className="np-pixel rounded-lg w-[460px] max-w-full p-4 sm:p-6 border-[var(--color-magenta-dim)] np-glow-magenta">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-[var(--color-magenta)]" />
        <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-magenta)]">
          LEVEL UP
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <div className="np-mono text-3xl text-[var(--color-fg-2)] line-through opacity-60">
          {oldLevel}
        </div>
        <div className="np-mono text-7xl font-bold text-[var(--color-magenta)]">{newLevel}</div>
      </div>
      <div className="text-[var(--color-fg-2)] text-[14px] mt-4">
        Operator capacity raised. Keep moving.
      </div>
      <div className="flex justify-end mt-5">
        <Button variant="outline" size="md" onClick={() => showModal(null)}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================
// Achievement Unlocked
// ===========================================================================
function AchievementModal({
  name,
  description,
  icon,
}: {
  id: string;
  name: string;
  description: string;
  icon: string;
}) {
  const showModal = useUi((s) => s.showModal);
  // Lazy-required to avoid a circular import (achievements.ts → ModalRoot
  // would loop). resolveAchievementIcon is pure synchronous string→component.
  const Icon = resolveAchievementIcon(icon);
  useEffect(() => {
    sfx.success();
  }, []);
  return (
    <div className="np-pixel rounded-lg w-[440px] max-w-full p-4 sm:p-6 border-[var(--color-amber)] shadow-[0_0_28px_color-mix(in_oklab,var(--color-amber)_35%,transparent)]">
      <div className="flex items-center gap-2">
        <Trophy size={14} className="text-[var(--color-amber)]" />
        <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-amber)]">
          ACHIEVEMENT UNLOCKED
        </div>
      </div>

      {/* Trophy badge — themed icon on a chunky pixel tile, amber glow. */}
      <div className="flex items-center gap-4 mt-4">
        <div
          className="np-pixel-flat shrink-0 w-16 h-16 flex items-center justify-center"
          style={{
            borderColor: "var(--color-amber)",
            background: "color-mix(in oklab, var(--color-amber) 12%, var(--color-bg-2))",
            boxShadow: "0 0 18px color-mix(in oklab, var(--color-amber) 40%, transparent)",
          }}
        >
          <Icon size={30} className="text-[var(--color-amber)]" strokeWidth={2.4} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold text-[var(--color-fg-0)] tracking-tight leading-tight">
            {name}
          </div>
        </div>
      </div>

      <div className="text-[var(--color-fg-2)] text-[14px] mt-4 leading-relaxed">
        {description}
      </div>
      <div className="flex justify-end mt-4">
        <Button variant="primary" size="sm" onClick={() => showModal(null)}>
          Nice
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================
// Daily Briefing — first launch of day
// ===========================================================================
function DailyBriefingModal() {
  const showModal = useUi((s) => s.showModal);
  const go = useUi((s) => s.go);
  const [streak, setStreak] = useState(0);
  const [freezeTokens, setFreezeTokens] = useState(0);
  const [suggestions, setSuggestions] = useState<NodeRow[]>([]);
  const [hotZone, setHotZone] = useState<{ id: string; name: string; accent: string } | null>(
    null,
  );

  useEffect(() => {
    async function load() {
      const st = await db.currentStreak();
      setStreak(st);
      const state = await db.getAppState();
      setFreezeTokens(state.freeze_tokens);

      // Pick 3 suggestions: 1 from your weakest in-progress zone, 2 from
      // available std-depth in zones you've started.
      const all = await db.getAllNodes();
      const open = all.filter((n) => n.status === "available" && (n.depth === "std" || n.depth === "intro"));
      const inProg = all.filter((n) => n.status === "in_progress");
      const picks: NodeRow[] = [];
      // Prioritize in-progress
      picks.push(...inProg.slice(0, 2));
      // Then random open with std depth
      while (picks.length < 3 && open.length > 0) {
        const idx = Math.floor(Math.random() * open.length);
        const pick = open[idx];
        if (!pick) break;
        picks.push(pick);
        open.splice(idx, 1);
      }
      setSuggestions(picks.slice(0, 3));

      // Hot zone — rotates by day-of-year so it's deterministic per day
      const zones = await db.getZones("web");
      const dayIdx = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % zones.length;
      const z = zones[dayIdx];
      if (z) {
        setHotZone({ id: z.id, name: z.name, accent: "#22d3ee" });
      }
    }
    load();
  }, []);

  return (
    <div className="np-pixel rounded-lg w-[560px] max-w-full p-4 sm:p-6 border-[var(--color-cyan-dim)]">
      <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-fg-3)]">
        // daily briefing · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </div>
      <div className="mt-2 text-2xl font-bold text-[var(--color-fg-0)] tracking-tight">
        Welcome back, operator.
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <Stat label="Streak" value={`${streak}d`} color="var(--color-amber)" />
        <Stat label="Freeze" value={`${freezeTokens}`} color="var(--color-cyan)" />
        <Stat label="Hot zone" value={hotZone?.id ?? "—"} color={hotZone?.accent ?? "var(--color-fg-2)"} />
      </div>

      <div className="np-divider my-5" />

      <div className="np-mono text-[10px] tracking-[0.25em] uppercase text-[var(--color-fg-2)] mb-2">
        // suggested today
      </div>
      <div className="space-y-1.5">
        {suggestions.map((n) => (
          <button
            key={n.id}
            className="w-full text-left np-pixel rounded px-3 py-2 hover:border-[var(--color-cyan-dim)] transition flex items-center gap-2"
            onClick={() => {
              sfx.click();
              go({ name: "zone", zoneId: n.zone_id });
              useUi.getState().selectNode(n.id);
              showModal(null);
            }}
          >
            <span className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-cyan)]">
              {n.id}
            </span>
            <span className="text-[14px] flex-1 truncate">{n.name}</span>
            <span
              className={cn(
                "np-mono text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded-sm border",
                n.status === "in_progress"
                  ? "text-[var(--color-cyan)] border-[var(--color-cyan-dim)]"
                  : "text-[var(--color-fg-2)] border-[var(--color-border-default)]",
              )}
            >
              {n.status === "in_progress" ? "RESUME" : "START"}
            </span>
          </button>
        ))}
        {suggestions.length === 0 && (
          <div className="np-mono text-[13px] text-[var(--color-fg-3)]">
            no suggestions yet — start a zone to seed the briefing
          </div>
        )}
      </div>

      <div className="flex justify-end mt-5">
        <Button variant="primary" size="md" onClick={() => showModal(null)}>
          <Zap size={12} />
          Begin
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="np-pixel rounded px-3 py-2.5">
      <div className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
        {label}
      </div>
      <div className="np-mono text-2xl mt-0.5" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
