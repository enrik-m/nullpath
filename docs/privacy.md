# Privacy Policy

_Last updated: 2026-05-06._

This is the privacy policy for **nullpath**, a single-page web app
hosted at <https://nullpath-one.vercel.app>. This document is short on
purpose. The app does very little with your data, and this policy
mostly exists so you can confirm that.

## Who we are

Nullpath is operated by **Enrik Mustafa** (referred to as "we", "us"
below). Contact: **iceager@protonmail.com**.

If you are reading this from the open-source repo and running your own
self-hosted copy of nullpath, this policy doesn't bind you — replace
this file with your own before going live.

## What we collect

There are two ways to use nullpath:

1. **Local mode** (default for self-hosters). The app runs entirely in
   your browser. We don't see your data, don't have a server that talks
   to it, and have no way to reach in. Your progress lives in
   IndexedDB on the device you're using.
2. **Cloud mode** (the hosted nullpath-one.vercel.app build). You sign
   in with GitHub. Your progress, notes, resources, achievements, and
   bounty ledger entries are stored in our Postgres database
   (Supabase).

In cloud mode, we collect:

- **Your GitHub user ID** (a stable internal identifier) and your
  **GitHub login** (the public username you chose on GitHub). We use
  the user ID to scope data to your account; we display the login as
  your handle.
- **Your GitHub primary email address.** The OAuth flow we use grants
  read access to your email, and Supabase (our auth provider) stores
  it in the user record as part of how its authentication system
  identifies accounts. We don't display it anywhere in the app, don't
  send messages to it, and don't expose it to other users. If you'd
  rather we never see it, set your GitHub primary email to private in
  your GitHub settings before signing in.
- **Whatever you type into nullpath**: node completions, free-text
  notes, attached resource URLs and titles, bounty submissions,
  preferences, streak history. This is the data the product is built
  around — we couldn't sync it without storing it.
- **No IP address logging**, **no analytics**, **no advertising
  identifiers**, **no third-party trackers**. We do not run Google
  Analytics, Plausible, Sentry, PostHog, or any similar product against
  the app.

Vercel (our hosting provider) and Supabase (our database / auth
provider) keep their own operational logs, including IP addresses of
incoming requests, for limited retention windows. We don't read those
logs except to debug a specific incident, and we don't have a process
that exports them.

## What we don't collect

To make the negative space explicit:

- We don't read your GitHub repositories, organizations, gists,
  followers, or any other GitHub data beyond your user ID, login, and
  primary email. The OAuth scope we request is the default
  `read:user` + email — nothing that touches code, repos, or other
  people's data.
- We don't fingerprint your browser.
- We don't sell, rent, share, or syndicate any of your data to anyone.

## How we use your data

- **To run the product.** Your saved progress is fetched and displayed
  back to you. Your achievements are evaluated server-side against
  your row counts. That's the entire pipeline.
- **For incident response.** If something goes catastrophically wrong
  (e.g. a security breach, see below), we may need to inspect specific
  rows or operational logs to understand what happened.

## How long we keep it

As long as your account exists. **You can delete everything from
Settings → Account → Delete account** at any time, which wipes every
row associated with your user ID immediately. You can also revoke our
OAuth grant from <https://github.com/settings/applications>, which
prevents us from re-authenticating you but doesn't itself delete your
data — use the in-app delete for that.

## Where it lives

- **Vercel** — hosts the static site (United States / global edge
  network).
- **Supabase** — hosts the Postgres database and the auth service.
  Region: **eu-central-1**.

We don't transfer your data anywhere else. There are no other
sub-processors.

## Your rights

Depending on where you live (GDPR, CCPA, others), you may have rights
to access, correct, delete, or export your data, or to object to
processing. The in-app **Settings → Account** screen covers most of
these directly:

- **Access / portability**: Settings → Backup → Export backup gives
  you a JSON file containing every row attached to your account.
- **Deletion**: Settings → Account → Delete account.
- **Correction**: Edit any field through the normal UI.

If you need something the UI doesn't cover, email **iceager@protonmail.com**.

## Changes

We will update the "Last updated" date and post a notice on the home
page if we make material changes. The git history of this file is the
authoritative record of every revision.

## Contact

Email: **iceager@protonmail.com**.
