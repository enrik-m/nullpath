/**
 * Supabase client + auth state.
 *
 * Cloud mode is opt-in: the app runs in local-only sql.js mode unless
 * BOTH `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set at build
 * time. This means a self-hoster can clone the repo and `npm run dev`
 * without provisioning anything — and the hosted nullpath.app build
 * gets cloud accounts automatically because Vercel injects the env
 * vars.
 *
 * Auth: GitHub OAuth only (Q1 spec — "no passkeys, entirely free,
 * blame goes to the IdP if a breach happens"). MFA is handled at
 * GitHub's side, so we never see passwords or 2FA secrets. Supabase's
 * GitHub provider grants `read:user` + `email` scopes by default; the
 * resulting auth.users row holds (id, github_login, email). We never
 * display the email in the app, never send anything to it, and never
 * expose it to other users — it's there because Supabase's auth
 * system uses it as a stable identifier. The privacy policy spells
 * this out for the user.
 *
 * The `isCloudMode()` flag is determined at module load and frozen for
 * the session — every db helper reads it once and routes accordingly.
 * We don't support runtime mode switching because mid-session sync
 * would mean reconciling two SQLite-shaped state machines, which is
 * out of scope for the first cloud cut.
 */

import { createClient, type SupabaseClient, type Session, type User } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env detection
// ---------------------------------------------------------------------------

const URL_KEY = "VITE_SUPABASE_URL";
const KEY_KEY = "VITE_SUPABASE_ANON_KEY";

const supabaseUrl = (import.meta.env[URL_KEY] as string | undefined) ?? "";
const supabaseAnonKey = (import.meta.env[KEY_KEY] as string | undefined) ?? "";

const cloudConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

/**
 * True when the build was configured for cloud mode (env vars present).
 * Read once at module load and frozen for the session — every db helper
 * routes off this without re-checking, so a deploy that rolls back env
 * vars takes effect on the next page load, not mid-session.
 */
export function isCloudMode(): boolean {
  return cloudConfigured;
}

/** The configured Supabase project URL (for diagnostics / CSP additions). */
export function getSupabaseUrl(): string {
  return supabaseUrl;
}

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let clientSingleton: SupabaseClient | null = null;

/**
 * Lazily construct the Supabase JS client. Called by every cloud-mode
 * db helper; in local-only mode it's never called (so the client is
 * never instantiated, and the auth-token-refresh interval never starts).
 *
 * Calling this in local mode is a programmer error — guard with
 * `isCloudMode()` first.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!cloudConfigured) {
    throw new Error(
      "Supabase client requested but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY " +
        "are not configured. This is a programmer error — guard the call site " +
        "with isCloudMode().",
    );
  }
  if (!clientSingleton) {
    clientSingleton = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Persist the session across reloads (default — explicit for clarity).
        persistSession: true,
        // Auto-refresh the JWT before it expires so requests never see a 401.
        autoRefreshToken: true,
        // Detect the OAuth callback `?code=` in the URL and complete signin.
        detectSessionInUrl: true,
        // PKCE — protects against authorization-code interception even though
        // we're SPA / public client. Default for browser flows.
        flowType: "pkce",
      },
    });
  }
  return clientSingleton;
}

// ---------------------------------------------------------------------------
// Auth state subscription
//
// Views read `currentUser()` for synchronous checks and call
// `onAuthChange()` to re-render on login/logout. We mirror the Supabase
// auth state into a tiny module-level variable so callers don't have to
// `await` a session check on every render.
// ---------------------------------------------------------------------------

type AuthListener = (user: User | null, session: Session | null) => void;

let cachedUser: User | null = null;
let cachedSession: Session | null = null;
const authListeners = new Set<AuthListener>();
let initialized = false;

function notifyAuth(): void {
  for (const fn of authListeners) {
    try {
      fn(cachedUser, cachedSession);
    } catch (err) {
      // A listener throwing must not break other listeners.
      console.error("[supabase] auth listener threw:", err);
    }
  }
}

/** Bootstrap the auth state cache. Idempotent. Safe to call from main.tsx. */
export async function initAuth(): Promise<void> {
  if (!cloudConfigured || initialized) return;
  initialized = true;
  const client = getSupabaseClient();

  const { data } = await client.auth.getSession();
  cachedSession = data.session;
  cachedUser = data.session?.user ?? null;
  notifyAuth();

  // Keep the cache in sync with sign-in / sign-out / token-refresh events.
  client.auth.onAuthStateChange((_event, session) => {
    cachedSession = session;
    cachedUser = session?.user ?? null;
    notifyAuth();
  });
}

/** Synchronous read of the currently signed-in user (or null). */
export function currentUser(): User | null {
  return cachedUser;
}

/** Synchronous read of the current session (or null). */
export function currentSession(): Session | null {
  return cachedSession;
}

/** Subscribe to auth state changes. Returns the unsubscribe function. */
export function onAuthChange(fn: AuthListener): () => void {
  authListeners.add(fn);
  // Immediately deliver the cached state so subscribers don't need a
  // separate "did the auth init complete" flag.
  try {
    fn(cachedUser, cachedSession);
  } catch (err) {
    console.error("[supabase] auth listener threw on subscribe:", err);
  }
  return () => authListeners.delete(fn);
}

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

/**
 * Kick off the GitHub OAuth flow. The user is redirected to GitHub,
 * they approve, GitHub redirects back to our origin with a `?code=`,
 * Supabase's `detectSessionInUrl` catches it, and `onAuthStateChange`
 * fires with the new session.
 *
 * `redirectTo` defaults to the current origin so dev (localhost:1421)
 * and prod (nullpath-one.vercel.app) both work with the same code path.
 * The redirect URL must be in Supabase Dashboard → Auth → URL
 * Configuration → Redirect URLs.
 */
export async function signInWithGitHub(): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: window.location.origin,
      // We don't ask for any extra scopes — default `read:user` is enough
      // to get the GitHub username, which is what we display.
    },
  });
  if (error) {
    throw new Error(`GitHub sign-in failed: ${error.message}`);
  }
}

/** Sign out and clear the cached session. */
export async function signOut(): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) {
    throw new Error(`Sign-out failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Display-name helper
//
// We don't ship our own usernames (Q5 — "I don't want to deal with
// dirty usernames"). The display name is whatever GitHub gives us:
// `user_metadata.user_name` is the GitHub login (lowercase handle),
// `user_metadata.full_name` is the optional display name. We prefer the
// login because it's stable, public, and unique on GitHub's side.
// ---------------------------------------------------------------------------

export function displayHandle(user: User | null): string {
  if (!user) return "operator";
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const login = typeof meta?.user_name === "string" ? meta.user_name : null;
  const full = typeof meta?.full_name === "string" ? meta.full_name : null;
  // We deliberately do NOT fall back to `user.email.split("@")[0]`.
  // GitHub primary emails commonly contain real-name local-parts
  // (`firstname.lastname@…`) and we never want a real name surfacing
  // as the displayed handle just because the user happens to have a
  // private GitHub login. "operator" is the safe default.
  return login ?? full ?? "operator";
}
