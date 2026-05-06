/**
 * OperatorCardPortrait — fixed 1080×1920 (9:16) shareable card.
 *
 * Designed to be readable when scaled down on a phone screen — type sizes
 * are intentionally large, layout is spacious, decoration is restrained.
 *
 * Use the wrapper `<OperatorCardPreview>` for an inline scaled-down preview,
 * and `<OperatorCardOffscreen>` for the export-target instance.
 */

import { memo } from "react";
import { APP_VERSION } from "../lib/version";
import { PixelSprite, type SpriteName } from "./pixel/PixelSprite";

export interface OperatorCardData {
  handle: string;
  level: number;
  xp: number;
  xpInLvl: number;
  xpForLvl: number;
  streak: number;
  /** Zones with at least one node touched (started or completed). */
  zonesTouched: number;
  /** Zones where every node is complete. */
  zonesCleared: number;
  /** Total zones in the user's region (denominator for ZONES tile). */
  totalZones: number;
  completedNodes: number;
  totalNodes: number;
  /** Top zones for the specialties section (sorted by completion desc). */
  topZones: Array<{
    zone_id: string;
    zone_name: string;
    total: number;
    completed: number;
    in_progress: number;
  }>;
  /**
   * Highest-mastery top-level skill (most sub-techniques completed).
   * Null when the user hasn't finished enough sub-techniques to claim one.
   */
  bestSkill: {
    id: string;
    name: string;
    completed: number;
    total: number;
    pct: number;
    /** the leaf zone this skill lives in (e.g. "Z04") */
    zone_id: string;
  } | null;
}

const CARD_W = 1080;
const CARD_H = 1920;

// Pick a sprite for the avatar deterministically from the handle hash.
function pickSigil(handle: string): SpriteName {
  const sprites = ["shield", "shrine", "key", "crown", "bolt", "flame", "brain", "skull"] as const;
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) | 0;
  // Length is a literal 8 so the index is provably in-range; the
  // `as const` tuple lets TS narrow the return type without a fallback.
  return sprites[Math.abs(h) % sprites.length] as SpriteName;
}

export const OperatorCardPortrait = memo(function OperatorCardPortrait({
  data,
}: {
  data: OperatorCardData;
}) {
  const initials = (data.handle || "OP").slice(0, 2).toUpperCase();
  const xpPct = data.xpForLvl > 0 ? (data.xpInLvl / data.xpForLvl) * 100 : 0;
  const sigil = pickSigil(data.handle);

  const xpFmt = data.xp.toLocaleString();
  const topZones = data.topZones.filter((z) => z.completed > 0 || z.in_progress > 0).slice(0, 3);

  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        position: "relative",
        background:
          "radial-gradient(ellipse 80% 50% at 75% 0%, rgba(92,242,255,0.20) 0%, transparent 60%), " +
          "radial-gradient(ellipse 80% 50% at 25% 100%, rgba(255,102,224,0.20) 0%, transparent 60%), " +
          "linear-gradient(180deg, #07091a 0%, #050714 100%)",
        fontFamily: "Roboto, system-ui, sans-serif",
        color: "#e8ecff",
        overflow: "hidden",
      }}
    >
      {/* CRT scanlines */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 2px, transparent 2px, transparent 5px)",
          mixBlendMode: "multiply",
          opacity: 0.45,
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      {/* Outer chunky pixel border */}
      <div
        style={{
          position: "absolute",
          top: 28,
          right: 28,
          bottom: 28,
          left: 28,
          border: "8px solid #3a4480",
          boxShadow:
            "inset 8px 8px 0 0 #5a6cb8, inset -8px -8px 0 0 #0a0d1f, 0 0 100px rgba(92,242,255,0.18)",
          pointerEvents: "none",
        }}
      />

      {/* Content container — generous padding, vertical flex */}
      <div
        style={{
          position: "absolute",
          top: 80,
          right: 80,
          bottom: 80,
          left: 80,
          display: "flex",
          flexDirection: "column",
          gap: 56,
        }}
      >
        {/* ── NULLPATH wordmark ──────────────────────────── */}
        <div
          style={{
            paddingBottom: 32,
            borderBottom: "5px solid #3a4480",
          }}
        >
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 96,
              background: "linear-gradient(180deg, #5cf2ff 0%, #ff66e0 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "0.04em",
              lineHeight: 1,
              textAlign: "center",
            }}
          >
            NULLPATH
          </div>
        </div>

        {/* ── HERO: avatar + handle + level ──────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          {/* Avatar tile */}
          <div
            style={{
              width: 320,
              height: 320,
              flexShrink: 0,
              position: "relative",
              background: "linear-gradient(135deg, #5cf2ff 0%, #ff66e0 100%)",
              border: "8px solid #5a6cb8",
              boxShadow:
                "inset 8px 8px 0 0 rgba(255,255,255,0.45), inset -8px -8px 0 0 rgba(0,0,0,0.55), 0 0 48px rgba(92,242,255,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 128,
                color: "#07091a",
                textShadow: "5px 5px 0 rgba(255,255,255,0.45)",
                lineHeight: 1,
              }}
            >
              {initials}
            </div>
            <div style={{ position: "absolute", top: 16, right: 16, opacity: 0.55 }}>
              <PixelSprite name={sigil} size={36} color="#07091a" />
            </div>
            <div style={{ position: "absolute", bottom: 16, left: 16, opacity: 0.5 }}>
              <PixelSprite name="diamond" size={26} color="#07091a" />
            </div>
          </div>

          {/* Identity column */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontFamily: "'Silkscreen', monospace",
                fontSize: 26,
                letterSpacing: "0.3em",
                color: "#7280b0",
              }}
            >
              HANDLE
            </div>
            <div
              style={{
                fontFamily: "Roboto, sans-serif",
                fontSize: 76,
                fontWeight: 700,
                color: "#e8ecff",
                lineHeight: 1.05,
                marginTop: 10,
                wordBreak: "break-word",
                textTransform: "lowercase",
              }}
            >
              {data.handle}
            </div>

            <div
              style={{
                fontFamily: "'Silkscreen', monospace",
                fontSize: 26,
                letterSpacing: "0.3em",
                color: "#7280b0",
                marginTop: 36,
              }}
            >
              LEVEL
            </div>
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 160,
                color: "#ff66e0",
                textShadow: "0 0 32px rgba(255,102,224,0.5)",
                lineHeight: 0.95,
                marginTop: 4,
              }}
            >
              {data.level}
            </div>
          </div>
        </div>

        {/* ── Signature skill (highest mastery) ──────────── */}
        {data.bestSkill && (
          <div
            style={{
              position: "relative",
              background: "#161b3a",
              border: "5px solid #ff66e0",
              boxShadow:
                "inset 5px 5px 0 0 #ff8af0, inset -5px -5px 0 0 #5a1f60, 0 0 32px rgba(255,102,224,0.25)",
              padding: "28px 36px",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", right: 24, top: 24, opacity: 0.16 }}>
              <PixelSprite name="crown" size={96} color="#ff66e0" />
            </div>
            <div
              style={{
                fontFamily: "'Silkscreen', monospace",
                fontSize: 22,
                letterSpacing: "0.3em",
                color: "#ff66e0",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{ display: "inline-block", width: 14, height: 14, background: "#ff66e0" }}
              />
              SIGNATURE SKILL
            </div>
            <div
              style={{
                fontFamily: "Roboto, sans-serif",
                fontSize: 50,
                fontWeight: 700,
                color: "#e8ecff",
                lineHeight: 1.05,
                marginTop: 14,
                position: "relative",
                wordBreak: "break-word",
              }}
            >
              {data.bestSkill.name}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 16,
                marginTop: 14,
              }}
            >
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 22,
                  color: "#ff66e0",
                }}
              >
                {data.bestSkill.id}
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "#7280b0",
                }}
              >
                {data.bestSkill.completed}/{data.bestSkill.total} SUB-TECHNIQUES
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 28,
                  color: "#a8ff5c",
                  textShadow: "0 0 14px rgba(168,255,92,0.45)",
                }}
              >
                {Math.round(data.bestSkill.pct * 100)}%
              </span>
            </div>
            <div style={{ marginTop: 18 }}>
              <Segmented
                value={data.bestSkill.pct}
                segments={28}
                color="#ff66e0"
                trackColor="#2a1840"
                height={20}
              />
            </div>
          </div>
        )}

        {/* ── XP progress to next level ──────────────────── */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontFamily: "'Silkscreen', monospace",
                fontSize: 24,
                letterSpacing: "0.25em",
                color: "#7280b0",
              }}
            >
              NEXT LEVEL
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 30,
                fontWeight: 500,
                color: "#5cf2ff",
              }}
            >
              {data.xpInLvl.toLocaleString()} / {data.xpForLvl.toLocaleString()} XP
            </span>
          </div>
          <Segmented
            value={xpPct / 100}
            segments={32}
            color="#5cf2ff"
            trackColor="#1f2750"
            height={36}
          />
        </div>

        {/* ── Stats 2×2 ───────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <StatTile label="TOTAL XP" value={xpFmt} accent="#5cf2ff" sprite="bolt" />
          <StatTile label="STREAK" value={`${data.streak}d`} accent="#ffb84a" sprite="flame" />
          <StatTile
            label="ZONES"
            value={`${data.zonesCleared}/${data.totalZones}`}
            accent="#a8ff5c"
            sprite="shrine"
          />
          <StatTile
            label="NODES"
            value={`${data.completedNodes}/${data.totalNodes}`}
            accent="#ff66e0"
            sprite="shield"
          />
        </div>

        {/* ── Specialties (top zones by hours) ──────────────
             Only shown when there's no signature skill yet — otherwise the
             two sections fight for vertical space and overflow the card. */}
        {!data.bestSkill && topZones.length > 0 && (
          <div>
            <div
              style={{
                fontFamily: "'Silkscreen', monospace",
                fontSize: 24,
                letterSpacing: "0.3em",
                color: "#5cf2ff",
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <span
                style={{ display: "inline-block", width: 16, height: 16, background: "#5cf2ff" }}
              />
              SPECIALTIES
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {topZones.map((z) => (
                <SpecialtyRow key={z.zone_id} zone={z} />
              ))}
            </div>
          </div>
        )}

        {/* spacer pushes footer to the bottom */}
        <div style={{ flex: 1 }} />

        {/* ── Footer ──────────────────────────────────────── */}
        <div
          style={{
            borderTop: "5px solid #3a4480",
            paddingTop: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 22,
              fontWeight: 500,
              color: "#7280b0",
            }}
          >
            {new Date().toISOString().split("T")[0]}
          </div>
          <div
            style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: 22,
              letterSpacing: "0.3em",
              color: "#5cf2ff",
            }}
          >
            NULLPATH
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 22,
              fontWeight: 500,
              color: "#7280b0",
            }}
          >
            v{APP_VERSION}
          </div>
        </div>
      </div>
    </div>
  );
});

// ===========================================================================
// Sub-components
// ===========================================================================

function StatTile({
  label,
  value,
  accent,
  sprite,
}: {
  label: string;
  value: string;
  accent: string;
  sprite: SpriteName;
}) {
  return (
    <div
      style={{
        position: "relative",
        background: "#161b3a",
        border: "5px solid #3a4480",
        boxShadow: "inset 5px 5px 0 0 #5a6cb8, inset -5px -5px 0 0 #0a0d1f",
        padding: "32px 36px",
        height: 220,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
      }}
    >
      {/* Faded background sprite */}
      <div style={{ position: "absolute", right: 16, top: 16, opacity: 0.18 }}>
        <PixelSprite name={sprite} size={88} color={accent} />
      </div>
      <div
        style={{
          fontFamily: "'Silkscreen', monospace",
          fontSize: 22,
          letterSpacing: "0.3em",
          color: "#7280b0",
          position: "relative",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 56,
          color: accent,
          textShadow: `0 0 20px ${accent}55`,
          lineHeight: 1,
          position: "relative",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Segmented({
  value,
  segments,
  color,
  trackColor,
  height = 28,
}: {
  value: number;
  segments: number;
  color: string;
  trackColor: string;
  height?: number;
}) {
  const v = Math.max(0, Math.min(1, value));
  const filled = Math.round(v * segments);
  return (
    <div
      style={{
        background: "#0d1126",
        border: "4px solid #3a4480",
        boxShadow: "inset 4px 4px 0 0 #0a0d1f, inset -4px -4px 0 0 #5a6cb8",
        padding: 5,
        display: "flex",
        gap: 3,
        height,
      }}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: i < filled ? color : trackColor,
            boxShadow: i < filled ? `0 0 6px ${color}66` : undefined,
          }}
        />
      ))}
    </div>
  );
}

function SpecialtyRow({
  zone,
}: {
  zone: {
    zone_id: string;
    zone_name: string;
    total: number;
    completed: number;
    in_progress: number;
  };
}) {
  const pct = zone.total > 0 ? Math.round((zone.completed / zone.total) * 100) : 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        paddingBottom: 14,
        borderBottom: "2px dotted #2a3358",
      }}
    >
      <span
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 22,
          color: "#5cf2ff",
          width: 90,
          flexShrink: 0,
        }}
      >
        {zone.zone_id}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: "Roboto, sans-serif",
          fontSize: 30,
          fontWeight: 600,
          color: "#e8ecff",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {zone.zone_name}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 26,
          fontWeight: 500,
          color: "#a8ff5c",
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {zone.completed}/{zone.total} · {pct}%
      </span>
    </div>
  );
}

// ===========================================================================
// Inline preview wrapper — scaled-down version that fits the available width.
// ===========================================================================
export const OperatorCardPreview = memo(function OperatorCardPreview({
  data,
  maxWidth = 540,
}: {
  data: OperatorCardData;
  maxWidth?: number;
}) {
  const scale = maxWidth / CARD_W;
  return (
    <div
      style={{
        width: "100%",
        maxWidth,
        aspectRatio: `${CARD_W} / ${CARD_H}`,
        position: "relative",
        margin: "0 auto",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: CARD_W,
          height: CARD_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <OperatorCardPortrait data={data} />
      </div>
    </div>
  );
});

// ===========================================================================
// Hidden full-size container — html-to-image targets the INNER div.
// Hide via 0×0 wrapper + overflow:hidden, NOT via opacity on the captured
// element (opacity:0 leaks into the cloned render and produces a blank PNG).
// ===========================================================================
export const OperatorCardOffscreen = memo(function OperatorCardOffscreen({
  data,
  containerRef,
}: {
  data: OperatorCardData;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: -1,
      }}
      aria-hidden
    >
      <div
        ref={containerRef}
        style={{
          width: CARD_W,
          height: CARD_H,
        }}
      >
        <OperatorCardPortrait data={data} />
      </div>
    </div>
  );
});
