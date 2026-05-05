# Nullpath

> Gamified offsec career atlas. Tauri + React + SQLite.

A desktop app that turns offensive-security learning into a constellation of skills you explore, complete, and revisit. Learning happens **outside** the app — PortSwigger Web Security Academy, HackTheBox, TryHackMe, books, CTFs, real bug bounties. Nullpath is the dashboard that turns all of it into visible progress.

## What's in it

- **Atlas → Constellation → Node graph** — three zoomable layers, from career disciplines down to individual sub-techniques.
- **Web region** is fully seeded: **23 zones, 713 leaf nodes** covering every web-pentest vuln class, tooling, recon, methodology, and capstone milestone.
- **Per-node user content** — attach videos, blogs, writeups, labs, tools, and freeform markdown notes to every node. Searchable, filterable, exportable.
- **Smart session tracking** — OS-level idle detection (Windows / macOS / Linux X11). Sessions auto-pause on idle threshold, auto-end on hard cap.
- **Streaks + freeze tokens** — a daily streak with weekly freeze tokens to bridge skip days, ADHD-friendly.
- **XP + levels** — earned by minutes studied + node completion XP scaled by depth.
- **Echo Mode** — on node-complete, prompts a 3-sentence synthesis that pins to the node's notes.
- **Spaced repetition** — completed nodes schedule into a 1/3/7/21/60/180-day refresher queue.
- **Daily Briefing** — first-launch-of-day modal with streak, freeze tokens, hot zone, three suggested quests.
- **Random Kick** — "I have N minutes, what should I do?" → pulls a size-fitted quest from your weakest active zone.
- **Trail Mode** — a heuristic suggested path through unblocked nodes, drawn as animated edges.
- **Achievements** — 18-entry catalog: nodes/zones cleared, time logged, streaks, levels, first bounty.
- **Bounty Ledger** — track real submissions: program, severity, status, payout, CVE.
- **Codex** — global archive aggregating every resource you've collected.
- **Operator Card** — exportable identity card with handle / level / streak / specialties.
- **CRT boot sequence** on first launch, optional scanline overlay.
- **Synthesized SFX** — hover / click / success / level-up / glitch — no audio files shipped.

## Stack

- **Tauri 2** desktop shell (Rust)
- **React 19 + TypeScript + Tailwind v4** frontend
- **@xyflow/react** for the zone-level node graph
- **Framer Motion** for view transitions and modal animation
- **SQLite** via `tauri-plugin-sql` for local persistence (4 migrations: schema, seed, bounties, refreshers)
- **Web Audio API** for synthesized SFX (no Howler bundled audio)

## Run locally

Requires Rust 1.78+ and Node 20+.

```bash
npm install
npm run tauri dev
```

First boot compiles a debug binary (~2 minutes). Subsequent boots are instant.

## Architecture quick map

```
src/
  App.tsx                root + routes + global keys
  store.ts               zustand UI store + XP/level math
  styles.css             tailwind v4 + theme tokens
  db/                    sqlite access layer + types
  components/            sidebar, top bar, modals, node panel
  views/                 atlas / region / zone / codex / stats / bounties / settings
  hooks/                 useSessionTicker, useDailyBriefing
  lib/                   sfx, achievements, cn

src-tauri/
  src/lib.rs             tauri host + sql plugin wiring + idle command
  src/idle.rs            os-level idle detection (windows/macos/linux)
  migrations/            sql schema + seed data
plans/
  00-overview.md         design decisions + locked stack
  web-pentesting.md      the unified web skill graph (source of truth for seed)
scripts/
  build-seed.mjs         re-emit migration 002 from the plan markdown
```

## Re-seeding from the plan

The web pentesting skill graph lives in `plans/web-pentesting.md`. Edit it, then:

```bash
npm run seed:build
```

This rewrites `src-tauri/migrations/002_seed_web.sql` with the current node tree.

## Future regions

Two more career disciplines are stubbed as locked tiles on the Atlas:

- **Red Teaming** — internal pentest, AD, C2, OPSEC
- **Vuln Research / Exploit Dev** — RE, fuzzing, memory corruption, browser/kernel internals

Drafted as their own skeleton files when the user reaches them.
