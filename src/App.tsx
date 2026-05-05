import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUi } from "./store";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ModalRoot } from "./components/ModalRoot";
import { SearchModal } from "./components/SearchModal";
import { RandomKickModal } from "./components/RandomKickModal";
import { BootView } from "./views/BootView";
import { AtlasView } from "./views/AtlasView";
import { RegionView } from "./views/RegionView";
import { ZoneView } from "./views/ZoneView";
import { CodexView } from "./views/CodexView";
import { StatsView } from "./views/StatsView";
import { BountiesView } from "./views/BountiesView";
import { SettingsView } from "./views/SettingsView";
import { useSessionTicker } from "./hooks/useSessionTicker";
import { useDailyBriefing } from "./hooks/useDailyBriefing";
import * as db from "./db";

function App() {
  const route = useUi((s) => s.route);
  const setScanlines = useUi((s) => s.setScanlines);
  const setSound = useUi((s) => s.setSound);

  const [searchOpen, setSearchOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);

  useSessionTicker();
  useDailyBriefing();

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

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      // ⌘K / Ctrl+K — global search (works even in fields)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (inField) return;

      const go = useUi.getState().go;
      if (e.key === "1") go({ name: "atlas" });
      else if (e.key === "2") go({ name: "codex" });
      else if (e.key === "3") go({ name: "stats" });
      else if (e.key === "4") go({ name: "bounties" });
      else if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "Escape") {
        const cur = useUi.getState().route;
        if (cur.name === "zone" || cur.name === "region") useUi.getState().back();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Boot view stands alone (no shell)
  if (route.name === "boot") {
    return (
      <>
        <BootView />
        <ModalRoot />
      </>
    );
  }

  return (
    <div className="h-screen w-screen flex">
      <Sidebar onSearchClick={() => setSearchOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onRandomKick={() => setKickOpen(true)} />
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

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <RandomKickModal open={kickOpen} onClose={() => setKickOpen(false)} />
      <ModalRoot />
    </div>
  );
}

function ViewRenderer() {
  const route = useUi((s) => s.route);
  switch (route.name) {
    case "atlas":
      return <AtlasView />;
    case "region":
      return <RegionView regionId={route.regionId} />;
    case "zone":
      return <ZoneView zoneId={route.zoneId} />;
    case "codex":
      return <CodexView />;
    case "stats":
      return <StatsView />;
    case "bounties":
      return <BountiesView />;
    case "settings":
      return <SettingsView />;
    default:
      return null;
  }
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
