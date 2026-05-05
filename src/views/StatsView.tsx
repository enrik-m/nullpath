/**
 * StatsView — operator stats dashboard with Time Ledger, streak heatmap,
 * progression chart, and operator card export.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera } from "lucide-react";
import * as db from "../db";
import type { RegionRow, StreakDayRow } from "../db/types";
import { formatHmShort, levelForXp, xpForLevel } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/Button";

interface ZoneTime {
  zone_id: string;
  zone_name: string;
  seconds: number;
  total: number;
  completed: number;
}

export function StatsView() {
  const [region, setRegion] = useState<RegionRow | null>(null);
  const [zoneTimes, setZoneTimes] = useState<ZoneTime[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [streakDays, setStreakDays] = useState<StreakDayRow[]>([]);
  const [streak, setStreak] = useState(0);
  const [completedNodes, setCompletedNodes] = useState(0);
  const [totalNodes, setTotalNodes] = useState(0);
  const [xp, setXp] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const r = await db.getRegion("web");
      const zs = await db.getZones("web");
      const stats = await db.getZoneStats("web");
      const times = await db.studySecondsByZone();
      const total = await db.totalStudySeconds();
      const days = await db.getStreakDays(56);
      const st = await db.currentStreak();

      // XP from completed nodes + minutes
      const allKinds = (
        ["foundation", "tool", "recon", "vuln", "defense", "methodology", "capstone"] as const
      ).map((k) => db.nodesByKind(k));
      const all = (await Promise.all(allKinds)).flat();

      if (cancelled) return;

      setRegion(r);
      setStreakDays(days);
      setStreak(st);

      const completedXp = all.filter((n) => n.status === "complete").reduce((s, n) => s + (n.user_xp || 0), 0);
      const minuteXp = Math.floor(total / 60) * 4;
      setXp(completedXp + minuteXp);
      setCompletedNodes(all.filter((n) => n.status === "complete").length);
      setTotalNodes(all.length);
      setTotalSeconds(total);

      const statsMap = new Map(stats.map((s) => [s.zone_id, s]));
      const timesMap = new Map(times.map((t) => [t.zone_id, t.seconds]));
      const zoneTimesArr: ZoneTime[] = zs.map((z) => ({
        zone_id: z.id,
        zone_name: z.name,
        seconds: timesMap.get(z.id) ?? 0,
        total: statsMap.get(z.id)?.total_nodes ?? 0,
        completed: statsMap.get(z.id)?.completed_nodes ?? 0,
      }));
      zoneTimesArr.sort((a, b) => b.seconds - a.seconds);
      setZoneTimes(zoneTimesArr);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const level = levelForXp(xp);
  const nextThreshold = xpForLevel(level + 1);
  const curThreshold = xpForLevel(level);
  const intoLvl = xp - curThreshold;
  const lvlSpan = nextThreshold - curThreshold;
  const lvlPct = lvlSpan > 0 ? (intoLvl / lvlSpan) * 100 : 0;

  // 56-day heatmap (8 weeks)
  const heatmap = useMemo(() => {
    const map = new Map(streakDays.map((d) => [d.day, d]));
    const out: { day: string; intensity: number; seconds: number }[] = [];
    const today = new Date();
    for (let i = 55; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const row = map.get(key);
      const sec = row?.seconds_studied ?? 0;
      let intensity = 0;
      if (sec > 0) intensity = 1;
      if (sec >= 1800) intensity = 2; // 30m
      if (sec >= 5400) intensity = 3; // 90m
      if (sec >= 14400) intensity = 4; // 4h
      out.push({ day: key, intensity, seconds: sec });
    }
    return out;
  }, [streakDays]);

  function exportCard() {
    sfx.success();
    if (!cardRef.current) return;
    // Render card via canvas — we use html2canvas-style approach with SVG
    // serialization for simplicity. Simplest path: take a screenshot via the
    // platform's print API. For desktop, save as PNG via canvas2image isn't
    // available without a lib. Use the print-to-image trick: open a new
    // window with the card and prompt save.
    const html = cardRef.current.outerHTML;
    const blob = new Blob(
      [
        `<!doctype html><html><head><meta charset="utf-8"><title>operator-card</title>
         <style>
           body{margin:0;padding:40px;background:#06070b;display:grid;place-items:center;min-height:100vh;
                font-family:'Inter',system-ui;}
           ${getAllStyles()}
         </style></head><body>${html}</body></html>`,
      ],
      { type: "text/html" },
    );
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "width=720,height=900");
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-10 py-10 max-w-[1100px]">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="np-mono text-[10px] tracking-[0.4em] text-[var(--color-fg-3)] uppercase mb-2">
              // stats
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg-0)]">
              Operator dossier
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={exportCard}>
            <Camera size={12} />
            Export operator card
          </Button>
        </motion.div>

        {/* Top stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Level" value={`${level}`} accent="var(--color-magenta)" sub={`${Math.round(lvlPct)}% to ${level + 1}`} />
          <Stat label="Total XP" value={`${xp.toLocaleString()}`} accent="var(--color-cyan)" />
          <Stat label="Streak" value={`${streak}d`} accent="var(--color-amber)" />
          <Stat
            label="Time logged"
            value={formatHmShort(totalSeconds)}
            accent="var(--color-lime)"
          />
        </div>

        {/* Operator Card (also exportable) */}
        <div ref={cardRef}>
          <OperatorCard
            handle="operator"
            level={level}
            xp={xp}
            streak={streak}
            totalSeconds={totalSeconds}
            completedNodes={completedNodes}
            totalNodes={totalNodes}
            topZones={zoneTimes.slice(0, 3)}
            accent={region?.color_accent ?? "#22d3ee"}
          />
        </div>

        {/* Streak heatmap */}
        <div className="np-glass rounded-lg p-5 mt-6">
          <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-fg-2)] mb-3">
            // streak · last 8 weeks
          </div>
          <div className="grid grid-cols-[repeat(56,1fr)] gap-[3px]" style={{ gridAutoFlow: "row" }}>
            {heatmap.map((c) => (
              <div
                key={c.day}
                className="aspect-square rounded-sm"
                style={{
                  background:
                    c.intensity === 0
                      ? "var(--color-bg-3)"
                      : c.intensity === 1
                        ? "color-mix(in oklab, var(--color-cyan) 25%, var(--color-bg-3))"
                        : c.intensity === 2
                          ? "color-mix(in oklab, var(--color-cyan) 50%, var(--color-bg-3))"
                          : c.intensity === 3
                            ? "color-mix(in oklab, var(--color-cyan) 75%, var(--color-bg-3))"
                            : "var(--color-cyan)",
                }}
                title={`${c.day} · ${formatHmShort(c.seconds)}`}
              />
            ))}
          </div>
        </div>

        {/* Time Ledger */}
        <div className="np-glass rounded-lg p-5 mt-6">
          <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-fg-2)] mb-4">
            // time ledger · per zone
          </div>
          <div className="space-y-2">
            {zoneTimes.map((z) => {
              const maxSec = zoneTimes[0]?.seconds || 1;
              const pct = z.seconds > 0 ? (z.seconds / maxSec) * 100 : 0;
              return (
                <div key={z.zone_id} className="flex items-center gap-3">
                  <div className="w-12 np-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-fg-3)]">
                    {z.zone_id}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-[var(--color-fg-1)]">{z.zone_name}</span>
                      <span className="np-mono text-[var(--color-fg-2)]">
                        {formatHmShort(z.seconds)}
                      </span>
                    </div>
                    <div className="h-1.5 mt-1 rounded-full bg-[var(--color-bg-3)] overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background:
                            z.completed === z.total && z.total > 0
                              ? "var(--color-lime)"
                              : "var(--color-cyan)",
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-16 np-mono text-[10px] text-[var(--color-fg-3)] text-right">
                    {z.completed}/{z.total}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="np-glass rounded p-4">
      <div className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
        {label}
      </div>
      <div className="np-mono text-3xl mt-1" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="np-mono text-[10px] text-[var(--color-fg-3)] mt-1">{sub}</div>}
    </div>
  );
}

function OperatorCard({
  handle,
  level,
  xp,
  streak,
  totalSeconds,
  completedNodes,
  totalNodes,
  topZones,
  accent,
}: {
  handle: string;
  level: number;
  xp: number;
  streak: number;
  totalSeconds: number;
  completedNodes: number;
  totalNodes: number;
  topZones: ZoneTime[];
  accent: string;
}) {
  return (
    <div
      className="rounded-lg p-6 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--color-bg-2) 0%, var(--color-bg-1) 100%)",
        border: `1px solid ${accent}55`,
        boxShadow: `0 0 32px ${accent}22, inset 0 0 0 1px var(--color-border-subtle)`,
      }}
    >
      <div
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-30"
        style={{ background: accent }}
      />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <div className="np-mono text-[10px] tracking-[0.4em] uppercase text-[var(--color-fg-3)]">
              // OPERATOR · NULLPATH
            </div>
            <div className="text-3xl font-bold tracking-tight text-[var(--color-fg-0)] mt-1">
              {handle}
            </div>
          </div>
          <div className="text-right">
            <div className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
              level
            </div>
            <div className="np-mono text-5xl font-bold" style={{ color: accent }}>
              {level}
            </div>
          </div>
        </div>

        <div className="np-divider my-4" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 np-mono">
          <div>
            <div className="text-[9px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">XP</div>
            <div className="text-base text-[var(--color-fg-0)]">{xp.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">streak</div>
            <div className="text-base text-[var(--color-amber)]">{streak}d</div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">time</div>
            <div className="text-base text-[var(--color-lime)]">{formatHmShort(totalSeconds)}</div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">nodes</div>
            <div className="text-base text-[var(--color-cyan)]">
              {completedNodes}/{totalNodes}
            </div>
          </div>
        </div>

        {topZones.some((z) => z.seconds > 0) && (
          <>
            <div className="np-divider my-4" />
            <div className="np-mono text-[9px] tracking-[0.3em] uppercase text-[var(--color-fg-3)] mb-2">
              specialties
            </div>
            <div className="flex gap-2 flex-wrap">
              {topZones
                .filter((z) => z.seconds > 0)
                .map((z) => (
                  <span
                    key={z.zone_id}
                    className={cn(
                      "np-mono text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded border",
                    )}
                    style={{
                      borderColor: accent + "55",
                      color: accent,
                    }}
                  >
                    {z.zone_id} · {z.zone_name}
                  </span>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Capture all stylesheet text (used for the export window so the card looks right)
function getAllStyles(): string {
  const sheets = Array.from(document.styleSheets);
  const lines: string[] = [];
  for (const sheet of sheets) {
    try {
      const rules = (sheet as CSSStyleSheet).cssRules;
      if (!rules) continue;
      for (const r of Array.from(rules)) {
        lines.push((r as CSSRule).cssText);
      }
    } catch {
      // Cross-origin stylesheet — skip
    }
  }
  return lines.join("\n");
}
