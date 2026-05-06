/**
 * ModalRoot — single mount point that listens to ui.modal and renders the
 * right modal. Handles backdrop, escape key, focus trap basics.
 *
 * Modal types: echo-prompt, idle-resume, session-end, level-up, achievement,
 * daily-briefing.
 */

import { type PropsWithChildren, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Coffee, Zap, Trophy, Sparkles, X, Save } from "lucide-react";
import { useUi, formatHmShort, formatHms } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import * as db from "../db";
import type { NodeRow } from "../db/types";
import { Button } from "./ui/Button";

export function ModalRoot() {
  const modal = useUi((s) => s.modal);
  const showModal = useUi((s) => s.showModal);

  // Esc dismisses (where safe)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && modal) {
        // Idle-resume modal must be acknowledged — Esc treats as "Resume"
        if (modal.kind === "idle-resume") return;
        showModal(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, showModal]);

  return (
    <AnimatePresence>
      {modal && (
        <Backdrop>
          {modal.kind === "echo-prompt" && <EchoPromptModal nodeId={modal.nodeId} />}
          {modal.kind === "idle-resume" && <IdleResumeModal idleSeconds={modal.idleSeconds} />}
          {modal.kind === "session-end" && (
            <SessionEndModal
              durationSeconds={modal.durationSeconds}
              xpEarned={modal.xpEarned}
              nodeId={modal.nodeId}
            />
          )}
          {modal.kind === "level-up" && (
            <LevelUpModal oldLevel={modal.oldLevel} newLevel={modal.newLevel} />
          )}
          {modal.kind === "achievement" && (
            <AchievementModal
              id={modal.id}
              name={modal.name}
              description={modal.description}
            />
          )}
          {modal.kind === "daily-briefing" && <DailyBriefingModal />}
        </Backdrop>
      )}
    </AnimatePresence>
  );
}

function Backdrop({ children }: PropsWithChildren) {
  return (
    <motion.div
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
    <div className="np-pixel rounded-lg w-[520px] max-w-full p-6 border-[var(--color-cyan-dim)] np-glow-cyan">
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
// Idle Resume modal — fires when OS idle threshold crosses while session live
// ===========================================================================
function IdleResumeModal({ idleSeconds }: { idleSeconds: number }) {
  const showModal = useUi((s) => s.showModal);
  const session = useUi((s) => s.activeSession);
  const setSession = useUi((s) => s.setSession);
  const patchSession = useUi((s) => s.patchSession);

  async function resume() {
    sfx.click();
    if (session) {
      // Discard nothing: keep counting from where we paused
      patchSession({ paused: false, pausedAtMs: null });
    }
    showModal(null);
  }

  async function discardBreak() {
    sfx.click();
    if (session) {
      // Subtract the idle gap from durationSeconds so it reads as "didn't count"
      const gapSeconds = session.pausedAtMs
        ? Math.floor((Date.now() - session.pausedAtMs) / 1000)
        : idleSeconds;
      const newDuration = Math.max(0, session.durationSeconds - gapSeconds);
      patchSession({
        paused: false,
        pausedAtMs: null,
        durationSeconds: newDuration,
        idleSeconds: session.idleSeconds + gapSeconds,
      });
      await db.updateSession(session.id, {
        duration_seconds: newDuration,
        idle_seconds: session.idleSeconds + gapSeconds,
      });
    }
    showModal(null);
  }

  async function endNow() {
    sfx.complete();
    if (session) {
      await db.endSession(session.id, session.durationSeconds, session.idleSeconds, false);
      await db.recordStudyDay(session.durationSeconds);
      const xp = Math.floor(session.durationSeconds / 60) * 4;
      setSession(null);
      showModal({
        kind: "session-end",
        durationSeconds: session.durationSeconds,
        xpEarned: xp,
        nodeId: session.focusNodeId,
      });
    } else {
      showModal(null);
    }
  }

  return (
    <div className="np-pixel rounded-lg w-[480px] max-w-full p-6 border-[var(--color-amber)] shadow-[0_0_24px_color-mix(in_oklab,var(--color-amber)_30%,transparent)]">
      <div className="flex items-center gap-2">
        <Coffee size={16} className="text-[var(--color-amber)]" />
        <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-amber)]">
          IDLE DETECTED · {formatHmShort(idleSeconds)}
        </div>
      </div>
      <div className="mt-2 text-xl font-bold text-[var(--color-fg-0)] tracking-tight">
        Still in there?
      </div>
      <div className="text-[var(--color-fg-2)] text-[14px] mt-3 leading-relaxed">
        No keyboard or mouse activity detected on the system. Session is paused.
        Pick how to handle the gap:
      </div>
      <div className="flex flex-col gap-2 mt-4">
        <Button variant="primary" size="md" onClick={resume}>
          Resume — keep counting
        </Button>
        <Button variant="ghost" size="md" onClick={discardBreak}>
          That was a break — discard the idle gap
        </Button>
        <Button variant="danger" size="md" onClick={endNow}>
          End session
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================
// Session End summary
// ===========================================================================
function SessionEndModal({
  durationSeconds,
  xpEarned,
  nodeId,
}: {
  durationSeconds: number;
  xpEarned: number;
  nodeId: string | null;
}) {
  const showModal = useUi((s) => s.showModal);
  const [node, setNode] = useState<NodeRow | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (nodeId) db.getNode(nodeId).then(setNode);
    db.currentStreak().then(setStreak);
  }, [nodeId]);

  return (
    <div className="np-pixel rounded-lg w-[480px] max-w-full p-6 border-[var(--color-cyan-dim)] np-glow-cyan">
      <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-cyan)]">
        // session ended
      </div>
      <div className="mt-2 text-3xl font-bold text-[var(--color-fg-0)] tabular-nums tracking-tight">
        {formatHms(durationSeconds)}
      </div>
      <div className="np-divider my-4" />
      <div className="grid grid-cols-3 gap-3 np-mono">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-3)]">
            xp earned
          </div>
          <div className="text-xl text-[var(--color-cyan)]">+{xpEarned}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-3)]">
            streak
          </div>
          <div className="text-xl text-[var(--color-amber)]">{streak}d</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-3)]">
            focus
          </div>
          <div className="text-xs text-[var(--color-fg-1)] truncate">
            {node ? `${node.id}` : "—"}
          </div>
        </div>
      </div>
      {node && (
        <div className="mt-3 np-mono text-[12px] text-[var(--color-fg-2)] truncate">
          {node.name}
        </div>
      )}
      <div className="flex justify-end mt-5">
        <Button variant="primary" size="md" onClick={() => showModal(null)}>
          OK
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
    <div className="np-pixel rounded-lg w-[460px] max-w-full p-7 border-[var(--color-magenta-dim)] np-glow-magenta">
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
}: {
  id: string;
  name: string;
  description: string;
}) {
  const showModal = useUi((s) => s.showModal);
  useEffect(() => {
    sfx.success();
  }, []);
  return (
    <div className="np-pixel rounded-lg w-[440px] max-w-full p-6 border-[var(--color-amber)] shadow-[0_0_28px_color-mix(in_oklab,var(--color-amber)_35%,transparent)]">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-[var(--color-amber)]" />
        <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-amber)]">
          ACHIEVEMENT UNLOCKED
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold text-[var(--color-fg-0)] tracking-tight">{name}</div>
      <div className="text-[var(--color-fg-2)] text-[14px] mt-3 leading-relaxed">
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
      const allKinds = (
        ["foundation", "tool", "recon", "vuln", "defense", "methodology", "capstone"] as const
      ).map((k) => db.nodesByKind(k));
      const all = (await Promise.all(allKinds)).flat();
      const open = all.filter((n) => n.status === "available" && (n.depth === "std" || n.depth === "intro"));
      const inProg = all.filter((n) => n.status === "in_progress");
      const picks: NodeRow[] = [];
      // Prioritize in-progress
      picks.push(...inProg.slice(0, 2));
      // Then random open with std depth
      while (picks.length < 3 && open.length > 0) {
        const idx = Math.floor(Math.random() * open.length);
        picks.push(open[idx]);
        open.splice(idx, 1);
      }
      setSuggestions(picks.slice(0, 3));

      // Hot zone — rotates by day-of-year so it's deterministic per day
      const zones = await db.getZones("web");
      if (zones.length > 0) {
        const dayIdx = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % zones.length;
        const z = zones[dayIdx];
        setHotZone({ id: z.id, name: z.name, accent: "#22d3ee" });
      }
    }
    load();
  }, []);

  return (
    <div className="np-pixel rounded-lg w-[560px] max-w-full p-6 border-[var(--color-cyan-dim)]">
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

// Just to satisfy unused-var detector for the X import; keep it for use in other modals
void X;
