# Launch checklist — cloud mode

A short, ordered list of everything you need to do **before flipping
the hosted nullpath build into cloud mode**. Most of it is provisioning;
a few items are content placeholders that need real values.

This file lives at the repo root on purpose so it's hard to miss. Once
every box below is checked, you can delete the file (or move it under
`docs/archive/`).

## 0. Rotate the credentials shared in chat

Three secrets were pasted into a previous chat transcript and should
be considered burned:

- [ ] **Supabase database password** — Supabase Dashboard → Project
      Settings → Database → **Reset database password**.
- [ ] **GitHub OAuth client secret** — github.com/settings/developers
      → your nullpath OAuth app → **Generate a new client secret**.
      Paste the new value into Supabase Dashboard → Authentication
      → Providers → GitHub.
- [ ] **Supabase publishable / anon key** — Supabase Dashboard →
      Project Settings → API → **Reset anon key**. Copy the new value
      into Vercel env (`VITE_SUPABASE_ANON_KEY`).

## 1. Provision the Supabase project

Walk through `docs/setup-auth.md` end to end. The short version:

- [ ] Create the Supabase project.
- [ ] In SQL Editor, apply migrations in order:
      `20260506120000_initial_schema.sql`,
      `20260506120100_functions.sql`,
      `20260506120200_seed_web.sql`.
- [ ] Confirm: `select count(*) from public.node_def;` returns **820**.
- [ ] Confirm: `select count(*) from public.zone;` returns **23**.
- [ ] Confirm: `select count(*) from public.region;` returns **3**.

## 2. GitHub OAuth app

- [ ] Create the OAuth app (homepage = your hosted URL, callback =
      `https://<ref>.supabase.co/auth/v1/callback`).
- [ ] Paste client_id + client_secret into Supabase →
      Authentication → Providers → GitHub.
- [ ] In Supabase → Authentication → URL Configuration, set Site URL
      to `https://nullpath-one.vercel.app` (or your custom domain) and
      add `http://localhost:1421/**` to Redirect URLs.

## 3. Vercel env vars

- [ ] `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
- [ ] `VITE_SUPABASE_ANON_KEY` = the (rotated) anon key
- [ ] Redeploy the production deployment so the new env vars take effect.

## 4. GitHub Actions secrets

For the daily Supabase keepalive workflow:

- [ ] Repo → Settings → Secrets → Actions: add `SUPABASE_URL`.
- [ ] Same: add `SUPABASE_ANON_KEY`.
- [ ] Run "Supabase keepalive" once manually to confirm the curl works.

## 5. Privacy / Terms placeholders

The following bracket markers still appear in the legal docs and need
real values before you ship the URL publicly:

- [ ] `[country]` in `docs/terms.md` and `public/terms.html` — pick
      the jurisdiction whose laws govern the agreement and where any
      dispute would be heard. This is legally significant; use the
      country of your primary residence (or the country where you'd
      register a business if you formalized one). Search-replace the
      three occurrences in each file.

The other placeholders (`[legal-name]`, `[contact-email]`,
`[supabase-region]`) were already substituted with sensible defaults
(`Enrik Mustafa`, `iceager@protonmail.com`, `us-east-1`). Override any
that don't match your reality.

## 6. First-sync sanity test

- [ ] On a clean browser profile, open the deployed URL.
- [ ] Hit the sign-in screen, click **Continue with GitHub**, complete
      the OAuth round-trip.
- [ ] Land on BootView → Atlas. Settings → Account should show your
      GitHub handle.
- [ ] Mark a node complete. Confirm: - The XP toast appears. - The streak counter increments. - In Supabase Table Editor, a row in `user_node_state` exists
      for your user.
- [ ] Sign out, sign in on a second browser, confirm the same node is
      still complete (proves cloud sync works end-to-end).

## 7. Optional: delete-account Edge Function

The in-app **Settings → Account → Delete account** clears every
per-user row immediately via `reset_all_progress`. The `auth.users`
row itself isn't deleted — for a true "right to erasure" path, you
need a Supabase Edge Function that calls
`auth.admin.deleteUser(user.id)` from the server.

- [ ] (Optional) Deploy a small Edge Function:
      `ts
    // supabase/functions/delete-account/index.ts
    import { createClient } from "@supabase/supabase-js";
    Deno.serve(async (req) => {
      const auth = req.headers.get("Authorization");
      if (!auth) return new Response("missing auth", { status: 401 });
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
      if (!user) return new Response("invalid token", { status: 401 });
      await sb.auth.admin.deleteUser(user.id);
      return new Response("deleted");
    });
    `
- [ ] (Optional) Deploy: `supabase functions deploy delete-account`.
- [ ] (Optional) Wire the in-app delete button to call the function
      after `reset_all_progress`.

This is genuinely optional — if a user wants the auth row gone they
can also just revoke the OAuth grant on github.com/settings/applications
and never sign in again, which leaves a stub auth row but zero per-user
data behind it.
