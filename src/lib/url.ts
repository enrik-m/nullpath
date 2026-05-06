/**
 * URL safety helpers.
 *
 * Resources are user-supplied so this gate is the actual security
 * boundary — never call `window.open()` directly from view code,
 * route through `openSafeUrl`. The browser would happily fire any
 * URI scheme it knows about (`javascript:`, `data:`, custom
 * protocol handlers, etc.) — we only ever want plain web links.
 */

/** Whitelist of protocols we'll dispatch. */
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
 * Open `raw` in a new tab, but only after confirming the scheme is
 * http/https. Throws on a rejected URL — callers should surface a UI
 * message rather than silently dropping the click.
 *
 * `noopener` + `noreferrer` mitigate reverse-tabnabbing (the opened
 * page can't grab `window.opener` and navigate us elsewhere).
 */
export async function openSafeUrl(raw: string): Promise<void> {
  const u = parseSafeUrl(raw);
  if (!u) {
    throw new Error(`Refused to open URL with disallowed scheme: ${raw}`);
  }
  window.open(u.toString(), "_blank", "noopener,noreferrer");
}
