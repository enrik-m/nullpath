# Launch announcement copy

Ready-to-paste posts for the Nullpath launch. Replace
`https://nullpath.app` with whatever Vercel URL you actually deploy
to. Each platform's audience is different — pick the right vibe.

---

## Twitter / X (single tweet, 280 chars)

> Built **Nullpath** — a tracker for offsec career progress.
>
> 23 zones · 820 verified web-pentest skills · OWASP / CWE tagged · 56 trophies · spaced repetition · operator card export.
>
> Browser-native, local-first, no signup.
>
> ↓ [https://nullpath.app](https://nullpath.app)

Alt copy if the above feels too dense:

> Spent the last few weeks building **Nullpath** — turns offsec learning into a constellation of skills. 820 verified nodes, real bug bounty ledger, trophy room. All local-first in your browser.
>
> [https://nullpath.app](https://nullpath.app)

---

## Twitter / X — thread version (when you want to drive depth)

**Tweet 1 (hook):**

> Most "learning trackers" don't track learning, they track time. The real signal isn't hours — it's *which specific skills did you actually nail*.
>
> Built **Nullpath** to fix that. 820 verified web-pentest skills, completion-driven progress, browser-native. 🧵

**Tweet 2 (what it is):**

> Atlas → Region → Zone → Node. Four layers, from "career discipline" down to "this exact OWASP/CWE-tagged sub-technique." Mark a node complete; XP scales with depth. Streaks, levels, refreshers, the whole feedback loop.

**Tweet 3 (the content):**

> Web region's fully seeded — every zone covers a real attack surface (Injection Caves, Auth & Session, AppSec Fortress, Recon Outpost…). Not synthesized — pulled from PortSwigger Academy, OWASP Top 10:2025, OWASP API Top 10, OWASP LLM Top 10, CWE 4.20.

**Tweet 4 (the trophy hook):**

> 56-achievement Trophy Room with live progress bars on locked tiles ("18 / 25 nodes — Pattern Forming"). Engine fires off a debounced pub-sub on every DB write so unlocks pop the moment you cross the line.

**Tweet 5 (technical):**

> No backend. SQLite compiled to WASM, persisted to IndexedDB. Your data lives in your browser; nothing leaves. Auth + leaderboards are coming, but the local-first single-user mode stays as the default forever.

**Tweet 6 (CTA):**

> Free, open source, MIT, Vercel-deployed.
>
> [https://nullpath.app](https://nullpath.app) · [https://github.com/enrik-m/nullpath](https://github.com/enrik-m/nullpath)
>
> Working through the Web region myself in real time. Replies welcome with what you'd add to the graph.

---

## LinkedIn (longer-form, professional tone)

> **Launching Nullpath: a gamified offsec career atlas.**
>
> The honest problem with most "skill trackers" for security is they reward time-on-task. You can spend 200 hours skimming articles and still not know whether you can actually exploit an SSRF in a real engagement.
>
> Nullpath flips that. Every unit of progress is a single, named, OWASP/CWE-tagged technique you've actually learned. Mark a node complete; you've earned the XP. Don't, and the XP isn't there.
>
> What's in v0.22.0-beta.1:
>
> • 23 zones, 820 verified web-pentest nodes — sourced from PortSwigger Web Security Academy, OWASP Top 10:2025, OWASP API Top 10, OWASP LLM Top 10, MITRE CWE 4.20
> • Per-node resource library: attach the writeups, labs, tools, videos that actually taught you the thing
> • Spaced-repetition refresher queue (1 / 3 / 7 / 21 / 60 / 180-day)
> • Real bug-bounty ledger: program, severity, status, payout, CVE
> • Operator card — exportable 1080×1920 portrait PNG with handle, level, streak, signature skill
> • 56-trophy room with live progress bars
>
> The whole thing runs in your browser. SQLite-in-WASM with IndexedDB persistence. Local-first, no signup, no cloud, no analytics on your data.
>
> Stack: React 19, TypeScript strict, Tailwind v4, @xyflow/react, Vite, Vercel.
>
> Roadmap: red-team region, vuln-research region, accounts + leaderboards (opt-in only).
>
> Live: https://nullpath.app
> Source: https://github.com/enrik-m/nullpath
>
> Feedback genuinely welcome — especially from people who've worked through the OSCP / CWS / Practical Web Hacking ladders. What's missing from the graph?

---

## Reddit — r/netsec / r/cybersecurity (self-post)

**Title:**
`Show: Nullpath — a 820-node skill tracker for web pentesting (browser-native, local-first, MIT)`

**Body:**

> Built this over the last few weeks because I wanted a way to actually map out what I knew vs. didn't, instead of measuring "study hours."
>
> ## What it is
>
> A four-layer skill graph: Atlas (career disciplines) → Region → Zone (constellation) → Node (single technique). The web region is fully seeded with **23 zones and 820 verified nodes** covering every sub-skill you'd actually be tested on:
>
> - Vuln classes (Injection Caves, XSS, SSRF, IDOR / authZ, Deserialization, SSRF, XXE, etc.)
> - Auth + session (JWT, OAuth, SAML, session fixation, MFA bypass classes)
> - AppSec specifics (CSP bypass, CORS misconfig, prototype pollution, etc.)
> - Tooling (Burp, ffuf, sqlmap, Caido, gau, etc.)
> - Recon (subdomain, content discovery, GitHub dorking)
> - Methodology (recon → mapping → exploit → post-ex)
> - Capstone chains (full attack from external recon to data exfil)
>
> Every applicable node is tagged with its OWASP entry and CWE ID. Sources: PortSwigger Academy curriculum, OWASP Top 10:2025, OWASP API Top 10, OWASP LLM Top 10, MITRE CWE 4.20.
>
> ## Why local-first
>
> Your offsec progress is honestly nobody else's business. Nullpath is browser-native — SQLite compiled to WASM, persisted to IndexedDB. Nothing leaves your machine. No signup, no email, no cloud sync. JSON backup/restore in Settings if you want to move between devices.
>
> Auth + leaderboards are on the roadmap but will be opt-in. The local-only mode stays the default forever.
>
> ## What's in v0.22.0-beta.1
>
> - 56-trophy room with live progress bars on locked tiles
> - Spaced-repetition refresher queue (1/3/7/21/60/180-day)
> - Bounty ledger (program, severity, status, payout, CVE)
> - Operator card — exportable 1080×1920 portrait PNG you can post
> - Codex (global resource library across the graph)
> - 8-week completion heatmap, streaks, freeze tokens
>
> ## Stack
>
> React 19 + TS (strict, `noUncheckedIndexedAccess`) + Tailwind v4 + Vite + Vercel. ~57 unit tests, lint-strict, prettier-formatted, GitHub Actions CI.
>
> ## Status
>
> **0.22.0-beta.1.** Web region fully playable. Red-team and vuln-research regions stubbed but not implemented yet. No accounts yet. MIT licensed.
>
> Live: [https://nullpath.app](https://nullpath.app)
> Source: [https://github.com/enrik-m/nullpath](https://github.com/enrik-m/nullpath)
>
> Genuinely interested in feedback. The skill graph in `plans/web-pentesting.md` is the source of truth — PRs welcome.

---

## Hacker News — Show HN

**Title:**
`Show HN: Nullpath – A 820-node skill tracker for web pentesting`

**First comment (post body):**

> I'm building this as an honest answer to "where am I in my offsec career, actually?" — not "how many hours have I logged" but "which specific OWASP/CWE-tagged techniques have I demonstrably learned."
>
> The web region is seeded with 23 zones / 820 verified nodes, sourced from PortSwigger Academy, OWASP Top 10:2025, OWASP API Top 10, OWASP LLM Top 10, MITRE CWE 4.20. Every node tags its OWASP entry + CWE ID where applicable.
>
> Fully browser-native: SQLite compiled to WASM, persisted to IndexedDB. No backend, no signup, no cloud. Drop the URL into your browser and you've got it.
>
> Stack: React 19 + TypeScript (strict mode + `noUncheckedIndexedAccess`), Tailwind v4, @xyflow/react for the zone graph, Vite + Vercel.
>
> What's in 0.22.0-beta.1:
>
> - Atlas → Region → Zone → Node navigation (3 levels of zoom)
> - Per-node resources, freeform markdown notes, sub-techniques
> - 56-trophy room with live progress bars on locked tiles
> - Spaced-repetition refresher queue
> - Bounty ledger (severity, status, payout, CVE)
> - Operator card export (1080×1920 PNG)
> - Backup / restore via JSON
> - 57 unit tests, prettier + eslint + strict TS
>
> Roadmap: red-team region, vuln-research region, optional accounts for leaderboards.
>
> Source: https://github.com/enrik-m/nullpath
> Live: https://nullpath.app

---

## Mastodon / Bluesky (300–500 char window)

> Just shipped **Nullpath** — a 820-node skill tracker for web pentesting careers.
>
> 23 zones, OWASP/CWE-tagged nodes, 56 trophies, spaced-rep refreshers, bounty ledger, operator card export. Browser-native: SQLite-in-WASM + IndexedDB. No signup, no cloud, no analytics on your data. MIT.
>
> https://nullpath.app

---

## Discord / Slack (informal one-liner)

> hey, built a thing — `nullpath` — it's basically a skill tree for web pentesting (820 nodes, OWASP-tagged, browser-native, local-first). like an offsec strava without the strava part. https://nullpath.app

---

## A note on phrasing

A few words I'm deliberately NOT using in any of the above and would
suggest you don't either:

- **"AI-powered"** — Nullpath has zero AI. Don't pretend it does.
- **"Revolutionary" / "game-changing"** — these are vibes-based and the
  audience knows it. Concrete numbers (820 nodes, 56 trophies) read
  more honest.
- **"Best-in-class"** — leave room for someone to disagree.

Keep the focus on the artifact (the graph, the trophy mechanic, the
local-first model) and the targeted-utility framing
("answer where am I in my offsec career, actually"). That lands
better than marketing language with the audience you're after.
