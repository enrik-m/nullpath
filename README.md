# Nullpath

> Gamified offsec career atlas. Tauri + React + SQLite.

A desktop app that turns offensive-security learning into a constellation of
skills you explore, complete, and revisit. Learning happens **outside** the
app — PortSwigger Web Security Academy, HackTheBox, TryHackMe, books, CTFs,
real bug bounties. Nullpath is the dashboard that turns all of it into
visible progress.

## What's in it

- **Atlas → Region → Zone → Node** — four navigation layers, from career
  disciplines down to individual sub-techniques.
- **Web region fully seeded** — 23 zones, 820 verified nodes covering every
  web-pentest vuln class, tooling, recon, methodology, and capstone
  milestone. OWASP / CWE tags on every applicable node.
- **Per-node user content** — attach videos, blogs, writeups, labs, tools,
  and freeform markdown notes to every node. Searchable and filterable from
  the global Codex view.
- **Streaks + freeze tokens** — a daily completion streak with weekly freeze
  tokens to bridge skip days, ADHD-friendly.
- **XP + levels** — XP is awarded on node completion, scaled by node depth
  (intro / std / adv / res). Curve: `cum = 500 · level^1.5`.
- **Echo Mode** — on node-complete, prompts a 3-sentence synthesis that pins
  to the node's notes. Forces consolidation.
- **Spaced repetition** — completed nodes schedule into a 1/3/7/21/60/180-day
  refresher queue.
- **Daily Briefing** — first-launch-of-day modal with streak, freeze tokens,
  hot zone, three suggested quests.
- **Random Kick** — "I have N minutes, what should I do?" → pulls a
  size-fitted quest from your active zones.
- **Trail Mode** — a heuristic suggested path through unblocked nodes, drawn
  as animated edges in the zone view.
- **Achievements** — milestone catalog: nodes / zones cleared, streaks,
  levels, first bounty, first payout.
- **Bounty Ledger** — track real submissions: program, severity, status,
  payout, CVE.
- **Codex** — global archive aggregating every resource you've attached
  anywhere in the graph.
- **Operator Card** — exportable 1080×1920 PNG identity card with handle /
  level / streak / signature skill / per-zone progress.
- **CRT boot sequence** on first launch, optional scanline overlay.
- **Synthesized SFX** — hover / click / success / level-up — no audio files
  shipped.

## Stack

- **Tauri 2** desktop shell (Rust)
- **React 19 + TypeScript + Tailwind v4** frontend
- **@xyflow/react** for the zone-level node graph
- **Framer Motion** for view transitions, modal animation, and reduced-motion
  awareness
- **SQLite** via `tauri-plugin-sql` for local persistence
- **html-to-image** for operator-card export (lazy-loaded)
- **Web Audio API** for synthesized SFX

## Run locally

Requires Rust 1.78+ and Node 20+.

```bash
npm install
npm run tauri dev
```

First boot compiles a debug binary (~2 minutes). Subsequent boots are
instant.

## Scripts

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Start Vite dev server (frontend only, no shell)           |
| `npm run tauri dev`  | Full app — Rust shell + frontend                          |
| `npm run build`      | Type-check + production frontend build                    |
| `npm run typecheck`  | `tsc --noEmit`                                            |
| `npm run lint`       | ESLint over `src/` + `scripts/`                           |
| `npm run lint:fix`   | ESLint with `--fix`                                       |
| `npm run format`     | Prettier write across `src/`                              |
| `npm run seed:build` | Re-emit migration 002 from `plans/web-pentesting.md`      |

## Architecture

```
src/
  App.tsx                root + routes + global keys + reduced-motion
  store.ts               zustand UI store + XP/level math
  styles.css             tailwind v4 + theme tokens + animations
  db/
    index.ts             sqlite access layer + mutation pub/sub
    types.ts             row interfaces for every table
  components/
    Sidebar / TopBar     shell chrome
    NodePanel            per-node side panel (resources, notes, status)
    ModalRoot            single mount point for echo / level-up / achievement
    Toaster              global toast queue
    OperatorCardPortrait lazy-loaded export card (1080×1920 PNG)
    pixel/               PixelButton / PixelTag / PixelSprite primitives
  views/
    Atlas / Region / Zone / Codex / Stats / Bounties / Settings
  hooks/                 useDailyBriefing, useMediaQuery
  lib/                   sfx, achievements, toast, url, limits, resourceKinds

src-tauri/
  src/lib.rs             Tauri host + SQL plugin wiring
  migrations/
    001_initial_schema   region/zone/node/streak/app_state
    002_seed_web         23 zones, 820 nodes
    003_bounties         bounty_submission ledger
    004_repetition       spaced-repetition refresher queue
    005_drop_session     drop dead session table + idle/seconds columns
  capabilities/default.json  scoped fs/sql/dialog/opener perms
  tauri.conf.json        app config + CSP

plans/
  00-overview.md         design decisions + locked stack
  web-pentesting.md      source-of-truth skill graph for migration 002

scripts/
  build-seed.mjs         re-emit migration 002 from the plan markdown
```

## Security posture

- CSP set in `tauri.conf.json` (`default-src 'self' ipc: ...`)
- `fs:scope` narrowed to `$DESKTOP/$DOCUMENT/$DOWNLOAD/$PICTURE/$HOME` only
- URL opens are scheme-locked to http/https (`lib/url.ts`); javascript:,
  file://, and custom protocols are refused
- LIKE wildcards in user search are escaped with `ESCAPE '\\'`
- Dynamic SQL builders (updateAppState, updateBounty) have explicit column
  allowlists — keys not in the set are silently dropped
- Input length limits centralized in `lib/limits.ts` and enforced via
  `maxLength` on every text field
- All DB mutations are parameterized (`$1`, `$2`); no string concatenation

## Re-seeding from the plan

The web pentesting skill graph lives in `plans/web-pentesting.md`. Edit it,
then:

```bash
npm run seed:build
```

This rewrites `src-tauri/migrations/002_seed_web.sql` with the current node
tree.

## Future regions

Two more career disciplines are stubbed as locked tiles on the Atlas:

- **Red Teaming** — internal pentest, AD, C2, OPSEC
- **Vuln Research / Exploit Dev** — RE, fuzzing, memory corruption,
  browser / kernel internals

Drafted as their own skeleton files when the user reaches them.

## License

[MIT](./LICENSE)
