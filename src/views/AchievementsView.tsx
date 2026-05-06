/**
 * AchievementsView — the trophy room.
 *
 * Renders every entry in the catalog as a tile. Unlocked tiles show the
 * icon in amber with the unlock date; locked tiles render desaturated
 * with the icon dimmed AND a live progress bar derived from the same
 * `value(ctx)` accessor the engine uses ("18/25 nodes"). One source of
 * truth — no drift between engine and UI.
 *
 * Subscribes to `dataVersion` so newly-unlocked rows appear in real
 * time (the engine fires through db.onMutation, which bumps dataVersion).
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Lock } from "lucide-react";
import * as db from "../db";
import type { AchievementRow } from "../db/types";
import { useUi } from "../store";
import {
  getAchievementCatalog,
  buildCtx,
  isUnlocked,
  type AchievementCtx,
  type AchievementSpec,
} from "../lib/achievements";
import { resolveAchievementIcon } from "../lib/achievementIcons";

type FilterMode = "all" | "unlocked" | "locked";

interface DisplayRow extends AchievementSpec {
  unlocked: boolean;
  unlockedAt: string | null;
  current: number;
}

/**
 * Format a progress value for display. Bounty payout achievements are in
 * dollars and read better with currency formatting; everything else is a
 * raw count. The branch is keyed off the spec id prefix.
 */
function formatValue(spec: AchievementSpec, n: number): string {
  if (spec.id.startsWith("payout-") || spec.id === "first-payout") {
    return `$${Math.floor(n).toLocaleString()}`;
  }
  return Math.floor(n).toLocaleString();
}

export function AchievementsView() {
  const dataVersion = useUi((s) => s.dataVersion);
  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [ctx, setCtx] = useState<AchievementCtx | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([db.getAchievements(), buildCtx()]).then(([r, c]) => {
      if (cancelled) return;
      setRows(r);
      setCtx(c);
    });
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  const merged = useMemo<DisplayRow[]>(() => {
    if (!ctx) return [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return getAchievementCatalog().map((spec) => {
      const row = byId.get(spec.id);
      // Unlocked is sticky: once the DB has a row, treat it as unlocked
      // even if the live `value` regressed (e.g. after a partial reset).
      const unlocked = !!row?.unlocked_at || isUnlocked(spec, ctx);
      return {
        ...spec,
        unlocked,
        unlockedAt: row?.unlocked_at ?? null,
        current: spec.value(ctx),
      };
    });
  }, [rows, ctx]);

  const totalUnlocked = merged.filter((m) => m.unlocked).length;
  const totalCount = merged.length;
  const pct = totalCount > 0 ? Math.round((totalUnlocked / totalCount) * 100) : 0;

  // "Closest to unlocking" — the locked entry with the highest fractional
  // progress, capped to <100%. Drives a hint chip at the top so the
  // player always has something obvious to chase.
  const nextUp = useMemo<DisplayRow | null>(() => {
    const locked = merged.filter((m) => !m.unlocked && m.target > 1);
    if (locked.length === 0) return null;
    let best: DisplayRow | null = null;
    let bestPct = -1;
    for (const m of locked) {
      const p = Math.min(m.current / m.target, 0.999);
      if (p > bestPct) {
        bestPct = p;
        best = m;
      }
    }
    return best;
  }, [merged]);

  const filtered = useMemo(() => {
    let out = merged;
    if (filter === "unlocked") out = out.filter((m) => m.unlocked);
    if (filter === "locked") out = out.filter((m) => !m.unlocked);
    if (q.trim()) {
      const lq = q.toLowerCase();
      out = out.filter(
        (m) =>
          m.name.toLowerCase().includes(lq) ||
          m.description.toLowerCase().includes(lq) ||
          m.id.toLowerCase().includes(lq),
      );
    }
    return out;
  }, [merged, filter, q]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 sm:px-10 py-6 sm:py-10 max-w-[1200px] mx-auto">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="np-mono text-[10px] tracking-[0.4em] text-[var(--color-fg-3)] uppercase mb-2">
            // achievements
          </div>
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-0)]">
              Trophy Room
            </h1>
            <div className="np-mono text-[12px] tracking-[0.2em] uppercase text-[var(--color-fg-2)]">
              <span className="text-[var(--color-amber)]">{totalUnlocked}</span>
              <span className="text-[var(--color-fg-3)]"> / {totalCount}</span>
              <span className="text-[var(--color-fg-3)]"> · {pct}%</span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 rounded-full bg-[var(--color-bg-3)] overflow-hidden max-w-md">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4 }}
              className="h-full"
              style={{ background: "var(--color-amber)" }}
            />
          </div>
        </motion.div>

        {/* "Next up" hint — closest unmet milestone */}
        {nextUp && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="np-pixel-flat px-4 py-3 mb-6 flex items-center gap-3 border-[var(--color-cyan-dim)]"
          >
            <div className="np-mono text-[9px] tracking-[0.3em] uppercase text-[var(--color-cyan)] shrink-0">
              NEXT UP
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[var(--color-fg-0)] truncate">
                {nextUp.name}
              </div>
              <div className="text-[12px] text-[var(--color-fg-2)] truncate">
                {nextUp.description}
              </div>
            </div>
            <div className="np-mono text-[12px] text-[var(--color-cyan)] tracking-[0.15em] shrink-0">
              {formatValue(nextUp, nextUp.current)} / {formatValue(nextUp, nextUp.target)}
            </div>
          </motion.div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(["all", "unlocked", "locked"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilter(m)}
              className={
                "np-mono text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 border-2 transition " +
                (filter === m
                  ? "bg-[var(--color-amber)] text-[var(--color-bg-0)] border-[var(--color-amber)]"
                  : "text-[var(--color-fg-2)] border-[var(--color-border-default)] bg-[var(--color-bg-2)] hover:text-[var(--color-amber)] hover:border-[var(--color-amber-dim)]")
              }
            >
              {m === "all"
                ? `All (${totalCount})`
                : m === "unlocked"
                  ? `Unlocked (${totalUnlocked})`
                  : `Locked (${totalCount - totalUnlocked})`}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-1.5">
            <Search size={12} className="text-[var(--color-fg-3)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search..."
              maxLength={120}
              aria-label="Filter achievements"
              className="bg-transparent border-none outline-none text-[13px] text-[var(--color-fg-0)] np-mono placeholder:text-[var(--color-fg-3)] w-32"
            />
          </div>
        </div>

        {/* Grid */}
        {ctx === null ? (
          // First-mount state: ctx hasn't resolved yet. Render a tiny
          // placeholder so we don't briefly show "no achievements match"
          // while the SQL aggregates are in flight.
          <div className="np-pixel rounded-lg p-12 text-center">
            <div className="np-mono text-[13px] text-[var(--color-fg-3)] tracking-widest np-blink">
              loading trophies...
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="np-pixel rounded-lg p-12 text-center">
            <div className="np-mono text-[13px] text-[var(--color-fg-3)] tracking-widest">
              no achievements match these filters
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((a) => (
              <AchievementTile key={a.id} a={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AchievementTile({ a }: { a: DisplayRow }) {
  const Icon = resolveAchievementIcon(a.icon);
  const date = a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString() : null;
  // Numeric progress only worth showing for multi-step thresholds — a
  // target of 1 is binary ("done / not done") and a progress bar there
  // is just visual noise.
  const showProgress = !a.unlocked && a.target > 1;
  const progressPct = showProgress ? Math.min(100, Math.round((a.current / a.target) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={
        "np-pixel rounded p-4 flex items-start gap-3 transition " +
        (a.unlocked
          ? "border-[var(--color-amber-dim)]"
          : "border-[var(--color-border-default)] opacity-70")
      }
      style={
        a.unlocked
          ? {
              boxShadow: "0 0 14px color-mix(in oklab, var(--color-amber) 18%, transparent)",
            }
          : undefined
      }
    >
      {/* Icon tile */}
      <div
        className="np-pixel-flat shrink-0 w-12 h-12 flex items-center justify-center"
        style={{
          borderColor: a.unlocked ? "var(--color-amber)" : "var(--color-border-default)",
          background: a.unlocked
            ? "color-mix(in oklab, var(--color-amber) 14%, var(--color-bg-2))"
            : "var(--color-bg-2)",
        }}
      >
        {a.unlocked ? (
          <Icon size={22} className="text-[var(--color-amber)]" strokeWidth={2.4} />
        ) : (
          <Lock size={18} className="text-[var(--color-fg-3)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div
            className={
              "text-[14px] font-bold leading-tight tracking-tight truncate " +
              (a.unlocked ? "text-[var(--color-fg-0)]" : "text-[var(--color-fg-2)]")
            }
          >
            {a.name}
          </div>
          {date && (
            <div className="np-mono text-[10px] text-[var(--color-fg-3)] tracking-[0.15em] shrink-0">
              {date}
            </div>
          )}
        </div>
        <div className="text-[12px] text-[var(--color-fg-2)] mt-1 leading-snug">
          {a.description}
        </div>

        {/* Progress bar — only on locked, multi-step achievements */}
        {showProgress && (
          <div className="mt-2">
            <div className="flex items-center justify-between np-mono text-[10px] text-[var(--color-fg-3)] tracking-[0.15em] mb-1">
              <span>
                {formatValue(a, a.current)} / {formatValue(a, a.target)}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1 rounded-full bg-[var(--color-bg-3)] overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  background:
                    progressPct >= 80
                      ? "var(--color-amber)"
                      : progressPct >= 40
                        ? "var(--color-cyan)"
                        : "var(--color-fg-3)",
                }}
              />
            </div>
          </div>
        )}

        <div className="np-mono text-[9px] text-[var(--color-fg-3)] tracking-[0.25em] uppercase mt-2">
          {a.id}
        </div>
      </div>
    </motion.div>
  );
}
