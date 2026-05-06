/**
 * OperatorCardPortrait — fixed 1080×1920 (9:16) shareable trainer-card.
 *
 * Designed for export, not in-page reading. Use the wrapper component
 * `<OperatorCardPreview>` below to show a scaled-down version inline.
 */

import { formatHmShort } from "../store";
import { APP_VERSION } from "../lib/version";
import { PixelSprite, type SpriteName } from "./pixel/PixelSprite";

export interface OperatorCardData {
  handle: string;
  level: number;
  xp: number;
  xpInLvl: number;
  xpForLvl: number;
  streak: number;
  totalSeconds: number;
  completedNodes: number;
  totalNodes: number;
  /** zones sorted by user time desc */
  topZones: Array<{ zone_id: string; zone_name: string; seconds: number; total: number; completed: number }>;
  /** region rollups: web/red-team/vuln-research with completion pct */
  regions: Array<{ id: string; name: string; pct: number; accent: string; locked: boolean }>;
}

const CARD_W = 1080;
const CARD_H = 1920;

// Pick a sprite for the avatar deterministically from the handle hash.
function pickSigil(handle: string): SpriteName {
  const sprites: SpriteName[] = ["shield", "shrine", "key", "crown", "bolt", "flame", "brain", "skull"];
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) | 0;
  return sprites[Math.abs(h) % sprites.length];
}

export function OperatorCardPortrait({ data }: { data: OperatorCardData }) {
  const initials = (data.handle || "OP").slice(0, 2).toUpperCase();
  const pct = data.xpForLvl > 0 ? (data.xpInLvl / data.xpForLvl) * 100 : 0;
  const sigil = pickSigil(data.handle);

  // pre-formatted readouts
  const xpFmt = data.xp.toLocaleString();
  const timeFmt = formatHmShort(data.totalSeconds);

  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        position: "relative",
        background:
          "radial-gradient(ellipse 80% 50% at 75% 0%, rgba(92,242,255,0.18) 0%, transparent 60%), " +
          "radial-gradient(ellipse 80% 50% at 25% 100%, rgba(255,102,224,0.18) 0%, transparent 60%), " +
          "linear-gradient(180deg, #07091a 0%, #050714 100%)",
        fontFamily: "Roboto, system-ui, sans-serif",
        color: "#e8ecff",
        overflow: "hidden",
      }}
    >
      {/* CRT scanline overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 2px, transparent 2px, transparent 5px)",
          mixBlendMode: "multiply",
          opacity: 0.55,
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      {/* Outer chunky pixel border */}
      <div
        style={{
          position: "absolute",
          inset: 24,
          border: "6px solid #3a4480",
          boxShadow:
            "inset 6px 6px 0 0 #5a6cb8, inset -6px -6px 0 0 #0a0d1f, 0 0 80px rgba(92,242,255,0.15)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 60,
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        {/* ── Header band ─────────────────────────────────── */}
        <div style={{ borderBottom: "4px solid #3a4480", paddingBottom: 20 }}>
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 56,
              background: "linear-gradient(180deg, #5cf2ff 0%, #ff66e0 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "0.04em",
            }}
          >
            NULLPATH
          </div>
        </div>

        {/* ── Avatar + identity block ─────────────────────── */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 36 }}>
          {/* Avatar tile */}
          <div
            style={{
              width: 240,
              height: 240,
              position: "relative",
              flexShrink: 0,
              background: "linear-gradient(135deg, #5cf2ff 0%, #ff66e0 100%)",
              border: "6px solid #5a6cb8",
              boxShadow:
                "inset 6px 6px 0 0 rgba(255,255,255,0.4), inset -6px -6px 0 0 rgba(0,0,0,0.5), 0 0 32px rgba(92,242,255,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Inner monogram */}
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 96,
                color: "#07091a",
                textShadow: "4px 4px 0 rgba(255,255,255,0.4)",
              }}
            >
              {initials}
            </div>
            {/* Corner decorations — pixel sigils */}
            <div style={{ position: "absolute", top: 12, right: 12, opacity: 0.55 }}>
              <PixelSprite name={sigil} size={28} color="#07091a" />
            </div>
            <div style={{ position: "absolute", bottom: 12, left: 12, opacity: 0.55 }}>
              <PixelSprite name="diamond" size={20} color="#07091a" />
            </div>
          </div>

          {/* Identity */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Silkscreen', monospace",
                fontSize: 16,
                letterSpacing: "0.3em",
                color: "#7280b0",
              }}
            >
              HANDLE
            </div>
            <div
              style={{
                fontFamily: "Roboto, sans-serif",
                fontSize: 56,
                fontWeight: 700,
                color: "#e8ecff",
                lineHeight: 1.05,
                marginTop: 6,
                wordBreak: "break-word",
                textTransform: "lowercase",
              }}
            >
              {data.handle}
            </div>

            {/* LEVEL + giant number */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 26 }}>
              <span
                style={{
                  fontFamily: "'Silkscreen', monospace",
                  fontSize: 18,
                  letterSpacing: "0.3em",
                  color: "#7280b0",
                }}
              >
                LVL
              </span>
              <span
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 86,
                  color: "#ff66e0",
                  textShadow: "0 0 24px rgba(255,102,224,0.45)",
                  lineHeight: 1,
                }}
              >
                {data.level}
              </span>
            </div>
          </div>
        </div>

        {/* ── XP progress bar ─────────────────────────────── */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span
              style={{
                fontFamily: "'Silkscreen', monospace",
                fontSize: 14,
                letterSpacing: "0.25em",
                color: "#7280b0",
              }}
            >
              XP TO NEXT LEVEL
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 18,
                color: "#5cf2ff",
              }}
            >
              {data.xpInLvl.toLocaleString()} / {data.xpForLvl.toLocaleString()}
            </span>
          </div>
          <Segmented value={pct / 100} segments={28} color="#5cf2ff" trackColor="#1f2750" />
        </div>

        {/* ── Stats 2×2 grid ──────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <StatTile label="TOTAL XP" value={xpFmt} accent="#5cf2ff" sprite="bolt" />
          <StatTile label="STREAK" value={`${data.streak}d`} accent="#ffb84a" sprite="flame" />
          <StatTile label="TIME LOGGED" value={timeFmt} accent="#a8ff5c" sprite="cog" />
          <StatTile label="NODES DONE" value={`${data.completedNodes}/${data.totalNodes}`} accent="#ff66e0" sprite="shield" />
        </div>

        {/* ── Specialties ────────────────────────────────── */}
        {data.topZones.some((z) => z.seconds > 0) && (
          <Section title="SPECIALTIES" accent="#5cf2ff">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {data.topZones.slice(0, 3).map((z) => (
                <ZoneRow key={z.zone_id} zone={z} accent="#5cf2ff" />
              ))}
            </div>
          </Section>
        )}

        {/* ── Region progress ─────────────────────────────── */}
        <Section title="REGIONS" accent="#ff66e0">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {data.regions.map((r) => (
              <RegionRow key={r.id} region={r} />
            ))}
          </div>
        </Section>

        {/* spacer pushes footer down */}
        <div style={{ flex: 1 }} />

        {/* ── Footer ──────────────────────────────────────── */}
        <div
          style={{
            borderTop: "4px solid #3a4480",
            paddingTop: 18,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: 14,
              letterSpacing: "0.25em",
              color: "#7280b0",
            }}
          >
            {new Date().toISOString().split("T")[0].toUpperCase()}
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              color: "#7280b0",
            }}
          >
            github.com/enrik-m/nullpath
          </div>
          <div
            style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: 14,
              letterSpacing: "0.25em",
              color: "#5cf2ff",
            }}
          >
            v{APP_VERSION}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Sub-components — kept inline so the card is one self-contained file.
// ===========================================================================

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "'Silkscreen', monospace",
          fontSize: 16,
          letterSpacing: "0.3em",
          color: accent,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ display: "inline-block", width: 10, height: 10, background: accent }} />
        {title}
      </div>
      {children}
    </div>
  );
}

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
        border: "4px solid #3a4480",
        boxShadow:
          "inset 4px 4px 0 0 #5a6cb8, inset -4px -4px 0 0 #0a0d1f",
        padding: "20px 24px",
        height: 130,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", right: 12, top: 12, opacity: 0.18 }}>
        <PixelSprite name={sprite} size={56} color={accent} />
      </div>
      <div
        style={{
          fontFamily: "'Silkscreen', monospace",
          fontSize: 13,
          letterSpacing: "0.25em",
          color: "#7280b0",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 30,
          color: accent,
          marginTop: 10,
          textShadow: `0 0 16px ${accent}55`,
          lineHeight: 1,
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
}: {
  value: number;
  segments: number;
  color: string;
  trackColor: string;
}) {
  const v = Math.max(0, Math.min(1, value));
  const filled = Math.round(v * segments);
  return (
    <div
      style={{
        background: "#0d1126",
        border: "3px solid #3a4480",
        boxShadow: "inset 3px 3px 0 0 #0a0d1f, inset -3px -3px 0 0 #5a6cb8",
        padding: 4,
        display: "flex",
        gap: 2,
        height: 28,
      }}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: i < filled ? color : trackColor,
          }}
        />
      ))}
    </div>
  );
}

function ZoneRow({
  zone,
  accent,
}: {
  zone: { zone_id: string; zone_name: string; seconds: number; total: number; completed: number };
  accent: string;
}) {
  const pct = zone.total > 0 ? zone.completed / zone.total : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <span
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 14,
          color: accent,
          width: 70,
          flexShrink: 0,
        }}
      >
        {zone.zone_id}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "Roboto, sans-serif",
            fontSize: 22,
            color: "#e8ecff",
            fontWeight: 600,
            marginBottom: 4,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {zone.zone_name}
        </div>
        <Segmented value={pct} segments={20} color={accent} trackColor="#1f2750" />
      </div>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 18,
          color: "#7280b0",
          width: 110,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {formatHmShort(zone.seconds)}
      </span>
    </div>
  );
}

function RegionRow({
  region,
}: {
  region: { id: string; name: string; pct: number; accent: string; locked: boolean };
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: region.locked ? 0.4 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span
            style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: 14,
              letterSpacing: "0.2em",
              color: region.accent,
              textTransform: "uppercase",
            }}
          >
            {region.locked && "🔒 "}
            {region.name}
          </span>
          <span
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 14,
              color: region.accent,
            }}
          >
            {region.pct}%
          </span>
        </div>
        <Segmented
          value={region.pct / 100}
          segments={32}
          color={region.accent}
          trackColor="#1f2750"
        />
      </div>
    </div>
  );
}

// ===========================================================================
// Inline preview wrapper — renders the same card scaled down to fit the
// available width while preserving the 9:16 aspect ratio.
// ===========================================================================
export function OperatorCardPreview({
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
}

// Hidden full-size container — html-to-image targets this for export.
//
// Earlier this used position: fixed at -10000/-10000 to park the card outside
// the viewport, but html-to-image's bounds calculation produced a blank canvas
// for that case. The robust pattern is to keep the element in the document
// flow at (0,0), invisible via opacity: 0 + pointer-events: none + z-index:
// -1. The card renders normally, fonts load, and capture works reliably.
export function OperatorCardOffscreen({
  data,
  containerRef,
}: {
  data: OperatorCardData;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: CARD_W,
        height: CARD_H,
        opacity: 0,
        pointerEvents: "none",
        zIndex: -1,
        overflow: "hidden",
      }}
      aria-hidden
    >
      <OperatorCardPortrait data={data} />
    </div>
  );
}
