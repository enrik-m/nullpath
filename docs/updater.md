# Auto-update setup

Nullpath ships with `tauri-plugin-updater` wired in but inert. To turn
it on you need: a signing key pair, a hosted manifest (`latest.json`),
and a build server that signs the bundles before publishing.

## What's already wired

- Frontend: `@tauri-apps/plugin-updater` is in package.json.
- Rust: `tauri-plugin-updater` is registered in `src-tauri/src/lib.rs`.
- Capability: `updater:default` is granted in
  `src-tauri/capabilities/default.json`.
- Config: `plugins.updater` block exists in `tauri.conf.json` with
  `active: false` and empty `endpoints` / `pubkey`. While `active`
  stays false, calling `check()` from the frontend returns a
  no-update result without crashing.

The frontend helper to call once everything's configured:

```ts
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const update = await check();
if (update?.available) {
  await update.downloadAndInstall();
  await relaunch();
}
```

## Generate a signing key pair

```bash
npm run tauri signer generate -- -w ~/.tauri/nullpath.key
```

You'll be prompted for a password (write it down — also the build
server needs it).

The command prints the **public key** — copy it into
`tauri.conf.json` → `plugins.updater.pubkey`.

The **private key** stays at `~/.tauri/nullpath.key`. It signs every
`*.app.tar.gz` / `*.msi` / `*.AppImage` etc. that the Tauri bundler
produces.

## Build with signing

Set two environment variables before `npm run tauri build`:

```bash
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/nullpath.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="..."
npm run tauri build
```

Tauri emits signed bundles + `*.sig` files alongside them.

## The `latest.json` manifest

The updater fetches a JSON manifest at one of the URLs in
`plugins.updater.endpoints` and decides whether the running version is
older. Minimum shape:

```json
{
  "version": "0.18.0",
  "notes": "Bug fixes and improvements",
  "pub_date": "2026-06-01T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contents of nullpath_0.18.0_x64-setup.exe.sig>",
      "url": "https://updates.nullpath.example.com/v0.18.0/nullpath_0.18.0_x64-setup.exe"
    },
    "darwin-aarch64": {
      "signature": "<contents of Nullpath_0.18.0_aarch64.app.tar.gz.sig>",
      "url": "https://updates.nullpath.example.com/v0.18.0/Nullpath_0.18.0_aarch64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "<contents of nullpath_0.18.0_amd64.AppImage.sig>",
      "url": "https://updates.nullpath.example.com/v0.18.0/nullpath_0.18.0_amd64.AppImage"
    }
  }
}
```

Host it on any HTTPS endpoint you control — S3 + CloudFront, GitHub
Pages, your own server. Add the URL(s) to
`plugins.updater.endpoints`. Multiple endpoints are tried in order;
the first one that resolves wins.

## Flip the switch

When all of the above is in place:

```json
"plugins": {
  "updater": {
    "active": true,
    "endpoints": ["https://updates.nullpath.example.com/latest.json"],
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6...",
    "windows": { "installMode": "passive" }
  }
}
```

Until then, the updater plugin is loaded but completely passive.
