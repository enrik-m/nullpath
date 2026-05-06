/**
 * StatsView — operator stats dashboard with Time Ledger, streak heatmap,
 * progression chart, and operator card export.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Brain, X, Check } from "lucide-react";
import * as db from "../db";
import type { RegionRow, StreakDayRow, RefresherRow, NodeRow } from "../db/types";
import { formatHmShort, levelForXp, xpForLevel } from "../store";
import { sfx } from "../lib/sfx";
import { Button } from "../components/ui/Button";
import { useUi } from "../store";
import {
  OperatorCardPreview,
  OperatorCardOffscreen,
  type OperatorCardData,
} from "../components/OperatorCardPortrait";

interface ZoneTime {
  zone_id: string;
  zone_name: string;
  seconds: number;
  total: number;
  completed: number;
}

export function StatsView() {
  const [, setRegion] = useState<RegionRow | null>(null);
  const [zoneTimes, setZoneTimes] = useState<ZoneTime[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [streakDays, setStreakDays] = useState<StreakDayRow[]>([]);
  const [streak, setStreak] = useState(0);
  const [refreshers, setRefreshers] = useState<Array<RefresherRow & { node: NodeRow | null }>>([]);
  const go = useUi((s) => s.go);
  const selectNode = useUi((s) => s.selectNode);
  const [completedNodes, setCompletedNodes] = useState(0);
  const [totalNodes, setTotalNodes] = useState(0);
  const [xp, setXp] = useState(0);
  const [handle, setHandle] = useState("operator");
  const [allRegions, setAllRegions] = useState<RegionRow[]>([]);
  const [regionPctById, setRegionPctById] = useState<Record<string, number>>({});
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
      const due = await db.dueRefreshers(20);
      const enrichedDue = await Promise.all(
        due.map(async (r) => ({ ...r, node: await db.getNode(r.node_id) })),
      );

      // XP from completed nodes + minutes
      const allKinds = (
        ["foundation", "tool", "recon", "vuln", "defense", "methodology", "capstone"] as const
      ).map((k) => db.nodesByKind(k));
      const all = (await Promise.all(allKinds)).flat();

      // All regions + completion %, for the operator card
      const regionsAll = await db.getRegions();
      const regionPct: Record<string, number> = {};
      for (const reg of regionsAll) {
        const rs = await db.getZoneStats(reg.id);
        const totalN = rs.reduce((s, z) => s + z.total_nodes, 0);
        const doneN = rs.reduce((s, z) => s + z.completed_nodes, 0);
        regionPct[reg.id] = totalN > 0 ? Math.round((doneN / totalN) * 100) : 0;
      }

      // App-state for handle
      const state = await db.getAppState().catch(() => null);

      if (cancelled) return;

      setRegion(r);
      setAllRegions(regionsAll);
      setRegionPctById(regionPct);
      setHandle(state?.handle ?? "operator");
      setStreakDays(days);
      setStreak(st);
      setRefreshers(enrichedDue);

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

  // Build the data object that drives both the inline preview and the
  // hidden export-target card. Memoized so the offscreen DOM doesn't keep
  // re-rendering at every store update.
  const cardData = useMemo<OperatorCardData>(
    () => ({
      handle,
      level,
      xp,
      xpInLvl: intoLvl,
      xpForLvl: lvlSpan,
      streak,
      totalSeconds,
      completedNodes,
      totalNodes,
      topZones: zoneTimes,
      regions: allRegions.map((r) => ({
        id: r.id,
        name: r.name,
        pct: regionPctById[r.id] ?? 0,
        accent: r.color_accent,
        locked: r.is_locked === 1,
      })),
    }),
    [handle, level, xp, intoLvl, lvlSpan, streak, totalSeconds, completedNodes, totalNodes, zoneTimes, allRegions, regionPctById],
  );

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

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function exportCard() {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    setExportMsg(null);
    try {
      // 1. Render the operator card to a high-res PNG via html-to-image.
      //    pixelRatio: 2 gives retina-quality output at the same logical size.
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: "#07091a",
        cacheBust: true,
      });

      // 2. Convert the data URL to raw bytes for writeFile().
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // 3. Suggest a filename with today's date.
      const today = new Date().toISOString().split("T")[0];
      const profileHandle = "operator"; // (read from app_state if you want)
      const defaultName = `nullpath-${profileHandle}-${today}.png`;

      // 4. Open the native save dialog so the user picks the location.
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        title: "Export operator card",
        defaultPath: defaultName,
        filters: [{ name: "PNG image", extensions: ["png"] }],
      });

      if (!path) {
        // User canceled — silent
        setExporting(false);
        return;
      }

      // 5. Write the PNG to the chosen path.
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      await writeFile(path, bytes);

      sfx.success();
      const filename = path.split(/[\\/]/).pop() || path;
      setExportMsg({ ok: true, text: `Saved → ${filename}` });
      window.setTimeout(() => setExportMsg(null), 4000);
    } catch (err) {
      console.error("[export] operator card failed:", err);
      sfx.warn();
      const msg = err instanceof Error ? err.message : String(err);
      setExportMsg({ ok: false, text: `Export failed — ${msg}` });
      window.setTimeout(() => setExportMsg(null), 6000);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto relative">
      <div className="px-4 sm:px-10 py-6 sm:py-10 max-w-[1400px] mx-auto">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="np-mono text-[10px] tracking-[0.4em] text-[var(--color-fg-3)] uppercase mb-2">
            // stats
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-0)]">
            Operator dossier
          </h1>
        </motion.div>

        {/* Two-column layout — stats scroll on the left, card stays put on the right */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          {/* ═══════ LEFT COLUMN — scrolling content ═══════ */}
          <div className="space-y-6 min-w-0">
            {/* Top stats strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Level" value={`${level}`} accent="var(--color-magenta)" sub={`${Math.round(lvlPct)}% to ${level + 1}`} />
              <Stat label="Total XP" value={`${xp.toLocaleString()}`} accent="var(--color-cyan)" />
              <Stat label="Streak" value={`${streak}d`} accent="var(--color-amber)" />
              <Stat
                label="Time logged"
                value={formatHmShort(totalSeconds)}
                accent="var(--color-lime)"
              />
            </div>

        {/* Refreshers due */}
        {refreshers.length > 0 && (
          <div className="np-pixel rounded-lg p-5 mt-6 border-[var(--color-magenta-dim)]">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={14} className="text-[var(--color-magenta)]" />
              <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-magenta)]">
                // refreshers due · {refreshers.length}
              </div>
            </div>
            <div className="text-[13px] text-[var(--color-fg-2)] mb-3">
              Spaced repetition queue. Mental check: still got it? Tap green if recall lands clean,
              red to push it back to 1-day spacing.
            </div>
            <div className="space-y-1.5">
              {refreshers.slice(0, 6).map((r) => (
                <div
                  key={r.id}
                  className="np-pixel rounded px-3 py-2 flex items-center gap-3"
                >
                  <button
                    onClick={() => {
                      sfx.click();
                      if (r.node) {
                        go({ name: "zone", zoneId: r.node.zone_id });
                        selectNode(r.node.id);
                      }
                    }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="np-mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-magenta)]">
                      {r.node_id} · streak {r.streak}
                    </div>
                    <div className="text-[14px] text-[var(--color-fg-0)] truncate mt-0.5">
                      {r.node?.name ?? "—"}
                    </div>
                  </button>
                  <button
                    onClick={async () => {
                      sfx.success();
                      await db.ackRefresher(r.node_id, true);
                      const due = await db.dueRefreshers(20);
                      const enrichedDue = await Promise.all(
                        due.map(async (rr) => ({ ...rr, node: await db.getNode(rr.node_id) })),
                      );
                      setRefreshers(enrichedDue);
                    }}
                    className="p-1.5 rounded text-[var(--color-lime)] hover:bg-[color-mix(in_oklab,var(--color-lime)_10%,transparent)]"
                    title="Recalled cleanly"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={async () => {
                      sfx.warn();
                      await db.ackRefresher(r.node_id, false);
                      const due = await db.dueRefreshers(20);
                      const enrichedDue = await Promise.all(
                        due.map(async (rr) => ({ ...rr, node: await db.getNode(rr.node_id) })),
                      );
                      setRefreshers(enrichedDue);
                    }}
                    className="p-1.5 rounded text-[var(--color-rose)] hover:bg-[color-mix(in_oklab,var(--color-rose)_10%,transparent)]"
                    title="Forgot — re-study"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Streak heatmap */}
        <div className="np-pixel rounded-lg p-5 mt-6">
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
        <div className="np-pixel rounded-lg p-5 mt-6">
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
                    <div className="flex items-center justify-between text-[13px]">
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
          </div>{/* end left column */}

          {/* ═══════ RIGHT COLUMN — sticky operator card ═══════ */}
          <aside className="lg:sticky lg:top-6 lg:self-start space-y-3">
            <div className="np-pixel-inset p-3">
              <div className="np-screen text-[10px] tracking-[0.25em] uppercase text-[var(--color-fg-2)] mb-2 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-[var(--color-magenta)]" />
                OPERATOR CARD
              </div>
              <OperatorCardPreview data={cardData} maxWidth={296} />
              <div className="np-screen text-[9px] tracking-[0.2em] text-[var(--color-fg-3)] mt-2 text-center">
                EXPORTS AS 1080×1920 PNG
              </div>
            </div>

            <Button variant="primary" size="md" onClick={exportCard} disabled={exporting} className="w-full">
              <Camera size={13} />
              {exporting ? "RENDERING…" : "EXPORT CARD"}
            </Button>

            {exportMsg && (
              <div
                className="np-screen text-[10px] tracking-[0.15em] text-center px-2 py-2"
                style={{
                  color: exportMsg.ok ? "var(--color-lime)" : "var(--color-rose)",
                  borderTop: `2px solid ${exportMsg.ok ? "var(--color-lime-dim)" : "var(--color-rose-dim)"}`,
                  borderBottom: `2px solid ${exportMsg.ok ? "var(--color-lime-dim)" : "var(--color-rose-dim)"}`,
                }}
              >
                {exportMsg.text}
              </div>
            )}
          </aside>
        </div>{/* end grid */}

        {/* Hidden full-size card — html-to-image targets this on Export */}
        <OperatorCardOffscreen data={cardData} containerRef={cardRef} />
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
    <div className="np-pixel rounded p-4">
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

