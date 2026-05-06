# Code signing & notarization

Tauri's bundler can sign produced installers so the OS doesn't show a
"unidentified developer" warning. Nullpath ships with the bundler
configured but **not** yet wired to any specific certificate — that
requires Apple Developer ID / Microsoft Authenticode certs that have
to be issued externally.

Two distinct signatures are involved:

- **Updater signing** (handled by `tauri-plugin-updater`) — see
  [`docs/updater.md`](./updater.md). Uses a Tauri-generated minisign
  keypair. Used to verify update bundles fetched from your server.
- **OS code signing** (this doc) — uses an Apple Developer ID cert
  on macOS or a Microsoft Authenticode cert on Windows. Used so the
  OS treats Nullpath as a trusted publisher at install time.

## macOS (Apple Developer ID + notarization)

You need an Apple Developer Program membership ($99/yr).

1. **Generate a Developer ID Application certificate** in Apple
   Developer → Certificates → Production → "Developer ID Application".
2. **Install** the .cer into your Mac Keychain (double-click the .cer
   and the .p12 of the private key).
3. **Find the signing identity name**:
   ```bash
   security find-identity -v -p codesigning
   ```
   Returns lines like `Developer ID Application: Your Name (TEAMID)`.
4. **Configure tauri.conf.json**:
   ```json
   "bundle": {
     "macOS": {
       "signingIdentity": "Developer ID Application: Your Name (TEAMID)",
       "providerShortName": "TEAMID",
       "entitlements": null,
       "minimumSystemVersion": "10.15"
     }
   }
   ```
5. **Build**: `npm run tauri build`. The bundler signs the `.app`,
   `.dmg`, and `.app.tar.gz` automatically.
6. **Notarize** (required since macOS 10.15+ for distribution):
   ```bash
   xcrun notarytool submit \
     target/release/bundle/dmg/Nullpath_0.21.0_x64.dmg \
     --apple-id "you@example.com" \
     --team-id TEAMID \
     --password "@keychain:notary" \
     --wait
   xcrun stapler staple target/release/bundle/dmg/Nullpath_0.21.0_x64.dmg
   ```

## Windows (Authenticode)

1. **Acquire a code-signing certificate** from a CA (DigiCert, Sectigo,
   etc.). Standard certs are a few hundred USD/yr; EV certs avoid the
   SmartScreen reputation cold-start but cost more.
2. **Export the cert** as a `.pfx` file with a password.
3. **Configure tauri.conf.json**:
   ```json
   "bundle": {
     "windows": {
       "certificateThumbprint": "AABBCC...",
       "digestAlgorithm": "sha256",
       "timestampUrl": "http://timestamp.digicert.com"
     }
   }
   ```
   (Use either `certificateThumbprint` if the cert's installed in
   the Windows cert store, or set `WINDOWS_CERTIFICATE` /
   `WINDOWS_CERTIFICATE_PASSWORD` env vars to point at the .pfx
   file at build time.)
4. **Build**: `npm run tauri build`. Signs the `.msi` / `.exe`.

## Linux

No code signing convention. AppImages can be signed with `gpg
--detach-sign` if you want, but it isn't enforced. .deb / .rpm
package signing varies by distro.

## Checked into the repo

- Nothing certificate-related is in this repository. Certificates and
  private keys MUST be stored outside source control.
- The `bundle.macOS` and `bundle.windows` blocks in
  `tauri.conf.json` are intentionally minimal until certs exist.
- CI's `release.yml` (TODO — not yet committed) will read the
  signing material from GitHub Actions secrets at build time.
