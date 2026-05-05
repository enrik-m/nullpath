import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUi } from "./store";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { BootView } from "./views/BootView";
import { AtlasView } from "./views/AtlasView";
import { CodexStub, StatsStub, BountiesStub } from "./views/Stubs";
import { useSessionTicker } from "./hooks/useSessionTicker";
import * as db from "./db";

function App() {
  const route = useUi((s) => s.route);
  const setScanlines = useUi((s) => s.setScanlines);
  const setSound = useUi((s) => s.setSound);

  useSessionTicker();

  // Hydrate user prefs once DB is ready
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const state = await db.getAppState();
        if (cancelled) return;
        setScanlines(state.scanlines_enabled === 1);
        setSound(state.sound_enabled === 1);
      } catch {
        // Migrations probably haven't applied yet — they will on first DB call
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [setScanlines, setSound]);

  // Keyboard shortcuts: 1-4 quick switch, Cmd/Ctrl+K search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (inField) return;

      const go = useUi.getState().go;
      if (e.key === "1") go({ name: "atlas" });
      else if (e.key === "2") go({ name: "codex" });
      else if (e.key === "3") go({ name: "stats" });
      else if (e.key === "4") go({ name: "bounties" });
      else if (e.key === "Escape") {
        const cur = useUi.getState().route;
        if (cur.name === "zone" || cur.name === "region") useUi.getState().back();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Boot view stands alone (no shell)
  if (route.name === "boot") {
    return <BootView />;
  }

  return (
    <div className="h-screen w-screen flex">
      <Sidebar onSearchClick={() => {}} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onRandomKick={() => {}} />
        <AnimatePresence mode="wait">
          <motion.main
            key={routeKey(route)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col min-h-0 relative"
          >
            <ViewRenderer />
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}

function ViewRenderer() {
  const route = useUi((s) => s.route);
  switch (route.name) {
    case "atlas":
      return <AtlasView />;
    case "region":
      return <RegionPlaceholder regionId={route.regionId} />;
    case "zone":
      return <ZonePlaceholder zoneId={route.zoneId} />;
    case "codex":
      return <CodexStub />;
    case "stats":
      return <StatsStub />;
    case "bounties":
      return <BountiesStub />;
    case "settings":
      return <SettingsPlaceholder />;
    default:
      return null;
  }
}

function RegionPlaceholder({ regionId }: { regionId: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="np-mono text-[var(--color-fg-2)] text-xs tracking-[0.3em]">
        constellation for {regionId} loading...
      </div>
    </div>
  );
}

function ZonePlaceholder({ zoneId }: { zoneId: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="np-mono text-[var(--color-fg-2)] text-xs tracking-[0.3em]">
        node graph for {zoneId} loading...
      </div>
    </div>
  );
}

function SettingsPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="np-mono text-[var(--color-fg-2)] text-xs tracking-[0.3em]">
        settings loading...
      </div>
    </div>
  );
}

function routeKey(r: ReturnType<typeof useUi.getState>["route"]): string {
  switch (r.name) {
    case "region":
      return `region:${r.regionId}`;
    case "zone":
      return `zone:${r.zoneId}`;
    default:
      return r.name;
  }
}

export default App;
