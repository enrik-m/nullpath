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
import { SignInView } from "./views/SignInView";
import { Toaster } from "./components/Toaster";
import { useDailyBriefing } from "./hooks/useDailyBriefing";
import { primeAchievementEngine, startAchievementWatcher } from "./lib/achievements";
import { startRealtimeWatcher } from "./lib/realtime";
import { writePersistedRoute } from "./lib/routePersistence";
import * as db from "./db";
import { initAuth, isCloudMode, onAuthChange, currentUser, displayHandle } from "./lib/supabase";
import type { User } from "@supabase/supabase-js";

// Sentinel values for the auth state machine. Module-level constants
// rather than enum members so referential equality works in setState.
const LOCAL_MODE = Symbol("local-mode");
const SIGNED_OUT = Symbol("signed-out");

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

  // Cloud-mode auth gate. Local-only builds skip this entirely — `user`
  // stays at the sentinel `LOCAL_MODE` value and never gates rendering.
  // We track three distinct states:
  //   - `null`           → cloud mode, auth state still loading on boot
  //   - `LOCAL_MODE`     → local-only build, never gate
  //   - `User`           → signed in, render shell
  //   - `SIGNED_OUT`     → cloud mode, user not authenticated, show signin
  type AuthState = User | typeof LOCAL_MODE | typeof SIGNED_OUT | null;
  const [authState, setAuthState] = useState<AuthState>(isCloudMode() ? null : LOCAL_MODE);

  useEffect(() => {
    if (!isCloudMode()) return;
    let cancelled = false;
    initAuth().catch((err) => console.error("[auth] init failed:", err));
    const off = onAuthChange(async (user) => {
      if (cancelled) return;
      setAuthState(user ?? SIGNED_OUT);
      // On first sign-in, seed the operator handle from GitHub login if
      // the user hasn't already chosen something custom. The default
      // handle from the trigger is "operator" — anything else means the
      // user has personalized it and we leave it alone.
      if (user) {
        try {
          const state = await db.getAppState();
          if (state.handle === "operator" || !state.handle) {
            const gh = displayHandle(user);
            if (gh && gh !== "operator") {
              await db.updateAppState({ handle: gh });
            }
          }
        } catch (err) {
          // Non-fatal — the user can set the handle from Settings.
          console.warn("[auth] handle seed failed:", err);
        }

        // First-sync prompt: if the local IndexedDB has user-touched
        // nodes and we haven't yet asked this device, raise the modal.
        // We probe the LOCAL backend directly (cloud is now bound to
        // the index.ts router) to get an accurate node-count answer.
        try {
          const needSync = await db.isFirstSyncNeeded();
          if (needSync) {
            const local = await import("./db/local");
            const localNodes = await local.getAllNodes();
            const localCount = localNodes.filter(
              (n) => n.status !== "available" || n.user_xp > 0,
            ).length;
            const cloudNodes = await db.getAllNodes();
            const cloudCount = cloudNodes.filter(
              (n) => n.status !== "available" || n.user_xp > 0,
            ).length;
            if (localCount > 0) {
              // Defer to the next tick so the boot sequence finishes
              // first; the modal raises on top of the atlas, not on
              // top of BootView.
              window.setTimeout(() => {
                useUi.getState().showModal({
                  kind: "first-sync",
                  localNodeCount: localCount,
                  cloudNodeCount: cloudCount,
                });
              }, 1500);
            } else {
              // Nothing local to sync — just mark done so we don't
              // re-check on every load.
              db.markFirstSyncDone();
            }
          }
        } catch (err) {
          console.warn("[first-sync] probe failed:", err);
        }
      }
    });
    // Seed from cache in case onAuthChange didn't fire synchronously.
    const cached = currentUser();
    if (cached) setAuthState(cached);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

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

  // Cloud-mode realtime: subscribe to the user's user_achievement row
  // inserts. Pops unlock modals immediately, even when triggered by
  // another tab. No-op in local mode.
  useEffect(() => {
    const off = startRealtimeWatcher();
    return off;
  }, []);

  // Route persistence: mirror (route, selectedNodeId) into localStorage
  // on every change so BootView can restore the user to where they
  // left off after a refresh, instead of always shipping them back to
  // the atlas. The boot route itself is filtered inside the writer
  // (avoids restoring users into a perpetual boot animation).
  useEffect(() => {
    const unsub = useUi.subscribe((state, prev) => {
      if (state.route === prev.route && state.selectedNodeId === prev.selectedNodeId) {
        return;
      }
      writePersistedRoute(state.route, state.selectedNodeId);
    });
    return unsub;
  }, []);

  // DB init gate. The browser DB is local-first (sql.js + IndexedDB);
  // it can genuinely fail when:
  //   - IndexedDB is blocked (Safari private browsing, "Block all
  //     cookies" setting, embedded webviews)
  //   - The sql-wasm.wasm fetch is blocked by a CSP / network proxy
  //   - The WASM fails to instantiate (extremely old browser)
  // When any of those happen we want a real error screen, not the
  // perpetual "loading..." spinner each view falls into when its DB
  // call hangs. Stash the error in state and throw during render so
  // the existing ErrorBoundary catches it.
  const [bootError, setBootError] = useState<Error | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const state = await db.getAppState();
        if (cancelled) return;
        setScanlines(state.scanlines_enabled === 1);
        setSound(state.sound_enabled === 1);
        await primeAchievementEngine();
      } catch (err) {
        if (cancelled) return;
        console.error("[hydrate] DB init failed:", err);
        // Re-render and throw so ErrorBoundary picks it up with a
        // useful message rather than the views falling into limbo.
        setBootError(
          err instanceof Error ? err : new Error(`Local database unavailable: ${String(err)}`),
        );
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [setScanlines, setSound]);

  if (bootError) {
    // Throw during render so ErrorBoundary's existing fallback UI
    // takes over. The boundary's copy ("data is safe", reload button)
    // already covers this case correctly.
    throw bootError;
  }

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

  // Cloud-mode auth gate. While we're still resolving the cached session,
  // render nothing — the flicker between "signin screen" and "boot screen"
  // is worse UX than a 100ms blank moment.
  if (authState === null) {
    return (
      <MotionConfig reducedMotion={prefersReducedMotion ? "always" : "never"}>
        <div className="h-screen w-screen bg-[var(--bg)]" />
      </MotionConfig>
    );
  }

  // Cloud mode and the user isn't signed in — show the OAuth gate.
  if (authState === SIGNED_OUT) {
    return (
      <MotionConfig reducedMotion={prefersReducedMotion ? "always" : "never"}>
        <SignInView />
        <Toaster />
      </MotionConfig>
    );
  }

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
