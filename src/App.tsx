import { useEffect } from "react";

/**
 * Root application component.
 *
 * The real router/views are wired in later commits — this is the
 * cyberpunk-theme smoke test: a centered glyph + lockup confirming
 * Tailwind v4, font loading, and the gradient backdrop are alive.
 */
function App() {
  useEffect(() => {
    // CRT scanlines on by default — toggleable from settings later
    document.body.dataset.scanlines = "on";
  }, []);

  return (
    <main className="h-screen w-screen flex items-center justify-center select-none">
      <div className="flex flex-col items-center gap-6">
        <div className="np-mono text-xs tracking-[0.4em] text-[var(--color-fg-2)] uppercase">
          Nullpath // boot ok
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-7xl font-bold tracking-tight bg-gradient-to-br from-[var(--color-cyan)] via-[var(--color-fg-0)] to-[var(--color-magenta)] bg-clip-text text-transparent">
            null
          </span>
          <span className="text-7xl font-bold tracking-tight text-[var(--color-fg-0)]">
            path
          </span>
          <span className="np-mono text-2xl text-[var(--color-cyan)] np-pulse">_</span>
        </div>
        <div className="np-mono text-[11px] text-[var(--color-fg-3)] tracking-widest">
          OFFENSIVE-SECURITY CAREER ATLAS
        </div>
      </div>
    </main>
  );
}

export default App;
