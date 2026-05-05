/**
 * AtlasView — the world map. Three regions side by side; only the active one
 * is clickable. Locked regions render foggy with a "unlocks after..." note.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import * as db from "../db";
import type { RegionRow } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";

interface RegionCard {
  region: RegionRow;
  zoneCount: number;
  totalNodes: number;
  completedNodes: number;
}

const REGION_DESCRIPTORS: Record<string, { glyph: string; surfaceWord: string }> = {
  web: { glyph: "://", surfaceWord: "Surface" },
  "red-team": { glyph: "$_", surfaceWord: "Citadel" },
  "vuln-research": { glyph: "0x", surfaceWord: "Core" },
};

export function AtlasView() {
  const go = useUi((s) => s.go);
  const setRegions = useUi((s) => s.setRegions);

  const [cards, setCards] = useState<RegionCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const regions = await db.getRegions();
      if (cancelled) return;
      setRegions(regions);
      const out: RegionCard[] = [];
      for (const r of regions) {
        const zones = await db.getZones(r.id);
        const stats = await db.getZoneStats(r.id);
        const totalNodes = stats.reduce((s, z) => s + z.total_nodes, 0);
        const completedNodes = stats.reduce((s, z) => s + z.completed_nodes, 0);
        out.push({ region: r, zoneCount: zones.length, totalNodes, completedNodes });
      }
      if (!cancelled) {
        setCards(out);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setRegions]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="np-mono text-[var(--color-fg-2)] text-xs tracking-[0.3em]">
          loading atlas...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-10 py-12 max-w-[1400px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-12"
        >
          <div className="np-mono text-[10px] tracking-[0.4em] text-[var(--color-fg-3)] uppercase mb-2">
            // ATLAS / OFFENSIVE-SECURITY CAREER MAP
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--color-fg-0)]">
            Three regions. One operator.
          </h1>
          <p className="text-[var(--color-fg-2)] mt-3 text-sm max-w-xl">
            Each region is a constellation of skills. Click the active region to
            explore its zones. Locked regions reveal as you complete prior ones.
          </p>
        </motion.div>

        {/* Region cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, i) => {
            const locked = card.region.is_locked === 1;
            const desc = REGION_DESCRIPTORS[card.region.id];
            const pct =
              card.totalNodes > 0
                ? Math.round((card.completedNodes / card.totalNodes) * 100)
                : 0;
            return (
              <motion.button
                key={card.region.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                whileHover={!locked ? { y: -4 } : {}}
                onMouseEnter={() => !locked && sfx.hover()}
                onClick={() => {
                  if (locked) {
                    sfx.warn();
                    return;
                  }
                  sfx.zoneUnlock();
                  go({ name: "region", regionId: card.region.id });
                }}
                disabled={locked}
                className={cn(
                  "np-glass rounded-lg p-6 text-left transition-all relative overflow-hidden group",
                  locked
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:border-[var(--color-cyan-dim)] cursor-pointer",
                )}
                style={{
                  borderColor: !locked ? card.region.color_accent + "44" : undefined,
                }}
              >
                {/* Background flourish */}
                <div
                  className="absolute -right-12 -top-12 w-48 h-48 rounded-full blur-3xl opacity-30 transition-opacity group-hover:opacity-50"
                  style={{ background: card.region.color_accent }}
                />

                {/* Lock veil */}
                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[1px] z-10">
                    <div className="flex flex-col items-center gap-2">
                      <Lock size={24} className="text-[var(--color-fg-3)]" />
                      <div className="np-mono text-[10px] tracking-[0.2em] text-[var(--color-fg-3)] uppercase">
                        LOCKED
                      </div>
                    </div>
                  </div>
                )}

                <div className="relative">
                  <div
                    className="np-mono text-3xl mb-1"
                    style={{ color: card.region.color_accent }}
                  >
                    {desc?.glyph ?? "::"}
                  </div>
                  <div className="np-mono text-[10px] tracking-[0.3em] text-[var(--color-fg-3)] uppercase mb-3">
                    Region · {desc?.surfaceWord ?? "Region"}
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-[var(--color-fg-0)]">
                    {card.region.name}
                  </div>
                  <p className="text-[var(--color-fg-2)] text-[13px] mt-3 min-h-[3em]">
                    {card.region.tagline}
                  </p>

                  <div className="np-divider my-5" />

                  <div className="grid grid-cols-3 gap-2 np-mono">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-3)]">
                        zones
                      </div>
                      <div className="text-lg text-[var(--color-fg-0)]">{card.zoneCount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-3)]">
                        nodes
                      </div>
                      <div className="text-lg text-[var(--color-fg-0)]">{card.totalNodes}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-3)]">
                        progress
                      </div>
                      <div
                        className="text-lg"
                        style={{
                          color: pct === 100 ? "var(--color-lime)" : card.region.color_accent,
                        }}
                      >
                        {pct}%
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-1 rounded-full bg-[var(--color-bg-3)] overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${card.region.color_accent}, ${card.region.color_accent}aa)`,
                      }}
                    />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="mt-12 np-mono text-[10px] tracking-[0.2em] text-[var(--color-fg-3)] uppercase">
          tip: ⌘K to search · 1-4 to jump views · hover regions to preview
        </div>
      </div>
    </div>
  );
}
