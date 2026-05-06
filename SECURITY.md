# Security policy

## Supported versions

Nullpath is pre-1.0; only the latest released minor receives security
fixes. Older minors will not be patched. The current supported line:

| Version       | Status      |
| ------------- | ----------- |
| 0.21.x        | ✅ supported |
| < 0.21.0      | ❌ end-of-life |

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

## Threat model

Nullpath is a **local desktop app** — all user data lives in a local
SQLite file (`nullpath.db`). The app does not contact any network
service except optionally:

- The configured update endpoint (off by default, see
  `docs/updater.md`)
- The OS browser via the opener plugin, when the user clicks an
  attached resource URL

Things considered **out of scope** for the security policy:

- Bugs in the offsec content / skill-graph data itself (this is
  educational material, not security guidance the app enforces)
- Issues that require local code execution as the user already
  (the user can read the SQLite file directly anyway)
- Theoretical issues without a working PoC

Things considered **in scope**:

- Anything that lets a malicious resource URL run code in the app
  context (URL scheme bypass, CSP bypass, IPC handler abuse)
- SQL injection through any user-input field
- Privilege escalation to anything outside `fs:scope`
  (`$DESKTOP / $DOCUMENT / $DOWNLOAD / $PICTURE / $HOME`)
- Backup-restore mishandling that corrupts the DB or skips
  migrations
- Update-channel attacks (signature forgery, downgrade, MITM —
  once the updater is active)

## Known security posture

The current shipping defenses, in case you want to start
attacking from the right place:

- All resource URLs validated against an http/https allowlist
  before storage and before opening (`lib/url.ts`)
- LIKE wildcards in user search are escaped with `ESCAPE '\\'`
- Dynamic SQL builders (`updateAppState`, `updateBounty`) have
  explicit per-table column allowlists
- All other DB queries are parameterized (`$1`, `$2`); no string
  concatenation of user input
- CSP set in `tauri.conf.json`
- `fs:scope` narrowed to user-writable directories only
- `noUncheckedIndexedAccess` on, lint-strict TS
