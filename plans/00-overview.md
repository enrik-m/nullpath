# Overview — Gamified Offsec Career Tracker

## What this is

A browser-based meta-tracker that gamifies the user's offensive-security learning journey. Learning happens **outside** the app (PortSwigger Web Security Academy, HackTheBox, TryHackMe, books, CTFs). The app turns external progress into:

- A visible skill graph across multiple offsec disciplines
- Quest log of current open tasks
- Streaks, XP, levels, badges
- Per-node user content (saved videos, blogs, writeups, notes)
- (Later) multiplayer leaderboards, study squads, shared/published notes

## World map structure

The world map shows **3 regions = 3 disciplines.** No tier divisions inside a region.

1. **Web Pentesting** (active) — covers junior + senior + research-grade web in one graph
2. **Red Teaming** (locked until user signals readiness) — internal pentest, AD, C2, OPSEC
3. **Vuln Research / Exploit Dev** (locked until user signals readiness) — RE, fuzzing, memory corruption, browser/kernel internals

When a region is "active," its constellation is fully visible and explorable. Within a region, **soft depth tags** on each leaf (`intro` / `std` / `adv` / `res`) signal complexity without forcing a path.

## Per-node content (user-attached)

Every leaf node in a constellation has slots for the user to attach:

- Saved videos (YouTube, conference talks)
- Blogs / writeups (links + optional pinned excerpts)
- Personal notes (markdown, freeform)
- Reference labs / boxes solved
- User-defined XP estimate (effort spent)

These are stored locally first (SQLite). Designed from day 1 to be **shareable**: a node's content can be exported, sent to a study buddy, or (later) published to a public profile / guild.

## Locked design decisions

### Aesthetic

Dark cyberpunk-terminal hybrid:

- Base: near-black (#0a0a0f) with deep gradient panels
- Accents: cyan (#22d3ee) primary, magenta (#e879f9) secondary, lime (#a3e635) for "complete"
- Type: JetBrains Mono for code/hacker bits, Inter for UI body
- Effects: subtle CRT scanline overlay (toggleable), particle/glitch bursts on level-up, soft glow on unlocked nodes

### Roadmap visualization

**Zoomable Atlas → Constellation pattern**:

- L0 (Atlas): stylized map showing 3 regions (Web active, others foggy until unlocked)
- L1 (Region): zoom into a region → constellation of zones, each zone is a cluster of related skill nodes
- L2 (Zone): zoom into a zone → individual skill nodes as stars, edges = soft prerequisites (advisory, not blocking)
- L3 (Node detail): click a node → side panel slides in with attached content (videos/blogs/notes), depth tag, and "complete" toggle
- Navigation: pan + zoom + minimap + search bar to jump to any node

### Progress verification

**Honor system.** Single click to mark a node done. No proof required.

### XP / Leveling math (draft, will revisit)

- Effort estimates are user-driven per node (the user knows what they spent)
- Per-node mastery toggle: locked → in-progress → complete
- Account level: total nodes completed + user-attached XP estimates summed; level N requires `500 * N^1.5` cumulative XP
- Daily streak: +5% XP multiplier per consecutive day, capped at +50% (10 days)
- Freeze tokens: 1 earned/week, max 3 banked, preserve streak on skip days
- No streak shame — rest days are mechanic, not failure

### Stack (locked)

- **React 19 + TypeScript + Tailwind v4** — browser-native SPA
- **Framer Motion** — animations + reduced-motion awareness
- **@xyflow/react** for the zone-level node graph (custom node renderer for cyberpunk look)
- **sql.js** (SQLite-WASM) + **IndexedDB** for local-mode persistence
- **Supabase** (Postgres + GitHub OAuth + RLS) for cloud-mode persistence
- **Vite** dev server + build
- **Zustand** for client state

### Out of scope

- Embedded learning content (no in-app labs/puzzles)
- Heavy gameplay (no combat, avatar, physics)
- Game engine (Phaser ruled out)
- Anti-cheat / proof systems
- Resource pre-population (user attaches resources per node as they learn)

## Plan files

- [00-overview.md](00-overview.md) — this file
- [web-pentesting.md](web-pentesting.md) — unified Web Pentesting skill graph (active region)
- (future) `red-teaming.md` — drafted when user reaches that region
- (future) `vuln-research.md` — drafted when user reaches that region

## Open design questions (deferred, not blocking)

- Multiplayer architecture: when, what backend, what features in v1 of MP
- Cosmetic unlocks taxonomy: terminal themes? cursor styles? UI accent palettes? badges?
- Achievements vs badges vs titles: pick one taxonomy
- Note-sharing format: export to markdown? share to a public profile? guild-only?
