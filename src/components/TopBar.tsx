import { useEffect, useState } from "react";
import { ChevronRight, Menu } from "lucide-react";
import { useUi, type Route } from "../store";
import { sfx } from "../lib/sfx";
import * as db from "../db";
import { useIsMobile } from "../hooks/useMediaQuery";

/**
 * TopBar — breadcrumbs + (mobile) hamburger.
 */
export function TopBar() {
  const route = useUi((s) => s.route);
  const go = useUi((s) => s.go);
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const isMobile = useIsMobile();

  const [crumbs, setCrumbs] = useState<{ label: string; route: Route | null }[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function build() {
      const trail: { label: string; route: Route | null }[] = [
        { label: "ATLAS", route: { name: "atlas" } },
      ];
      if (route.name === "region") {
        const r = await db.getRegion(route.regionId);
        trail.push({ label: r?.name.toUpperCase() ?? route.regionId, route: null });
      } else if (route.name === "zone") {
        const z = await db.getZone(route.zoneId);
        if (z) {
          const r = await db.getRegion(z.region_id);
          trail.push({
            label: r?.name.toUpperCase() ?? z.region_id,
            route: { name: "region", regionId: z.region_id },
          });
          trail.push({ label: z.name.toUpperCase(), route: null });
        }
      } else if (route.name === "codex") {
        trail.length = 0;
        trail.push({ label: "CODEX", route: null });
      } else if (route.name === "stats") {
        trail.length = 0;
        trail.push({ label: "STATS", route: null });
      } else if (route.name === "bounties") {
        trail.length = 0;
        trail.push({ label: "BOUNTIES", route: null });
      } else if (route.name === "achievements") {
        trail.length = 0;
        trail.push({ label: "TROPHIES", route: null });
      } else if (route.name === "settings") {
        trail.length = 0;
        trail.push({ label: "SETTINGS", route: null });
      }
      if (!cancelled) setCrumbs(trail);
    }
    build();
    return () => {
      cancelled = true;
    };
  }, [route]);

  // On mobile, show only the *last* (current) crumb.
  const visibleCrumbs = isMobile ? crumbs.slice(-1) : crumbs;

  return (
    <header
      className="h-14 shrink-0 flex items-center px-3 sm:px-4 gap-2 sm:gap-3"
      style={{
        background: "var(--color-bg-1)",
        borderBottom: "2px solid var(--color-border-default)",
        boxShadow: "inset 0 -2px 0 0 var(--color-border-shadow)",
      }}
    >
      {/* Hamburger (mobile only) */}
      {isMobile && (
        <button
          onClick={() => {
            sfx.click();
            setDrawerOpen(true);
          }}
          className="np-pixel-flat w-9 h-9 flex items-center justify-center text-[var(--color-cyan)] shrink-0"
          aria-label="Open menu"
        >
          <Menu size={16} />
        </button>
      )}

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
        {visibleCrumbs.map((c, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            {c.route ? (
              <button
                onClick={() => {
                  if (!c.route) return;
                  sfx.click();
                  go(c.route);
                }}
                className="np-screen text-[10px] tracking-[0.2em] text-[var(--color-fg-2)] hover:text-[var(--color-cyan)] transition truncate"
              >
                {c.label}
              </button>
            ) : (
              <span className="np-screen text-[10px] tracking-[0.2em] text-[var(--color-cyan)] truncate">
                ▸ {c.label}
              </span>
            )}
            {i < visibleCrumbs.length - 1 && (
              <ChevronRight size={11} className="text-[var(--color-fg-3)] shrink-0" />
            )}
          </div>
        ))}
      </div>
    </header>
  );
}
