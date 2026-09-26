# Email alerts: integration log

Study: how easy is it for a coding agent to source and wire an email provider from the
[Supabase partner catalog](https://supabase.com/partners/catalog) into Dock Radar?
Kept as I go (times are UTC, from the shell clock). Agent: Claude Code (Opus 5.5).

## Timeline

| Time (UTC) | Milestone |
|---|---|
| 2026-09-26 20:47 | Session start, branch `feature/email-alerts` created, repo read (README, AGENTS.md) |
| 2026-09-26 20:50 | **Partner chosen: Resend** (after 5 catalog pages and 7 doc pages) |
| 2026-09-26 20:57 | Local stack up (after the silent image pull, F8). Migration and pgTAP tests pass (18/18). Both functions served locally. Every path works up to the Resend call, which fails cleanly (`RESEND_API_KEY secret is not set`, row rolled back, 502 shown on the page) |
| 2026-09-26 20:58 | Waiting on the user: Resend account and API key (H1) |
| 2026-09-26 21:02 | H1 done. Seeded 3 synthetic past Sundays of "empty at 08:10" for station 67, **local DB only** |
| 2026-09-26 21:03 | **First email sent locally**: subscribed from the page (station 67, Sunday 08:10). Resend accepted the confirmation email; the row is pending. A second request within 10 min: same reply, no email |
| 2026-09-26 21:05 | The user clicked the confirmation link in their real inbox; the page POSTed the token and the row is confirmed (H2) |
| 2026-09-26 21:06 | **First alert email sent locally** (`send-alerts` with `any_hour`): due 1, sent 1. A rerun sends 0 (`last_sent_on` set, plus the Idempotency-Key). A normal hourly run at 23:06 Paris time sends 0 (not 19:00). **Feature works end to end locally** |
| 2026-09-26 21:25 | The user approved deploying with the test sender (`onboarding@resend.dev`, only delivers to their address) and accepted that production verification stops at `due: 0`, since production has no Sunday history yet |
| 2026-09-26 21:30 | `alert-subscribe` and `send-alerts` deployed to production (functions before the migration, so the new cron never calls a missing function). Waiting on the user for production secrets (H3) |
| 2026-09-26 21:33 | H3 done (`RESEND_API_KEY`, `ALERT_FROM`, `SITE_URL` present). `db push --dry-run` shows only the new migration. My push was blocked by the agent's permission check, so it's handed to the user (H5) |

## 1. Discovery

URLs opened to choose and learn the integration, in order.

| # | URL | What I saw |
|---|---|---|
| 1 | https://supabase.com/partners/catalog | Client-rendered: plain-text extraction returned an **empty body**, so I had to read the accessibility tree / DOM. Cookie banner (I chose "Opt out"). There's no "Email" category. The categories are AI, API, App Templates, Auth, Caching, Data Platform, DevTools, FDW, Low-Code, Messaging, Observability, Security and Storage. |
| 2 | https://supabase.com/partners/catalog?q=email | Searching "email" gave 6 results: Resend (DevTools), AutoSend (DevTools), Gravatar (FDW, not a sender), Loops (Messaging, Auth emails only), OneSignal (Messaging) and Postmark (DevTools). Email senders are split across two categories. |
| 3 | https://supabase.com/partners/catalog/resend | The "Add integration" button goes to `resend.com/settings/integrations` (Resend's own dashboard, UTM-tagged). The overview is **only about Auth SMTP** (password resets, confirmations). One sentence says the same account can send transactional email through the Resend API. Three doc links, one of them "Send With Supabase Edge Functions". **Install path: a link out.** The only automated part (Resend → Supabase OAuth) configures Auth SMTP, which this feature doesn't need. |
| 4 | https://supabase.com/partners/catalog/postmark-by-activecampaign | "Add integration" goes to `postmarkapp.com/?utm_...` (the marketing home page). The overview says to paste SMTP credentials into Auth settings and claims "custom transactional messages triggered by your database events", with no link explaining how. **Only a link out.** |
| 5 | https://supabase.com/partners/catalog/autosend | "Add integration" goes to `autosend.com/signup`. The listing embeds a manual SMTP-for-Auth recipe (a table of host, port, user, password). **A copy-paste recipe, for Auth SMTP only.** Nothing for application email. |
| 6 | https://resend.com/docs/send-with-supabase-edge-functions.md | Resend's Edge Functions guide: `fetch` to `api.resend.com/emails`, key from `Deno.env`, `Deno.serve`. The function has **no auth** (`--no-verify-jwt`), so anyone with the URL can make it send. It says to run `supabase functions start`, which isn't a CLI command. |
| 7 | https://resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase.md | The listing's "Learn" link. It covers domain setup (DNS, "5–10 minutes"), the Auth integration (OAuth "Connect to Supabase"), and a second copy of the Edge Function guide that differs from #6: the API key is **hard-coded** in source (`'re_xxxxxxxxx'`), it imports the deprecated `deno.land/std@0.168.0` `serve`, and the text says "Resend Node.js SDK" while the code uses raw `fetch`. |
| 8 | https://supabase.com/docs/guides/functions/examples/send-emails.md | The official Supabase guide (the `.md` URL returns clean Markdown). Also Resend with raw `fetch`, but current: `withSupabase({ auth: ['user','secret'] })` from `@supabase/server`, key read from secrets, `apikey` header for the local test. It matches the pattern `ingest-gbfs` already uses, so **this is the one I followed**. Small gaps: it serves and deploys with `--no-verify-jwt` without saying why, and says to store the key "in your `.env` file" without saying where. |
| 9 | `npm pack @supabase/server@1.8.0` (README) | I needed the list of auth modes. `auth: 'publishable'` exists: a coarse "came from my own client" gate that uses the anon DB role, and CORS is handled for you. That's what a public subscribe endpoint needs. |
| 10 | https://supabase.com/docs/guides/functions/limits.md | Confirms that on the default domain, GET responses with `text/html` are rewritten to `text/plain` unless you set up a custom domain. So confirm/unsubscribe links can't open a page served by an Edge Function; they have to go through the static front end. |
| 11 | https://resend.com/docs/llms.txt, then `idempotency-keys.md`, `add-unsubscribe-to-transactional-emails.md`, `send-test-emails.md`, `account-quotas-and-limits.md` | `Idempotency-Key` header (kept 24 h), `List-Unsubscribe` header advice, the `delivered@resend.dev` test inbox, free tier of 100 emails/day and 3,000/month. The Resend docs have an `llms.txt` index and `.md` pages, which made them easy for an agent to read. |

**Why Resend:** of the five email senders in the catalog, it's the only listing that links to a guide for
sending *application* email from Edge Functions, and Supabase's own Edge Functions email guide also uses Resend.
The Postmark, AutoSend and Loops listings only document Auth SMTP. OneSignal is a push-first platform, too heavy for one alert email.

**Did the listing give an install path?** No. Every "Add integration" button is a UTM-tagged link to the partner's
site (dashboard, home page or signup). Resend has a real OAuth connect, but it only sets up Auth SMTP and doesn't
provision anything an Edge Function can use (no API key, no function secret). For this feature the path is:
create an account, create an API key, verify a domain, run `supabase secrets set`, then write the `fetch` call yourself.

## 2. Handoffs

| # | What I handed to the user | Why | Caused by |
|---|---|---|---|
| H1 | Create a Resend account and a sending-only API key, and put it in `supabase/functions/.env` for local testing | Needs an account and a secret | Partner, and Supabase: the catalog's OAuth connect provisions an SMTP key for Auth but won't put an API key into Edge Function secrets |
| H3 | Create a production Resend key and run `supabase secrets set --env-file supabase/functions/.env.production` | A secret, and the user's rule that they run `secrets set` themselves | Partner and Supabase (same cause as H1: nothing provisions the key into function secrets) |
| H5 | Run `supabase db push` on production | My auto-confirmed production push (`echo y \| supabase db push`) was blocked by the coding agent's own permission classifier, even though the user had approved the deploy. `db push` has no non-interactive `--yes` that an agent can pass after a dry run | Neither (agent safety policy). There's a small Supabase CLI angle: without an explicit `--yes`, agents have to pipe input to the prompt |
| H4 | Merge to `main` so GitHub Pages serves the form and the confirm/unsubscribe handling | The front end is static hosting outside Supabase; publishing is the user's call | Neither (this repo's hosting choice), made necessary by F7 |
| H2 | Click the confirmation link in the real inbox | Only the inbox owner can (that's the point of double opt-in), and it checks real delivery and rendering, not just "Resend returned 200" | Neither (by design) |

## 3. Frictions

| # | Tag | Expected | What happened | Severity (1-3) |
|---|---|---|---|---|
| F1 | Supabase | Catalog readable as text by an agent | Client-rendered page: text extraction returned an empty body, so I fell back to the DOM/accessibility tree | 2 |
| F2 | Supabase | An "Email" category | No such category. Senders are split between DevTools (Resend, Postmark, AutoSend) and Messaging (Loops, OneSignal); keyword search was the only way in | 1 |
| F3 | Supabase | "Add integration" installs something (OAuth connect that sets a function secret, or a template) | Every button is a link out. Resend's OAuth exists but only configures Auth SMTP; nothing lands in Edge Function secrets | 3 |
| F4 | docs (partner) | One canonical Resend + Edge Functions snippet | Two Resend pages disagree: one hard-codes the API key and uses a deprecated `std@0.168.0` import, the text says "Node.js SDK" while the code uses `fetch`, and it tells you to run `supabase functions start` (not a command) | 2 |
| F5 | docs (partner) | The sample function is safe to deploy | Resend's sample has no caller auth and is deployed with `--no-verify-jwt`. Copied as-is, it's an open email relay billed to your quota. (Supabase's own version fixes this with `withSupabase`.) | 2 |
| F6 | docs (Supabase) | The guide says where `.env` goes and why `--no-verify-jwt` is used | Neither is explained. I only knew because this repo already runs functions with `--env-file supabase/functions/.env` | 1 |
| F7 | Supabase | An email link can open a small "You're subscribed" page served by the function | GET `text/html` is rewritten to `text/plain` on `*.supabase.co`. Confirm and unsubscribe links go to the static front end, which POSTs to the function (more code, though it also defeats link-scanner prefetch) | 2 |
| F8 | Supabase | `supabase start` shows progress | It sat silently for ~10 minutes with no output and no containers. Rerunning with `--debug` showed it was pulling a new Postgres image (`17.6.1.166`). Not specific to the integration, but it cost the most wall-clock time so far | 2 |
| F9 | partner | A test mode that delivers anywhere, so I can test locally before any DNS work | Without a verified domain, `onboarding@resend.dev` only delivers to the Resend account owner's own address. That's fine for a local test (the user subscribes with their own address), but alerts to anyone else need DNS verification first | 1 |
| F11 | Supabase | Editing `.env` while `functions serve` runs reloads it | It does reload, but a half-saved `.env` (parse error "unexpected character 'r' in variable name") makes the whole `functions serve` process exit instead of keeping the last good config. It happened while the user was pasting the Resend key, so I had to restart the server | 1 |
| F12 | Supabase | `supabase db query "<multi-line SQL>"` works like psql | On Windows (Git Bash), a multi-line statement fails with a bare "syntax error at end of input". The same SQL on one line works. Only affected my test-data seeding | 1 |
| F10 | Supabase (positive) | — | `@supabase/server` error bodies are very agent-friendly: calling with the wrong key returns `INVALID_API_KEY` with a hint ("You sent a publishable key, but this endpoint only accepts secret keys…") and the accepted modes. PostgREST's 42501 on the private table says which GRANT is missing. No guessing needed | — |

## 4. Glue code

Total written for the feature: about **306 non-comment lines** of backend code (migration 78, `alert-subscribe` 100,
`send-alerts` 44, `_shared/resend.ts` 38, pgTAP 46), plus about 50 lines of front end and 20 of config (`config.toml`, `.env.example`).
Most of it is the feature itself: validation, `due_alerts()`, the send loop, tests. The glue a better integration could have removed:

| Glue | Lines | What would remove it |
|---|---|---|
| Resend client: `Email` type, `sendEmail()` with `fetch`, auth header, `Idempotency-Key`, error mapping (`_shared/resend.ts` L10-42) | ~30 | Both official guides use raw `fetch`, so each project writes this wrapper. A connect flow that injects the key plus a documented `npm:resend` snippet (`resend.emails.send(..., { idempotencyKey })`) would cut it to ~5 |
| Secret plumbing: `RESEND_API_KEY` check, `ALERT_FROM` default, 6 lines of `.env.example`, and H1 plus the later `supabase secrets set` | ~10 (plus 2 handoffs) | "Add integration" doing an OAuth connect that writes `RESEND_API_KEY` into the project's Edge Function secrets, as it already does for Auth SMTP credentials |
| HTML-rewrite workaround: `siteLink()`, `SITE_URL`, the front end's `handleEmailLink()`, and confirm/unsubscribe returning JSON for the page to render instead of a page (F7) | ~20 | Allowing simple `text/html` responses from functions on `*.supabase.co`, or a documented "email link landing" pattern |
| Double opt-in and unsubscribe tokens (`token`/`confirmed_at` columns, confirm/unsubscribe actions, cooldown, cap) | ~60 | Arguably the app's job: Resend's docs say it "doesn't manage contact lists for transactional emails". A provider-side double opt-in (Resend Audiences/Topics are for broadcasts) would remove most of it. I'm not counting it as pure glue |
| HTML escaping and inline email templates | ~10 | Resend templates or React Email. I didn't use them, to keep the feature small |

**Clearly removable: ~60 lines** (client, secrets, HTML workaround). **Arguably removable: another ~60** (subscription management).

## 5. Design decisions

**Collecting subscriptions without public writes: double opt-in through an Edge Function.**

- The new `alert_subscriptions` table has RLS enabled, **no policies**, and all privileges revoked from
  `anon`/`authenticated`. Only the service role (inside Edge Functions) touches it.
- The page calls the `alert-subscribe` Edge Function (`auth: 'publishable'`) with `{email, station, weekday, time}`.
  The function validates the input and stores the row as *pending*, with a random token, then sends a confirmation email through Resend.
- Nothing is ever emailed to a pending address except that one confirmation. The link carries the token back
  to the page, which POSTs it to the function to confirm. Every alert carries an unsubscribe link
  (and a `List-Unsubscribe` header) that works the same way.
- Why not Supabase Auth (magic link) plus RLS `auth.uid() = user_id`? That would work, but it adds sessions,
  redirect-URL config and Auth SMTP setup to the page, and it turns "open to anyone with an email" into
  a user table. Double opt-in gives the same guarantee (only the owner of the address can activate alerts)
  with one table and no grants to the public roles.
- Abuse limits: the same email can't request another confirmation within 10 minutes, a pending row expires,
  and the function always answers with the same generic message, so it can't be used to test which addresses are subscribed.

**Sending:** a second function `send-alerts` (`auth: 'secret'`, like `ingest-gbfs`) runs hourly from pg_cron.
It asks the SQL function `due_alerts()` for confirmed subscriptions where it's currently 19:00 in the network's time zone,
tomorrow is the subscribed weekday, and `station_profile` says the station is empty ≥ 50% of the time in that slot.
Each email gets an `Idempotency-Key` of `alert/<id>/<date>`, so a retried run can't double-send.
