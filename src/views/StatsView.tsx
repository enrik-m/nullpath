/**
 * StatsView — operator stats dashboard.
 *
 * Shows level / XP / streak / nodes-cleared, an 8-week completion heatmap,
 * spaced-repetition refreshers due, per-zone progress bars, and the
 * shareable Operator Card export (1080×1920 PNG).
 *
 * No time-tracking — all metrics derive from completion events recorded in
 * `streak_day` (each completed node bumps `sessions` for that day).
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Brain, X, Check } from "lucide-react";
import * as db from "../db";
import type { StreakDayRow, RefresherRow, NodeRow } from "../db/types";
// RefresherRow + NodeRow remain referenced via the dueRefreshersWithNode
// return shape (typed inline below).
import { computeOperatorXp, levelForXp, xpForLevel } from "../store";
import { sfx } from "../lib/sfx";
import { toast } from "../lib/toast";
import { Button } from "../components/ui/Button";
import { useUi } from "../store";
import type { OperatorCardData } from "../components/OperatorCardPortrait";

// The card module pulls in 1080×1920 worth of inline SVG sprites + a long
// styled tree. It's only ever rendered on this view, so split it from the
// main bundle. The export path additionally lazy-imports html-to-image
// (already done) and tauri's dialog/fs plugins on demand.
const OperatorCardPreview = lazy(() =>
  import("../components/OperatorCardPortrait").then((m) => ({
    default: m.OperatorCardPreview,
  })),
);
const OperatorCardOffscreen = lazy(() =>
  import("../components/OperatorCardPortrait").then((m) => ({
    default: m.OperatorCardOffscreen,
  })),
);

interface ZoneProgress {
  zone_id: string;
  zone_name: string;
  total: number;
  completed: number;
  in_progress: number;
}

export function StatsView() {
  const [zones, setZones] = useState<ZoneProgress[]>([]);
  const [streakDays, setStreakDays] = useState<StreakDayRow[]>([]);
  const [streak, setStreak] = useState(0);
  const [refreshers, setRefreshers] = useState<
    Array<RefresherRow & { node: NodeRow | null }>
  >([]);
  const go = useUi((s) => s.go);
  const selectNode = useUi((s) => s.selectNode);
  const [completedNodes, setCompletedNodes] = useState(0);
  const [totalNodes, setTotalNodes] = useState(0);
  const [zonesTouched, setZonesTouched] = useState(0);
  const [zonesCleared, setZonesCleared] = useState(0);
  const [xp, setXp] = useState(0);
  const [handle, setHandle] = useState("operator");
  const [bestSkill, setBestSkill] = useState<OperatorCardData["bestSkill"]>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Independent reads — fan out and await once.
      const [zs, stats, days, st, enrichedDue, all, state] = await Promise.all([
        db.getZones("web"),
        db.getZoneStats("web"),
        db.getStreakDays(56),
        db.currentStreak(),
        db.dueRefreshersWithNode(20),
        db.getAllNodes(),
        db.getAppState().catch(() => null),
      ]);

      // ── Best skill calculation ─────────────────────────────────────────
      // For each top-level node that has sub-techniques, count completed
      // children. Highest completion ratio wins, ties broken by absolute
      // count. Threshold: at least 2 completed sub-techniques to claim a
      // signature. Otherwise null and the card falls back to specialties.
      const childrenByParent = new Map<string, NodeRow[]>();
      for (const n of all) {
        if (n.parent_id) {
          const arr = childrenByParent.get(n.parent_id) ?? [];
          arr.push(n);
          childrenByParent.set(n.parent_id, arr);
        }
      }
      let best: OperatorCardData["bestSkill"] = null;
      for (const top of all) {
        if (top.parent_id) continue;
        const kids = childrenByParent.get(top.id);
        if (!kids || kids.length === 0) continue;
        const done = kids.filter((k) => k.status === "complete").length;
        if (done < 2) continue;
        const pct = done / kids.length;
        if (!best || pct > best.pct || (pct === best.pct && done > best.completed)) {
          best = {
            id: top.id,
            name: top.name,
            completed: done,
            total: kids.length,
            pct,
            zone_id: top.zone_id,
          };
        }
      }

      if (cancelled) return;

      setHandle(state?.handle ?? "operator");
      setBestSkill(best);
      setStreakDays(days);
      setStreak(st);
      setRefreshers(enrichedDue);

      const completed = all.filter((n) => n.status === "complete");
      setXp(computeOperatorXp(all));
      setCompletedNodes(completed.length);
      setTotalNodes(all.length);

      const statsMap = new Map(stats.map((s) => [s.zone_id, s]));
      const zoneArr: ZoneProgress[] = zs.map((z) => ({
        zone_id: z.id,
        zone_name: z.name,
        total: statsMap.get(z.id)?.total_nodes ?? 0,
        completed: statsMap.get(z.id)?.completed_nodes ?? 0,
        in_progress: statsMap.get(z.id)?.in_progress_nodes ?? 0,
      }));
      // Sort: completed desc, then in_progress desc, then by id
      zoneArr.sort((a, b) => {
        if (b.completed !== a.completed) return b.completed - a.completed;
        if (b.in_progress !== a.in_progress) return b.in_progress - a.in_progress;
        return a.zone_id.localeCompare(b.zone_id);
      });
      setZones(zoneArr);
      setZonesTouched(
        zoneArr.filter((z) => z.completed > 0 || z.in_progress > 0).length,
      );
      setZonesCleared(
        zoneArr.filter((z) => z.total > 0 && z.completed === z.total).length,
      );
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
      zonesTouched,
      zonesCleared,
      totalZones: zones.length,
      completedNodes,
      totalNodes,
      topZones: zones.slice(0, 3),
      bestSkill,
    }),
    [handle, level, xp, intoLvl, lvlSpan, streak, zonesTouched, zonesCleared, completedNodes, totalNodes, zones, bestSkill],
  );

  // 56-day completion heatmap (8 weeks). Intensity scales by completion
  // events (streak_day.sessions), not minutes.
  const heatmap = useMemo(() => {
    const map = new Map(streakDays.map((d) => [d.day, d]));
    const out: { day: string; intensity: number; sessions: number }[] = [];
    const today = new Date();
    for (let i = 55; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = db.localDayKey(d);
      const row = map.get(key);
      const n = row?.sessions ?? 0;
      let intensity = 0;
      if (n >= 1) intensity = 1;
      if (n >= 2) intensity = 2;
      if (n >= 4) intensity = 3;
      if (n >= 7) intensity = 4;
      out.push({ day: key, intensity, sessions: n });
    }
    return out;
  }, [streakDays]);

  const [exporting, setExporting] = useState(false);

  async function exportCard() {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      // 0. Make sure web fonts (Press Start 2P, Silkscreen, JetBrains Mono,
      //    Roboto) are fully loaded before capture, otherwise text in the
      //    rasterized PNG falls back to system fonts or vanishes.
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      // 1. Quick sanity log — if dimensions are 0, we're capturing nothing.
      const rect = cardRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        throw new Error(
          `card ref has 0 dimensions (${rect.width}×${rect.height}) — render not reaching the browser layout`,
        );
      }

      // 2. Render the operator card to a high-res PNG via html-to-image.
      //    Explicit width/height ensure the canvas matches the card box even
      //    if the parent wrapper is 0×0 (our hide trick). pixelRatio 2 gives
      //    retina-quality output.
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, {
        width: 1080,
        height: 1920,
        pixelRatio: 2,
        backgroundColor: "#07091a",
        cacheBust: true,
        skipFonts: false,
      });

      if (!dataUrl || dataUrl === "data:," || dataUrl.length < 200) {
        throw new Error("html-to-image returned an empty data URL");
      }

      // 3. Convert the data URL to raw bytes for writeFile().
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // 4. Suggest a filename using the user's actual handle.
      const today = new Date().toISOString().split("T")[0];
      const safeHandle = (handle || "operator").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "operator";
      const defaultName = `nullpath-${safeHandle}-${today}.png`;

      // 5. Open the native save dialog so the user picks the location.
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

      // 6. Write the PNG to the chosen path.
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      await writeFile(path, bytes);

      sfx.success();
      const filename = path.split(/[\\/]/).pop() || path;
      toast.success(`Saved → ${filename}`);
    } catch (err) {
      console.error("[export] operator card failed:", err);
      sfx.warn();
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Export failed — ${msg}`);
    } finally {
      setExporting(false);
    }
  }

  /** Acknowledge a refresher and refresh the queue locally. */
  async function ackAndReload(nodeId: string, recalled: boolean) {
    await db.ackRefresher(nodeId, recalled);
    setRefreshers(await db.dueRefreshersWithNode(20));
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          {/* ═══════ LEFT COLUMN — scrolling content ═══════ */}
          <div className="space-y-6 min-w-0">
            {/* Top stats strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat
                label="Level"
                value={`${level}`}
                accent="var(--color-magenta)"
                sub={`${Math.round(lvlPct)}% to ${level + 1}`}
              />
              <Stat
                label="Total XP"
                value={`${xp.toLocaleString()}`}
                accent="var(--color-cyan)"
              />
              <Stat
                label="Streak"
                value={`${streak}d`}
                accent="var(--color-amber)"
              />
              <Stat
                label="Nodes"
                value={`${completedNodes}/${totalNodes}`}
                accent="var(--color-lime)"
                sub={`${zonesCleared} zone${zonesCleared === 1 ? "" : "s"} cleared`}
              />
            </div>

            {/* Refreshers due */}
            {refreshers.length > 0 && (
              <div className="np-pixel rounded-lg p-5 border-[var(--color-magenta-dim)]">
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
                        onClick={() => {
                          sfx.success();
                          ackAndReload(r.node_id, true);
                        }}
                        className="p-1.5 rounded text-[var(--color-lime)] hover:bg-[color-mix(in_oklab,var(--color-lime)_10%,transparent)]"
                        title="Recalled cleanly"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => {
                          sfx.warn();
                          ackAndReload(r.node_id, false);
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

            {/* Completion heatmap */}
            <div className="np-pixel rounded-lg p-5">
              <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-fg-2)] mb-3">
                // completions · last 8 weeks
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
                    title={`${c.day} · ${c.sessions} completion${c.sessions === 1 ? "" : "s"}`}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between np-mono text-[9px] text-[var(--color-fg-3)] tracking-[0.2em] uppercase">
                <span>less</span>
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-3 h-3 rounded-sm"
                      style={{
                        background:
                          i === 0
                            ? "var(--color-bg-3)"
                            : i === 1
                              ? "color-mix(in oklab, var(--color-cyan) 25%, var(--color-bg-3))"
                              : i === 2
                                ? "color-mix(in oklab, var(--color-cyan) 50%, var(--color-bg-3))"
                                : i === 3
                                  ? "color-mix(in oklab, var(--color-cyan) 75%, var(--color-bg-3))"
                                  : "var(--color-cyan)",
                      }}
                    />
                  ))}
                </div>
                <span>more</span>
              </div>
            </div>

            {/* Zone progress ledger */}
            <div className="np-pixel rounded-lg p-5">
              <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-fg-2)] mb-4">
                // zone progress · {zonesTouched} touched · {zonesCleared} cleared
              </div>
              <div className="space-y-2">
                {zones.map((z) => {
                  const pct = z.total > 0 ? (z.completed / z.total) * 100 : 0;
                  const cleared = z.total > 0 && z.completed === z.total;
                  return (
                    <button
                      key={z.zone_id}
                      onClick={() => {
                        sfx.click();
                        go({ name: "zone", zoneId: z.zone_id });
                      }}
                      className="w-full flex items-center gap-3 hover:bg-[color-mix(in_oklab,var(--color-cyan)_4%,transparent)] rounded px-1 py-1 -mx-1 -my-1 transition"
                    >
                      <div className="w-12 np-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-fg-3)]">
                        {z.zone_id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="text-[var(--color-fg-1)] truncate">{z.zone_name}</span>
                          <span className="np-mono text-[var(--color-fg-2)] ml-3 flex-shrink-0">
                            {Math.round(pct)}%
                          </span>
                        </div>
                        <div className="h-1.5 mt-1 rounded-full bg-[var(--color-bg-3)] overflow-hidden">
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: cleared
                                ? "var(--color-lime)"
                                : z.in_progress > 0
                                  ? "var(--color-cyan)"
                                  : "var(--color-fg-3)",
                            }}
                          />
                        </div>
                      </div>
                      <div className="w-16 np-mono text-[10px] text-[var(--color-fg-3)] text-right flex-shrink-0">
                        {z.completed}/{z.total}
                      </div>
                    </button>
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
              <Suspense fallback={<div className="aspect-[1080/1920] w-full max-w-[352px] mx-auto bg-[var(--color-bg-3)]" />}>
                <OperatorCardPreview data={cardData} maxWidth={352} />
              </Suspense>
              <div className="np-screen text-[9px] tracking-[0.2em] text-[var(--color-fg-3)] mt-2 text-center">
                EXPORTS AS 1080×1920 PNG
              </div>
            </div>

            <Button variant="primary" size="md" onClick={exportCard} disabled={exporting} className="w-full">
              <Camera size={13} />
              {exporting ? "RENDERING…" : "EXPORT CARD"}
            </Button>
          </aside>
        </div>{/* end grid */}

        {/* Hidden full-size card — html-to-image targets this on Export */}
        <Suspense fallback={null}>
          <OperatorCardOffscreen data={cardData} containerRef={cardRef} />
        </Suspense>
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
