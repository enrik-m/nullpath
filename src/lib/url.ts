/**
 * URL safety helpers.
 *
 * The opener plugin will happily fire any URI scheme the OS knows about
 * (file:///, javascript:, mailto:, custom protocol handlers, etc.). For a
 * desktop app we only ever want plain web links — anything else is either
 * a footgun (browsing local files) or an outright XSS-style attack vector
 * (`javascript:`). Resources are user-supplied so this gate is the actual
 * security boundary; never call `openUrl` directly from view code, route
 * through `openSafeUrl`.
 */

import { openUrl } from "@tauri-apps/plugin-opener";

/** Whitelist of protocols we'll dispatch to the OS opener. */
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/**
 * Validate a string as an http/https URL. Returns the parsed URL on
 * success, or `null` on any failure (parse error, disallowed scheme,
 * empty input, etc.). Cheap to call inline before persisting.
 */
export function parseSafeUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (!ALLOWED_SCHEMES.has(u.protocol)) return null;
    return u;
  } catch {
    return null;
  }
}

/** True iff `raw` is a syntactically valid http/https URL. */
export function isSafeUrl(raw: string | null | undefined): boolean {
  return parseSafeUrl(raw) !== null;
}

/**
 * Open `raw` in the user's default browser, but only after confirming the
 * scheme is http/https. Throws on a rejected URL — callers should surface
 * a UI message rather than silently dropping the click.
 */
export async function openSafeUrl(raw: string): Promise<void> {
  const u = parseSafeUrl(raw);
  if (!u) {
    throw new Error(`Refused to open URL with disallowed scheme: ${raw}`);
  }
  await openUrl(u.toString());
}
