# Changelog

All notable changes to Nullpath. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0 releases may contain breaking changes within minor bumps; the
project hasn't reached a stability commitment yet.

## [0.23.5-beta.1] — 2026-05-07

### Fixed

- **COMPLETE button no longer double-credits XP / streak / refresher.**
  In cloud mode, `setNodeStatus("complete")` already routed to the
  server-side `complete_node` RPC which atomically awarded XP,
  scheduled the refresher, and bumped the streak day — but the client
  ALSO called `setNodeXp`, `scheduleRefresher`, and
  `recordCompletionDay` separately, so every completion got the full
  bookkeeping twice. In local mode the same redundant calls weren't
  technically a bug, but they were structurally fragile. Replaced
  with a single atomic `setNodeStatus("complete")` call in NodePanel
  for both backends; local-mode `setNodeStatus` now handles the full
  XP / refresher / streak transition inline.

- **Spamming COMPLETE no longer farms XP / achievements.** Three
  guards:
  1. View-layer idempotency check — `markComplete` bails immediately
     if `node.status === "complete"`, so a redundant click on an
     already-complete node never even hits the data layer.
  2. `useRef`-based latch on the panel — rapid double-clicks during
     the await window are dropped (status transitions are now
     serialized).
  3. Data-layer no-op — both local `setNodeStatus("complete")` and
     cloud `complete_node` now check the row state and return
     without changes when the row is already complete.

- **RE-OPEN → COMPLETE no longer re-awards XP.** Closing the loop on
  the previous fix: a node that was previously completed (so
  `completed_at IS NOT NULL`) and re-opened to `available` no longer
  re-awards XP / re-bumps streak / re-fires achievements when
  re-completed. Just flips status. Both local and cloud now check
  `completed_at` to distinguish first-completion from re-completion.

  Cloud-side fix lives in
  `supabase/migrations/20260507120000_complete_idempotency.sql` —
  apply via Supabase SQL Editor before this build's behavior is
  visible to cloud users. (Local-mode users get the fix automatically
  on next reload.)

### Changed

- **Completed nodes are now obviously green.** The previous fill
  `#0e2a14` was so close in luminance to the available navy `#161b3a`
  that completed nodes blended into the grid. Bumped to `#1f4d28` —
  reads as clearly green at a glance. Also replaced the small `✓`
  glyph in the corner with a chunky lime `✓ DONE` chip with a glow,
  so "this is complete" can't be missed even when scanning a busy
  zone.

- **Button text is now properly centered.** `.np-btn` had asymmetric
  vertical padding (6px top / 8px bottom on `np-btn-md`, etc.) from
  an earlier attempt to compensate for the pixel font's visual
  baseline. In practice short labels like START and COMPLETE read as
  low-hung. Switched to symmetric padding (7px / 7px) plus
  `line-height: 1` (the pixel font has no descenders), so flexbox
  centering puts text exactly in the middle of the button box.

## [0.23.4-beta.1] — 2026-05-07

### Changed

- **RegionView shows a single primary pathway instead of the full
  prereq graph.** The previous edge layer drew every entry from
  `ZONE_PARENTS` — that meant Z23 alone had 8 incoming lines, the
  graph crisscrossed itself, and "where do I start?" was unreadable.
  Replaced with a single sequential pathway following sort_order:
  Z01 → Z02 → Z03 → … → Z23. The full dependency graph is still
  authoritative for unlock logic in `isZoneUnlocked()`; just no
  longer drawn by default.
- **Hover a zone to reveal its specific prereqs.** A zone's incoming
  prereqs now render as amber dashed edges only while you're hovering
  it. Default view stays clean ("here's the path"); hovering reveals
  the dependency context for that zone.

### Added

- **Route persistence across refresh.** Closing devtools, hard-
  reloading, or just F5'ing while you're 3 levels deep no longer
  bounces you back to the atlas. Last route + selected node ID are
  mirrored to localStorage on every change; BootView reads them on
  mount and uses the saved route as the post-boot destination.
  - Falls back to atlas if storage is unavailable / corrupt
  - Validates route shape before navigating (won't restore to a
    schema we no longer understand if the persisted shape changes)
  - Skips persisting the boot route itself (avoids loops)
  - New `src/lib/routePersistence.ts` is the single source of truth
    for the format / KEY; reader is BootView, writer is App.tsx

## [0.23.3-beta.1] — 2026-05-07

### Changed

- **Trail mode is on by default** in ZoneView. Was previously a toggle
  starting at off; new visitors now see the suggested-progression
  edges immediately rather than having to discover the TRAIL button.
  Users who want a distraction-free graph can flip it off via the
  same button.

### Fixed

- **RegionView zone order is now strictly numeric** (Z01 → Z02 → … →
  Z23 reading left-to-right, top-to-bottom). The seed's hand-coded
  `cx` / `cy` values produced an artistic but out-of-order
  constellation where neighbouring stars on screen could be Z09 / Z13
  / Z11. Replaced with a 5-column grid laid out by `sort_order`, so
  scanning reads as the canonical zone sequence. Prereq edges still
  draw between cells — the visual still reads as a flow graph, just
  ordered. Verified by `scripts/verify-region-order.mjs` which sorts
  all 23 stars by screen position and asserts the sequence matches
  Z01 → Z23.

## [0.23.2-beta.1] — 2026-05-07

### Changed

- **ZoneView reading order is now top-to-bottom (column-major).** The
  previous flow was row-major: row 1 left-to-right, then row 2
  left-to-right, etc — a zigzag that was harder to scan when looking
  for a specific top-level skill. Switched to column-major: column 1
  fills top-to-bottom, then column 2, etc. The eye flows vertically
  first, which reads more like a list / table-of-contents than a
  left-to-right grid.
- Column count is adaptive to the zone's top-level density:
  - ≤6 parents → 1 column (single vertical stack)
  - 7–16 parents → 2 columns
  - 17–30 parents → 3 columns
  - 31+ parents → 4 columns
    Tuned to the seed's distribution: tight zones like Z23 (Capstones,
    18 parents) get 3 cols, wide zones like Z01 (Foundations Plateau,
    43 leaves) get 4 cols of ~11 each. Avoids the previous problem of
    wide zones turning into 7×7 grids that lost visual hierarchy.
- Verified 0 overlaps across Z01 (43 nodes), Z04 (54 nodes including
  W01's 15-kid block), and Z11 (39 nodes) via the same Playwright
  bounding-box checker introduced in 0.23.1-beta.1.

## [0.23.1-beta.1] — 2026-05-07

### Fixed

- **ZoneView layout no longer overlaps prolific parents.** The previous
  layout placed sub-nodes in an orbit at radius 130 around their
  parent, with parents themselves on a fixed 260×200 grid. Once any
  parent had more than ~5 children (e.g. W01 SQL Injection with 15
  sub-techniques, X01 with 12, API1 with 10), the orbit ring spilled
  into the neighboring column's cell — children stacked on top of
  unrelated parents, edges crossed at random, and the graph became
  unreadable in zones with deep parents.

  Replaced with a footprint-aware tree layout:
  - Each top-level node's footprint = `max(card width, kid block width)`
    where the kid block is up to 6 wide × N rows tall
  - Top-level grid columns expand to fit the widest footprint in that
    column; rows expand to fit the tallest
  - Children sit in a horizontal grid directly below their parent,
    centered horizontally within the parent's allocated cell
  - Adjacent cells are separated by 56px / 72px gaps, so by
    construction no two nodes can overlap

  Verified by `scripts/verify-zone-layout.mjs` which captures Z01,
  Z04, Z11 and runs an O(n²) bounding-box overlap check — 0 overlaps
  on the worst-case zone (Z11 with 39 visible nodes).

## [0.23.0-beta.1] — 2026-05-06

The "cloud accounts" release. Adds an opt-in Supabase backend with
GitHub OAuth so the hosted nullpath build can sync per-user data
between devices, while preserving the existing sql.js + IndexedDB path
for self-hosters and offline use. Mode is decided at build time by the
presence of `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

### Added

- **Supabase Postgres schema** (`supabase/migrations/...initial_schema.sql`):
  shared read-only `region` / `zone` / `node_def` plus eight
  RLS-protected per-user tables (`user_app_state`, `user_node_state`,
  `user_node_resource`, `user_node_note`, `user_streak_day`,
  `user_refresher`, `user_bounty`, `user_achievement`). Every per-user
  table enforces `auth.uid() = user_id` on read/insert/update/delete.
- **Server-side compute functions** (`...functions.sql`): `complete_node`,
  `current_streak`, `operator_xp`, `evaluate_achievements`,
  `record_completion_day`, `schedule_refresher`, `ack_refresher`,
  `due_refreshers_with_node`, `reset_all_progress`. The achievement
  catalog lives inside `evaluate_achievements` so unlock conditions
  can't be faked from the client.
- **`src/db/cloud.ts`** — Supabase implementation of the same public
  data API the views consume. Auth-gated reads, RPC for server-side
  compute. Boundary adapters keep the SQLite-shaped types intact.
- **`src/db/index.ts`** is now a thin router that picks `cloud` or
  `local` at module-load based on `isCloudMode()`.
- **`src/lib/supabase.ts`** — singleton Supabase JS client, auth-state
  cache with `onAuthChange` subscription, GitHub OAuth helper using PKCE.
- **`src/views/SignInView.tsx`** — single-button GitHub OAuth gate.
  Cloud-mode users see this before BootView.
- **Settings → Account** — cloud-mode panel showing GitHub handle, uid
  prefix, sign-out, two-step account deletion, and a pointer to GitHub
  for OAuth-grant revocation.
- **Privacy Policy + Terms of Service** at `/privacy.html` and
  `/terms.html`, linked from the sign-in screen.
- **`docs/setup-auth.md`** — step-by-step walkthrough for provisioning
  Supabase + GitHub OAuth + Vercel env vars.
- **`.github/workflows/keepalive.yml`** — daily Supabase ping to keep
  free-tier projects from pausing after 7 days of inactivity.

### Changed

- **`vercel.json` CSP**: `connect-src` now allows
  `https://*.supabase.co` + `wss://*.supabase.co` (and the `.in`
  variants for older project URLs); `form-action` allows `github.com`
  for the OAuth redirect.

### Security notes

- The achievement-faking attack model is closed: in cloud mode, only
  the server-side `evaluate_achievements` function writes to
  `user_achievement`. Even if a malicious client forges `unlockAchievement`
  calls, the gate checks run against authoritative server-side row counts.
- Account deletion clears every per-user row immediately via
  `reset_all_progress`. The actual `auth.users` row deletion (which
  fully revokes the OAuth grant relationship at our side) is left for
  a follow-up Edge Function — currently sign-out + grant-revocation at
  github.com/settings/applications is the canonical path.

## [0.22.0-beta.1] — 2026-05-06

The "no longer a desktop app" release. Pivots Nullpath from a Tauri 2
desktop bundle to a pure browser app deployable on any static host
(Vercel free tier targeted). All progress data still lives locally —
the SQLite store moves from `tauri-plugin-sql` to `sql.js` (SQLite
compiled to WASM) backed by IndexedDB.

### Added

- **sql.js + IndexedDB** as the new storage backend. The full SQL
  query layer (~70 functions in `src/db/index.ts`) and all five
  migrations carry over **unchanged** — only the connection swaps.
- **`src/db/sqljs.ts`** — sql.js client with the same `select` /
  `execute` surface the Tauri plugin had. Persists the full SQLite
  file to IndexedDB on every write (debounced 500 ms) and on
  `beforeunload`. Restores from IndexedDB on next load.
- **`src/db/migrations.ts`** — browser-side migration runner that
  mirrors the Tauri plugin's `_migrations` bookkeeping table.
- **`vercel.json`** — SPA rewrite + cache headers for Vercel.
- **`docs/`** removed (was Tauri-specific code-signing + updater
  walkthroughs); web app doesn't need either.

### Changed

- **Browser-native file I/O** replaces every Tauri save/open dialog:
  - Operator card export → `URL.createObjectURL` + anchor click
  - Backup export → same blob-download pattern
  - Backup import → hidden `<input type="file">` clicked
    programmatically, resolves to a `File` via Promise
- **`openSafeUrl`** in `lib/url.ts` now uses
  `window.open(url, "_blank", "noopener,noreferrer")` instead of
  `tauri-plugin-opener.openUrl`. Same scheme allowlist, same
  rejection behavior.
- **Vitest config** uses regex-based `resolve.alias` to stub out
  `sql.js` and the WASM `?url` import so the test suite doesn't
  load the real WASM payload.

### Removed

- **`src-tauri/`** directory — the entire Rust shell, all five
  migration files (copied to `src/db/migrations/`), the
  `tauri-plugin-*` registrations, the `idle.rs` history (already
  empty), `Cargo.lock`. Anyone wanting the desktop history can
  `git log` it.
- **`@tauri-apps/api`**, **`@tauri-apps/cli`**,
  **`@tauri-apps/plugin-dialog`**, **`@tauri-apps/plugin-fs`**,
  **`@tauri-apps/plugin-opener`**, **`@tauri-apps/plugin-sql`**,
  **`@tauri-apps/plugin-updater`** removed from package.json.
- **`npm run tauri`** script removed.
- **CI Rust job** removed from `.github/workflows/ci.yml` — no
  Rust to build anymore.
- **`docs/code-signing.md`** and **`docs/updater.md`** removed.
- **Cargo entry** removed from `dependabot.yml`.
- **Tauri plugin mocks** in `src/__mocks__/` (`tauri-plugin-sql.ts`,
  `tauri-plugin-opener.ts`) replaced with `sql-js.ts` +
  `empty-string.ts`.

### Migration notes

- This is a one-way pivot. Existing desktop installs cannot import
  their `.db` file directly into the web app via the UI — the
  schema is identical but the storage backend is different. (The
  raw SQLite file from the desktop install can be loaded into the
  browser by reading it as bytes and constructing
  `new SQL.Database(bytes)` in dev tools, but no UI shortcut for
  that yet — it's a one-time, one-user transition.)
- All v0.21.0-beta.1 backup JSON files are forward-compatible —
  Settings → Backup → Import works the same in the web app.

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
