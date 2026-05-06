# Changelog

All notable changes to Nullpath. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0 releases may contain breaking changes within minor bumps; the
project hasn't reached a stability commitment yet.

## [0.21.0-beta.1] — 2026-05-06

The "feels-like-a-game" release. Removes the time-tracking subsystem and
replaces session-driven mechanics with completion-driven ones, layers an
audit / security / a11y pass on top, adds a 56-achievement Trophy Room
with live progress bars, and rounds the project out with the standard
shipping infrastructure: tests, CI, lint + format, virtualization,
backup / restore, and the auto-update plugin (inert until the project
generates a signing key).

### Added

- **Trophy Room** view (route `/achievements`, key `5`) — browse all 56
  achievements, filter by unlocked / locked, search by name, see live
  progress bars on locked tiles, "NEXT UP" hint chip surfaces the
  closest-to-unlocking achievement.
- **56-achievement catalog** across 13 categories: first-steps, volume
  tiers, zone progress, depth specialization, kind specialization, skill
  mastery, streaks, levels, big-day pushes, codex/resources, notes,
  refreshers, bounties.
- Each achievement has `target` + `value(ctx)` so the engine and UI use
  the same numbers — no progress drift.
- Themed Lucide icons per achievement; rendered in unlock modal and
  Trophy Room.
- **Mutation pub/sub** in the DB layer (`db.onMutation`). Engine
  subscribes (debounced 350 ms) so unlocks fire from any trigger surface
  in real time — node complete, resource added, note saved, refresher
  acked, bounty CRUD, settings change.
- **Toast system** (`lib/toast.ts` + `<Toaster />`) for surfaced errors —
  hydrate failures, refused URL schemes, export failures.
- **Modal focus trap**, `aria-modal="true"`, first-focus, focus restore.
- **`prefers-reduced-motion`** respected via CSS `@media` and
  framer-motion `MotionConfig`.
- **`aria-label` + `title`** on every icon-only button.
- **Input length limits** (`lib/limits.ts`) — `maxLength` on every text
  field with consistent caps (handle 32, resource title 200, URL 2048,
  note body 100k, etc.).
- **URL safety helper** (`lib/url.ts`) — `openSafeUrl` / `isSafeUrl`
  reject any scheme other than http/https.
- **CSP** set in `tauri.conf.json`.
- **Per-table column allowlists** in `updateAppState` /
  `updateBounty` SQL builders.
- **`escapeLike`** for `searchNodes` LIKE wildcards.
- **ESLint flat config** + Prettier; `npm run lint`, `npm run format`.
- **`noUncheckedIndexedAccess`** in `tsconfig`; ~30 narrowing fixes.
- **Trophy Room → Operator Card pipeline**: card now also exposes
  `zonesTouched / zonesCleared / totalZones`.
- Migration **005** drops the dead `session` table and the unused
  `idle_threshold_seconds`, `idle_hard_cap_seconds`,
  `seconds_studied` columns.

### Changed

- **XP is now purely completion-driven** — no minute-based XP. The
  formula is `cum = 500 · level^1.5`.
- **Stats view** reworked: per-zone progress bars + 8-week completion
  heatmap (intensity by completion count, not minutes); ZONES tile
  replaces TIME tile; refresher queue listed inline.
- **Sidebar profile chip** subscribes to `dataVersion` instead of
  refetching on every route change.
- **`@fontsource`** subsetted to `latin` only — CSS bundle dropped from
  153 kB to 57 kB (gzip 67 kB → 11 kB).
- **`OperatorCardPortrait`** now lazy-loaded — own 9.84 kB chunk.
- **`fs:scope`** narrowed from `**` wildcard to
  `$DESKTOP / $DOCUMENT / $DOWNLOAD / $PICTURE / $HOME`.
- **`fs:default`** capability dropped; only `fs:allow-write-file` remains.
- SFX system rewritten: non-melodic NES-style (pitch sweeps + noise +
  square/sawtooth/triangle) with round-robin variants and per-call jitter
  to avoid the "machine gun" effect on rapid hover/click sequences.
- Achievement engine modal queue: replaced 200 ms `setInterval` poll with
  zustand `subscribe` on the close transition.

### Removed

- **Session tracking subsystem** — `useSessionTicker`, OS idle detection
  (`src-tauri/src/idle.rs`), `windows-sys` / `core-graphics` / `x11`
  dependencies, `session` table, all session-related UI (top-bar timer,
  "RESUME" / "END SESSION" buttons, session modals).
- **Random Kick** modal and button — was the "I have N minutes" picker.
- Dead code: `PixelFrame`, `getEdgesForZone`, `NodeEdgeRow`,
  `RegionWithStats`, `NodeWithChildren`, `useRoute`, `xpProgressInLevel`,
  `xpForMinute`, `streakMultiplier`, `formatHmShort` (moved use sites
  off it), store `regions` / `zonesByRegion` slices, duplicate `isoWeek`
  in `useDailyBriefing`.
- Dead CSS classes: `np-marquee`, `np-glitch`, `np-hr`, `np-glow-lime`.

### Fixed

- `getAppState()` no longer crashes via `rows[0]!` if the row is missing
  — throws a useful error instead.
- `db.dueRefreshersWithNode()` replaces the N+1 enrichment pattern with a
  single LEFT JOIN.
- `searchNodes` LIKE wildcards now escaped (`%`, `_`, `\`) so user input
  doesn't act as metacharacters.
- App hydrate retries once before surfacing a toast — handles the
  pre-migration first-run gracefully.

### Security

- All resource URLs validated against an http/https allowlist before
  storage and before opening; `javascript:`, `file://`, custom
  protocols refused.
- Dynamic SQL builders enforce per-table column allowlists.
- CSP set; `fs:scope` narrowed; capability surface reduced.

### Tooling

- **Vitest** + 35 unit tests across the core modules (XP / level
  curve, URL safety, length limits, achievement catalog + isUnlocked).
  jsdom + tiny stubs for the Tauri SQL / opener plugins so tests run
  without the shell.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): three parallel
  jobs — frontend (typecheck → lint → vitest → vite build), Rust
  (cargo check + clippy with `-D warnings`), and a Prettier
  format-check.
- **Prettier-formatted codebase** — one-time `prettier --write` pass
  applied to all `src/**/*.{ts,tsx,css,json}` so the CI format check
  passes from day one.

### Performance

- **List virtualization** — `react-window` 2.x added behind a
  `<MaybeVirtualList>` wrapper. Codex resource list flips to
  virtualized rendering above 100 entries; below that it stays as a
  plain column to avoid the resize-observer overhead.

### Data

- **JSON backup / restore** — Settings → Backup exports every
  user-generated row (per-node user_xp / status / timestamps,
  resources, notes, refreshers, bounties, streak days, achievements,
  app_state) to a portable JSON file via the native save dialog.
  Import wipes existing user state, replays the snapshot, reloads.
  Schema version pinned at 1; future shape changes will be
  backwards-compatibly migrated.

### Distribution

- **Auto-update plugin** (`tauri-plugin-updater`) wired in but inert
  until `tauri.conf.json → plugins.updater.active` is set to true.
  See `docs/updater.md` for the signing-key + manifest setup.
- **Code-signing docs** at `docs/code-signing.md` covering Apple
  Developer ID + notarization and Microsoft Authenticode flows.
  No certificates are committed.
