/**
 * AtlasView — three regions as pixel-art tiles. Locked tiles render with
 * a chunky "LOCKED" overlay; the active region pulses an inviting glow.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import * as db from "../db";
import type { RegionRow } from "../db/types";
import { useUi } from "../store";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import { PixelBar } from "../components/pixel/PixelBar";
import { PixelSprite, type SpriteName } from "../components/pixel/PixelSprite";

interface RegionCard {
  region: RegionRow;
  zoneCount: number;
  totalNodes: number;
  completedNodes: number;
}

const REGION_DESCRIPTORS: Record<string, { glyph: string; sigil: string; sprite: SpriteName }> = {
  web: { glyph: "[ ://web ]", sigil: "Z01-Z23", sprite: "shield" },
  "red-team": { glyph: "[ #!/ad ]", sigil: "LOCKED", sprite: "skull" },
  "vuln-research": { glyph: "[ 0xfff ]", sigil: "LOCKED", sprite: "bug" },
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
        <div className="np-mono text-[var(--color-fg-2)] text-base np-blink">
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
          transition={{ duration: 0.2, ease: "linear" }}
          className="mb-10"
        >
          <div className="np-screen text-[10px] tracking-[0.4em] text-[var(--color-fg-3)] mb-3">
            // ATLAS · OFFENSIVE-SECURITY MAP
          </div>
          <h1 className="np-display text-3xl text-[var(--color-fg-0)]">
            <span className="np-glitch-text" data-text="THREE REGIONS.">
              THREE REGIONS.
            </span>
            <br />
            <span className="text-[var(--color-cyan)] mt-2 inline-block">ONE OPERATOR.</span>
          </h1>
          <p className="text-[var(--color-fg-2)] mt-4 text-sm max-w-xl">
            Each region is a constellation of skills. Pick one to enter. Locked regions reveal
            as you complete the prior ones.
          </p>
        </motion.div>

        {/* Region tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
                transition={{ duration: 0.25, delay: i * 0.06, ease: "linear" }}
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
                  "np-pixel text-left p-0 relative overflow-hidden group",
                  !locked && "hover:bg-[var(--color-bg-3)] cursor-pointer transition-colors",
                  locked && "cursor-not-allowed",
                )}
                style={{
                  borderColor: !locked ? card.region.color_accent : undefined,
                }}
              >
                {/* Title bar — like an OS window */}
                <div
                  className="np-screen text-[10px] tracking-[0.2em] px-3 py-2 flex items-center gap-2 border-b-2"
                  style={{
                    background: locked ? "var(--color-bg-3)" : `${card.region.color_accent}22`,
                    borderColor: "var(--color-border-default)",
                    color: locked ? "var(--color-fg-3)" : card.region.color_accent,
                  }}
                >
                  <span className="inline-block w-2 h-2" style={{ background: locked ? "var(--color-fg-3)" : card.region.color_accent }} />
                  {desc?.glyph ?? "[ region ]"}
                  <span className="ml-auto text-[var(--color-fg-3)]">
                    {locked ? "■" : "▣"}
                  </span>
                </div>

                {/* Body */}
                <div className="p-5 relative">
                  {/* Background sprite glow */}
                  <div
                    className="absolute -right-4 -top-2 opacity-25"
                    style={{ filter: "blur(0.5px)" }}
                  >
                    <PixelSprite
                      name={desc?.sprite ?? "diamond"}
                      size={92}
                      color={locked ? "var(--color-fg-3)" : card.region.color_accent}
                      secondary={locked ? "var(--color-fg-3)" : `${card.region.color_accent}aa`}
                    />
                  </div>

                  {/* Lock veil */}
                  {locked && (
                    <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[1px] z-10 bg-[#0a0e1a99]">
                      <div className="flex flex-col items-center gap-2">
                        <Lock size={26} className="text-[var(--color-fg-3)]" />
                        <div className="np-display text-[10px] tracking-[0.2em] text-[var(--color-fg-2)]">
                          LOCKED
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="relative">
                    <div className="np-display text-xl text-[var(--color-fg-0)] mb-2 leading-tight">
                      {card.region.name.toUpperCase()}
                    </div>
                    <p className="text-[var(--color-fg-2)] text-[13px] mb-5 min-h-[3em] leading-relaxed">
                      {card.region.tagline}
                    </p>

                    <div className="np-divider mb-3" />

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <Stat label="ZONES" value={`${card.zoneCount}`} />
                      <Stat label="NODES" value={`${card.totalNodes}`} />
                      <Stat
                        label="DONE"
                        value={`${pct}%`}
                        color={
                          pct === 100
                            ? "var(--color-lime)"
                            : pct > 0
                              ? card.region.color_accent
                              : "var(--color-fg-2)"
                        }
                      />
                    </div>

                    <PixelBar
                      value={pct / 100}
                      color={card.region.color_accent}
                      segments={24}
                      height={6}
                    />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="mt-12 np-screen text-[10px] tracking-[0.2em] text-[var(--color-fg-3)] flex flex-wrap gap-x-6 gap-y-2">
          <span>⌘K · SEARCH</span>
          <span>1-4 · JUMP VIEWS</span>
          <span>? · SHORTCUTS</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="np-screen text-[10px] tracking-[0.2em] text-[var(--color-fg-3)]">{label}</div>
      <div
        className="np-display text-base mt-0.5"
        style={{ color: color ?? "var(--color-fg-0)" }}
      >
        {value}
      </div>
    </div>
  );
}
