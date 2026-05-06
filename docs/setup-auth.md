# Setting up cloud auth

This walkthrough provisions Supabase + GitHub OAuth so the hosted
nullpath build can sync per-user data. If you only want to use
nullpath locally (sql.js + IndexedDB), skip this — the app runs fine
without any of it.

This is **not** a tutorial on Supabase or GitHub. It's the exact
sequence of buttons to click for nullpath specifically.

## What you'll have at the end

- A Supabase project with the schema applied and RLS policies enforced.
- A GitHub OAuth app whose `client_id` and `client_secret` are pasted
  into Supabase.
- Three environment variables set in Vercel that flip the build into
  cloud mode.
- A daily GitHub Actions workflow keeping the Supabase project from
  pausing on the free tier.

Total wall-clock time: ~15 minutes.

## 1. Create the Supabase project

1. Go to <https://supabase.com>, sign in (free tier is fine).
2. **New project**. Name it `nullpath`. Pick a region close to you
   (the database lives there; latency from Vercel's edge hits this
   region for every request).
3. Generate and **save** the database password. You won't need it for
   normal operation, but you'll want it if you ever connect with a
   `psql` client.
4. Wait ~2 minutes for the project to provision.

## 2. Apply the schema

1. **SQL Editor** → **New query**.
2. Copy the entire contents of
   `supabase/migrations/20260506120000_initial_schema.sql` from the
   nullpath repo and paste it in. Click **Run**.
3. Repeat for `supabase/migrations/20260506120100_functions.sql`.

You should see a green "Success" indicator after each. The schema
creates the `region`, `zone`, `node_def` tables (shared, read-only) and
the `user_*` tables (RLS-protected, one row per user per scope). The
functions migration adds the server-side compute layer (achievement
evaluation, streak counting, atomic node-completion).

If the second migration errors on `ALTER PUBLICATION supabase_realtime
ADD TABLE public.user_achievement` — that's optional; it only enables
realtime push for achievement unlocks. Comment that line out and re-run
if you don't want it.

## 3. Seed the skill graph

The `region` / `zone` / `node_def` tables are empty after step 2 — the
schema migration just creates the tables, it doesn't populate them.

You have two options:

### Option A — push the existing SQLite seed

`src/db/migrations/002_seed_web.sql` is the source-of-truth seed for
the skill graph. It's written for SQLite; it works mostly verbatim on
Postgres but you'll need to:

- Replace any SQLite-only syntax (rare in practice — this seed is just
  `INSERT INTO ...` statements).
- Adjust column lists if the Postgres schema diverges. The current
  schema uses `node_def` instead of `node`, so a literal copy won't
  work — the seed assumes `node`. The cleanest fix is to add `INSERT
INTO node_def` aliasing in a separate Postgres-flavored seed file.

### Option B — wait for the build:seed-cloud script

A future commit will add `npm run seed:build:cloud` that re-emits the
plan markdown into a Postgres-dialect seed. Until then, hand-translate
or copy your local IndexedDB rows up via the in-app first-sync flow.

(For the launch build, the maintainer is shipping option A as a
follow-up.)

## 4. Create the GitHub OAuth app

1. Go to <https://github.com/settings/developers> →
   **OAuth Apps** → **New OAuth App**.
2. **Application name**: `nullpath`.
3. **Homepage URL**: `https://nullpath-one.vercel.app`
   (or your custom domain).
4. **Authorization callback URL**:
   `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
   — the Supabase project URL with `/auth/v1/callback` appended.
5. **Register application**.
6. Copy the **Client ID**.
7. **Generate a new client secret**. Copy it immediately — you can't
   see it again.

For local development, register a second OAuth app pointing at
`http://localhost:1421` with callback
`https://<your-supabase-ref>.supabase.co/auth/v1/callback` (Supabase
handles both prod and dev origins from the same callback). Or reuse
the same OAuth app and add `http://localhost:1421` to the redirect
allowlist in Supabase (next step).

## 5. Wire GitHub into Supabase auth

1. Supabase Dashboard → **Authentication** → **Providers** → **GitHub**.
2. Toggle **Enable Sign in with GitHub** on.
3. Paste **Client ID** and **Client Secret** from step 4.
4. **Save**.
5. **Authentication → URL Configuration**:
   - **Site URL**: `https://nullpath-one.vercel.app`.
   - **Redirect URLs**: add `https://nullpath-one.vercel.app/**` and
     `http://localhost:1421/**` (the trailing `/**` is required — it
     authorizes any path under that origin, which Supabase needs to
     redirect back to wherever the user was).

## 6. Pull the publishable key

Supabase Dashboard → **Project Settings** → **API**.

- **Project URL**: `https://<ref>.supabase.co`. This goes into
  `VITE_SUPABASE_URL`.
- **anon / public key** (the `sb_publishable_...` one). This goes into
  `VITE_SUPABASE_ANON_KEY`. **Do not** use the `service_role` key — it
  bypasses RLS and would be a catastrophic leak if shipped to the
  browser.

## 7. Set Vercel env vars

Vercel Dashboard → your nullpath project → **Settings** →
**Environment Variables**:

| Name                     | Value                        | Environments        |
| ------------------------ | ---------------------------- | ------------------- |
| `VITE_SUPABASE_URL`      | `https://<ref>.supabase.co`  | Production, Preview |
| `VITE_SUPABASE_ANON_KEY` | the `sb_publishable_...` key | Production, Preview |

After setting these, **redeploy** (Deployments tab → ⋯ → Redeploy on
the latest production deployment). The build picks env vars at build
time, not at runtime, so a redeploy is required.

## 8. Set GitHub Actions secrets for keepalive

Repo → **Settings** → **Secrets and variables** → **Actions** → **New
repository secret**:

- `SUPABASE_URL` — same value as the env var above.
- `SUPABASE_ANON_KEY` — same value as the env var above.

The `.github/workflows/keepalive.yml` workflow runs daily at 03:17
UTC, hits the `region` table, and prevents Supabase from pausing the
project after 7 days of inactivity (free-tier policy).

You can manually trigger it once now from Actions → "Supabase
keepalive" → **Run workflow** to confirm it works.

## 9. First sign-in

Go to <https://nullpath-one.vercel.app>. The sign-in screen should
render. Click **Continue with GitHub**. After approving, you should
land back on the boot sequence and into the atlas. Settings → Account
should show your GitHub handle.

## Troubleshooting

- **"Sign-in failed: …redirect_uri…"**: the OAuth callback URL in
  GitHub doesn't match the Supabase callback URL. The GitHub side
  must be exactly
  `https://<your-supabase-ref>.supabase.co/auth/v1/callback`.
- **"Sign-in failed: invalid_client"**: client secret is wrong or was
  rotated. Regenerate in GitHub, paste into Supabase, save.
- **Sign-in completes but the app gets stuck on a black screen**:
  open DevTools → Network. Look for failed requests to your Supabase
  URL. If they're blocked by CSP, the `vercel.json` connect-src needs
  to include `https://*.supabase.co` and `wss://*.supabase.co` (it
  does, in the shipped config — but a custom build may have stripped
  them).
- **"row-level security policy violated"**: the auth trigger
  `on_auth_user_created` didn't run, so there's no `user_app_state`
  row for your user. Run this in SQL Editor:
  ```sql
  INSERT INTO public.user_app_state (user_id) VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;
  ```
  Then re-investigate why the trigger didn't fire (most often: the
  schema migration was applied but the trigger statement at the
  bottom got skipped).

## Cost ceiling

Free tier limits at the time of writing:

- **Vercel Hobby**: 100 GB/mo bandwidth. Plenty for a single-page app.
- **Supabase Free**: 500 MB database, 50,000 monthly active users.
- **GitHub OAuth**: free, unmetered.

If you blow past the 500 MB DB on a free Supabase project — which
would mean tens of thousands of users with mature node graphs and
notes — bump to the $25/mo Pro plan. Per-user data is small (a few
hundred kilobytes for an active operator), so this is unlikely.
