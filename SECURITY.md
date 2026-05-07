# Security policy

## Supported versions

Nullpath is pre-1.0; only the latest released minor receives security
fixes. Older minors will not be patched.

| Version  | Status         |
| -------- | -------------- |
| 0.23.x   | ✅ supported   |
| < 0.23.0 | ❌ end-of-life |

## Reporting a vulnerability

If you find a security issue **please do not open a public issue.**

Email `iceager@protonmail.com` with:

- A clear description of the issue and its impact
- A minimal proof-of-concept (sample input, exploit steps, or code)
- Affected version(s) — output of `Settings → about` or
  `package.json → version` is fine
- Any suggested mitigation if you have one

Expect an acknowledgement within **72 hours**. A fix will follow as
soon as practical, with a coordinated disclosure window typically
between 30 and 90 days depending on severity.

If we agree it's a real vulnerability, you'll be credited in the
release notes (or anonymously if you prefer).

## Architecture & threat model

Nullpath is a single-page web app served as static assets from Vercel
at `nullpath-one.vercel.app`. There is no bespoke server: the build
runs entirely in the browser. Two persistence modes share the same
view layer:

- **Local mode.** Data lives in a `sql.js` (SQLite-WASM) database
  persisted to IndexedDB on the user's device. Nothing leaves the
  browser. No account, no network calls beyond CDN asset fetches.
- **Cloud mode.** Data lives in a Supabase Postgres database. Auth is
  delegated to GitHub via OAuth (PKCE); we never see a password. Every
  per-user table enforces row-level security with `auth.uid() =
user_id`, deny-by-default. Achievement evaluation, streak math, and
  XP totals are computed by `SECURITY DEFINER` Postgres functions so
  the gates can't be faked from the client.

Frontend hardening:

- **CSP** delivered via `vercel.json` headers — no inline scripts, no
  `unsafe-eval`. (`unsafe-inline` is allowed on styles only because
  Tailwind v4 emits inline style attributes.)
- **HSTS** preloaded at the apex (`max-age` ≥ 31536000, `includeSubDomains`,
  `preload`).
- **No source maps** in the production build.
- URL opens are scheme-locked to http/https (`src/lib/url.ts`).

## What's in scope

- The deployed build at `nullpath-one.vercel.app`
- The open-source repository at `github.com/enrik-m/nullpath`
- The Postgres schema and RLS policies in `supabase/migrations/`
- The Vercel response headers and CSP configuration in `vercel.json`

## What's out of scope

- Self-hosted forks running on infrastructure we don't control. If
  you change the schema, the headers, or the OAuth flow, you own the
  resulting risk surface.
- GitHub itself. Report account-takeover or OAuth-platform issues to
  GitHub's security team.
- Supabase platform issues. Report directly to Supabase.
- Vercel platform issues. Report directly to Vercel.
- Bugs in the offsec content / skill-graph data itself — this is
  educational material, not security guidance the app enforces.
- Theoretical issues without a working PoC.

## Hardening summary

- All DB queries are **parameterized**; no string concatenation of
  user input. Dynamic SQL builders enforce explicit per-table column
  allowlists.
- **RLS is deny-by-default** on every per-user table; reads, inserts,
  updates, and deletes require `auth.uid() = user_id`.
- **Achievement and streak evaluation runs server-side** in Postgres
  functions; the catalog is not exposed to the client.
- **OAuth-only auth.** No passwords on our side; nothing to leak from
  our database.
- **2FA delegated to GitHub.** If your GitHub has 2FA, your nullpath
  has 2FA.

## Bounty / reward

None. Nullpath is a free hobby project with no revenue and no budget
for payouts. Credit in the release notes is the only thing on offer.
