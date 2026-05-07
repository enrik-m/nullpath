/**
 * delete-account — Supabase Edge Function.
 *
 * Why this exists: the in-app "Delete account" button can wipe every
 * per-user row via reset_all_progress() (covered by RLS, runs as the
 * caller), but it CANNOT delete the row in `auth.users` itself —
 * that's a privileged operation gated by service_role. For a clean
 * GDPR-grade right-to-erasure path, we need a server-side function
 * that:
 *
 *   1. Verifies the caller's JWT
 *   2. Resolves the auth.uid() from it
 *   3. Calls auth.admin.deleteUser(uid) using the service_role key
 *
 * The service_role key never reaches the browser — it's an Edge
 * Function env var (SUPABASE_SERVICE_ROLE_KEY). The deletion of
 * auth.users cascades to every per-user row via FK ON DELETE CASCADE.
 *
 * Deploy via Supabase Dashboard → Edge Functions → Deploy a new
 * function, OR `supabase functions deploy delete-account` if you have
 * the CLI. The Dashboard's UI accepts a single index.ts paste — no
 * package.json or imports config needed for this function.
 *
 * Required env vars (set automatically by Supabase for deployed
 * functions):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

// @ts-expect-error — Deno global is available in Supabase Edge runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// CORS allowlist. The browser hitting this function is the SPA at
// nullpath-one.vercel.app (or localhost:1421 in dev). Reflect-allow
// the origin only when it's in this allowlist; everything else is
// rejected at the preflight.
const ALLOWED_ORIGINS = new Set([
  "https://nullpath-one.vercel.app",
  "http://localhost:1421",
  "http://localhost:1420",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://nullpath-one.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// @ts-expect-error — Deno.serve is the Supabase Edge entry point
Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Pull the JWT from the Authorization header.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "missing or malformed Authorization header" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const jwt = authHeader.slice("Bearer ".length);

  // Read env. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected
  // for deployed Edge Functions.
  // @ts-expect-error — Deno global
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // @ts-expect-error — Deno global
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "function misconfigured" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Two clients:
  // 1. `userClient` — created with the caller's JWT. Used to verify the
  //    JWT and resolve the user's identity. Cannot escalate.
  // 2. `adminClient` — service_role. Used ONLY to call
  //    auth.admin.deleteUser after we've confirmed the JWT is valid.
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the JWT by asking Supabase auth who it belongs to.
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "invalid or expired token" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  // Delete the auth.users row. ON DELETE CASCADE on every per-user
  // table FK to auth.users(id) wipes all per-user data atomically.
  const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return new Response(JSON.stringify({ error: `delete failed: ${deleteErr.message}` }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, deleted_user_id: userId }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
