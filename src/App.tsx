import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { useUi } from "./store";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ModalRoot } from "./components/ModalRoot";
import { SearchModal } from "./components/SearchModal";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { BootView } from "./views/BootView";
import { AtlasView } from "./views/AtlasView";
import { RegionView } from "./views/RegionView";
import { ZoneView } from "./views/ZoneView";
import { CodexView } from "./views/CodexView";
import { StatsView } from "./views/StatsView";
import { BountiesView } from "./views/BountiesView";
import { AchievementsView } from "./views/AchievementsView";
import { SettingsView } from "./views/SettingsView";
import { Toaster } from "./components/Toaster";
import { useDailyBriefing } from "./hooks/useDailyBriefing";
import { primeAchievementEngine, startAchievementWatcher } from "./lib/achievements";
import { toast } from "./lib/toast";
import * as db from "./db";

function App() {
  const route = useUi((s) => s.route);
  const setScanlines = useUi((s) => s.setScanlines);
  const setSound = useUi((s) => s.setSound);
  const scanlinesEnabled = useUi((s) => s.scanlinesEnabled);
  // When the OS asks for reduced motion (vestibular concerns, low-power
  // mode, etc.), tell framer-motion to snap to final state instead of
  // tweening. Pairs with the @media (prefers-reduced-motion) block in
  // styles.css that pins our CSS animations.
  const prefersReducedMotion = useReducedMotion();

  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useDailyBriefing();

  // Mirror the scanlines preference onto <body> so the global CSS overlay
  // can react to it. Side-effect lives outside the zustand reducer (which
  // should be pure) so SSR / tests don't blow up on a missing `document`.
  useEffect(() => {
    document.body.dataset.scanlines = scanlinesEnabled ? "on" : "off";
  }, [scanlinesEnabled]);

  // Bridge db-layer mutation events into the zustand `dataVersion`
  // counter. Components that derive stats from the DB (Sidebar profile
  // chip) subscribe to dataVersion and refetch exactly when something
  // actually changed — no more polling on route.
  useEffect(() => {
    const off = db.onMutation(() => useUi.getState().bumpData());
    return off;
  }, []);

  // Achievement engine subscribes to mutations too (debounced) so unlocks
  // fire from every trigger surface — node-complete, resource added,
  // note saved, refresher acked, bounty logged — not just node-complete.
  useEffect(() => {
    const off = startAchievementWatcher();
    return off;
  }, []);

  // Hydrate user prefs once DB is ready + prime achievement engine.
  // The first attempt can fail if migrations haven't run yet — we retry
  // once after a tick (any DB call inside the Tauri SQL plugin runs the
  // migration sequence first), so by then app_state row 1 exists.
  useEffect(() => {
    let cancelled = false;
    let retried = false;
    async function hydrate() {
      try {
        const state = await db.getAppState();
        if (cancelled) return;
        setScanlines(state.scanlines_enabled === 1);
        setSound(state.sound_enabled === 1);
        await primeAchievementEngine();
      } catch (err) {
        if (!retried) {
          retried = true;
          window.setTimeout(hydrate, 600);
          return;
        }
        if (cancelled) return;
        console.error("[hydrate] failed after retry:", err);
        toast.error("Could not load profile. Restart the app if this persists.");
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
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

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
      else if (e.key === "5") go({ name: "achievements" });
      else if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
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
      <MotionConfig reducedMotion={prefersReducedMotion ? "always" : "never"}>
        <BootView />
        <ModalRoot />
        <Toaster />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion={prefersReducedMotion ? "always" : "never"}>
      <div className="h-screen w-screen flex">
        <Sidebar onSearchClick={() => setSearchOpen(true)} />

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
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
        <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <ModalRoot />
        <Toaster />
      </div>
    </MotionConfig>
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
    case "achievements":
      return <AchievementsView />;
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
