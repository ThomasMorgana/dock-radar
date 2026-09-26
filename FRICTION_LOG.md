# Friction log: publishing and consuming Supabase integrations, agent-first

The role describes a marketplace that developers, and increasingly their agents, use from both sides.
So I did both, the way developers build now: a coding agent (Claude Code) did the work, and I made the decisions.

- **Part 1, publishing:** I built [Dock Radar](README.md), an open-source GBFS → Supabase integration, and tried to make it installable and listable.
- **Part 2, consuming:** I had a fresh agent source an email provider from the [Supabase partner catalog](https://supabase.com/partners/catalog) and wire it into Dock Radar (email alerts through Resend).

Four fresh agents (no context from this study) served as test subjects for discovery. Every claim below about third-party docs was checked by hand.

**How to read the numbers.** Agent work is fast, so minutes mostly measure how available the human is. The metric that matters is
**blocking handoffs**: steps where the agent stops until a person comes back. In agent-first work, that person has usually moved on to something else.

Severity: 1 = minor, 2 = needed a workaround or a human, 3 = blocks agent-driven use. ✓ = went well.

## Headline findings

1. **The catalog is empty to agents that read pages as text.** Every text fetch in this study (mine and all four fresh agents') got only the heading "Partners building with Supabase".
   The listings are drawn in the browser from `<script>` data, so the server HTML has none of them. Only agents driving a real browser recovered. ([D2](#part-1-frictions), [F1](#part-2-frictions))
2. **The catalog lists, but it doesn't install.** All three "Add integration" buttons checked (Resend, Postmark, AutoSend) link to the partner's site. The one real automation
   (Resend's OAuth connect) configures Auth SMTP, not the capability the app needed. ([F3](#part-2-frictions))
3. **The handoff that blocks agents is always a secret key moved by hand.** In part 1 it goes into Vault, so pg_cron can call the ingestion function. In part 2
   it goes into Edge Function secrets, so the functions can call Resend. **Installs should provision secrets where they're needed.** ([H4](#part-1-handoffs), [E1/E3](#part-2-handoffs))
4. **Handoffs arrive one at a time, so the agent stalls again and again.** Part 2 had 5 separate blocking handoffs. If an integration declared what it needs
   from a human up front (account, key, DNS, approvals), the agent could collect everything at once and then finish on its own.
5. **Nothing enforces a quality bar on partner docs.** Resend's two Edge Function guides disagree. One ships an open email relay, one hard-codes the key,
   and one uses a CLI command that doesn't exist. Supabase's own guide got it right. ([F4, F5](#part-2-frictions))
6. **Supabase's own developer experience is strong.** Current templates, self-explaining auth errors and Markdown docs meant the agent rarely
   fought the platform. The friction is in the marketplace layer: discovery, install, trust and supply.

---

## Part 1: publishing Dock Radar

From an empty folder to production data every 5 minutes in under an hour. Finished and installable in about 3.5 hours of wall-clock time,
with about 30 minutes of my focused attention. **7 handoffs.**

### Part 1 handoffs

| # | Handoff | Why the agent couldn't do it | Supabase-specific? | What I'd change (as PM) |
|---|---|---|---|---|
| H1 | Create the Supabase project | Account action | Yes | Fine: a one-time step. |
| H2 | `supabase login` | Browser OAuth | Yes | Fine: a one-time trust decision. |
| H3 | `supabase link` asks for the database password | A credential the agent shouldn't handle | Yes | After `login`, the DB password feels redundant for pushing migrations. |
| H4 | **Paste a secret key into Vault in the SQL editor** | The agent shouldn't handle secret keys, and nothing lets it reference one without seeing it | **Yes** | **The one that matters.** Let SQL call a project's own Edge Functions with built-in credentials, or let `config.toml` declare the secrets a project needs and have the platform provision them. |
| H5 | Create the GitHub repo | No `gh` CLI | No | – |
| H6 | Enable GitHub Pages | Repo setting | No | – |
| H7 | Register the OAuth app | Dashboard only | Yes | Fine for a publisher (D6). |

### Part 1 frictions

| # | Step | What I expected | What happened | Severity | What I'd change (as PM) |
|---|---|---|---|---|---|
| D1 | Let pg_cron call the Edge Function | A migration that schedules the call and works in any project | The job needs the project URL and a key, and neither can go in a migration (H4). Until someone adds them, the job **fails silently**: errors only appear in `cron.job_run_details` and `net._http_response`. | 2 | See H4. Also warn in the dashboard when a cron job keeps failing. |
| D2 | Be found by an agent | An agent searching the catalog finds listings | `/partners/integrations` permanently redirects (308) to [`/partners/catalog`](https://supabase.com/partners/catalog). Its server HTML has one visible line, and every listing (Stripe, Clerk, Resend…) sits in `<script>` data. The same happens on single listing pages: `/partners/catalog/resend` gives only its title as text. | 3 | Server-rendered listings, plus a machine-readable index (`llms.txt`, JSON, or an MCP tool). |
| D3 | Be listed as an open-source integration | A community path, even if lower-tier | Anyone can [apply](https://supabase.com/partners), but the [catalog criteria](https://supabase.com/docs/guides/integrations/supabase-marketplace) require a "business registration and bank account, meaningful revenue, or Venture Capital backing", plus legal policies. The [2023 launch post](https://supabase.com/blog/supabase-integrations-marketplace) still says "open to everyone". | 2 | A labelled **Community** tier: open-source licence, a working install, a maintainer contact, and "not supported by Supabase". |
| D4 | Package Dock Radar as one installable unit | One package for the database, functions, secrets and cron | [database.dev](https://database.dev) covers SQL only. Installing takes a 5-step README across the CLI and the SQL editor. I wrote [AGENTS.md](AGENTS.md) as a stopgap. | 2 | An **integration manifest**: migrations, functions, required secrets and human steps, installable by one CLI command or an OAuth app. |
| D5 | Scope an OAuth installer | Narrow scopes | Migrations and Vault need **Database: Write**, which is arbitrary SQL. Reading a key for cron needs **Secrets: Read**, which exposes every API key ([scopes](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes)). | 2 | Scopes like "apply migrations", "set function secrets" and "create one named key". |
| D6 | Register and publish an OAuth app | Hoops for a hobby project | Organization settings → OAuth Apps → Add application. Website and logo are optional, and Publish is one button. | ✓ | Keep it. |
| D7 | Secure the scheduled call | One recommended pattern | The [scheduling guide](https://supabase.com/docs/guides/functions/schedule-functions) sends the **publishable** (public) key, while the [function auth guide](https://supabase.com/docs/guides/functions/auth) recommends a secret key or `secret:<name>`. | 1 | Align the two guides. |
| D8 | Debug Edge Function auth | Generic 401s | `@supabase/server` errors name the accepted key type and the key actually sent. | ✓ | Use this error style everywhere. |
| D9 | Check production from the terminal | Opening the dashboard | `supabase db query --linked` let the agent check cron runs and data directly. | ✓ | Mention it in the Cron troubleshooting docs. |
| D10 | Start from current templates | Stale boilerplate | `supabase functions new` generated the new-keys pattern (`withSupabase`). | ✓ | – |

### Part 1 experiment: can a fresh agent find a community integration?

Two fresh agents got the request *"track bike-share availability in Bordeaux in my Supabase project; check for an existing integration before building."*

| | Run 1 (subagent) | Run 2 (separate session) |
|---|---|---|
| Catalog | Looked; no listings as text | Looked; no listings as text |
| Found Dock Radar | Yes, through a general web search and GitHub, probably helped by clues on this machine | No |
| Decision | Reuse, or build | Build ("about 60 lines") |
| Handoffs it asked for | Named key → Vault, login, link | Same |
| Mistakes | Station count 246 (real: 231) | Station count 252 |

Both agents drafted the whole integration in a few minutes. **A listing can't compete on saving effort. It competes on trust, maintenance and a hands-off install.**

---

## Part 2: consuming a catalog partner (Resend)

Two fresh runs. **Run A** (discovery only, in an empty folder) was asked to pick an email provider *from the catalog*.
**Run B** (a new session in this repo, told not to read this file) built the feature. It let a visitor subscribe to
"email me the evening before if my station is usually empty at my departure time".
Raw log: [experiments/email-alerts-log.md](experiments/email-alerts-log.md).

Run B went from start to the first production cron run in **75 minutes**. The agent was **blocked for about 35 minutes across 5 handoffs**
while I worked on something else. Another 10 minutes went to a silent image download (F8). Real users will need **one more handoff, DNS domain verification**,
because Resend's test sender only delivers to the account owner.

### Part 2 handoffs

| # | Handoff | Caused by | What I'd change (as PM) |
|---|---|---|---|
| E1 | Create a Resend account and a sending key, and put it in the local `.env` | Partner, and Supabase: nothing moves the key into function secrets | The catalog's OAuth connect already creates a Resend key for Auth SMTP. Let it also write `RESEND_API_KEY` into Edge Function secrets. |
| E2 | Click the confirmation link in my inbox | By design (double opt-in) | – |
| E3 | Create a production key and run `supabase secrets set` | Same as E1 | Same as E1: one connect, both environments. |
| E4 | Merge to `main` so the static page gets the form | Hosting choice, made necessary by F7 | – |
| E5 | Run `db push` on production | The agent's own safety check blocked it. `db push` has no `--yes` flag an agent can pass after a dry run. | Add a non-interactive confirm flag. |
| E6 | *(still to do)* Verify a sending domain (DNS) | Partner | Hard to remove. Worth declaring up front, so it isn't discovered halfway. |

### Part 2 frictions

| # | Tag | What I expected | What happened | Severity | What I'd change (as PM) |
|---|---|---|---|---|---|
| F1 | Supabase | The catalog readable as text | Empty as text in both runs. Both recovered only by driving a browser (the DOM or accessibility tree). Guessed URLs failed: `/partners/catalog/postmark` returned a 404 (the real slug is `postmark-by-activecampaign`), and `?category=messaging` was ignored. | 2 | Same as D2, plus stable, documented URLs and filters. |
| F2 | Supabase | An "Email" category | None. Senders are split between DevTools and Messaging, and search matches keywords (Gravatar shows up for "email"). | 1 | Categories by developer need ("send email"), not by vendor type. |
| F3 | Supabase | "Add integration" installs something | All three buttons checked link out: to Resend's dashboard, Postmark's home page and AutoSend's signup. Resend's OAuth connect is real, but it only configures Auth SMTP. Postmark, AutoSend and Loops only document Auth SMTP. | **3** | Listings should say *what* they install, and installs should cover the common app use case, including secrets. |
| F4 | Partner docs | One canonical Resend + Edge Functions snippet | Two Resend guides disagree. [One](https://resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase) hard-codes `'re_xxxxxxxxx'`, imports the deprecated `std@0.168.0` `serve`, and says "Node.js SDK" while using `fetch`. [The other](https://resend.com/docs/send-with-supabase-edge-functions) tells you to run `supabase functions start`, which isn't a CLI command. | 2 | Listing standards should include **doc checks**: current imports, no hard-coded secrets, valid commands. That's a job for an automated linter, not a reviewer. |
| F5 | Partner docs | A sample function that's safe to deploy | Resend's sample has no caller check and is served with `--no-verify-jwt`. Copied as-is, it's an **open email relay** on your quota. [Supabase's own guide](https://supabase.com/docs/guides/functions/examples/send-emails) does it right with `withSupabase`. | 2 | Point listings at the Supabase-maintained recipe, or require partner samples to pass the same bar. |
| F6 | Supabase docs | The guide says where `.env` goes and why `--no-verify-jwt` is used | Neither is explained. | 1 | Two sentences in the guide. |
| F7 | Supabase | An email link opens a small "You're subscribed" page served by the function | On `*.supabase.co`, `text/html` responses are rewritten to `text/plain`. The confirm and unsubscribe links go through the static front end instead, about 20 extra lines. | 2 | Allow simple HTML responses, or document a standard "email link landing" pattern. |
| F8 | Supabase CLI | `supabase start` shows progress | About 10 minutes of silence while it pulled a new Postgres image. | 2 | Show progress for image downloads. |
| F9 | Partner | A test mode that delivers anywhere | Without a verified domain, the test sender only delivers to the account owner. That's fine for testing, but DNS is needed before real users. | 1 | – |
| F11 | Supabase CLI | A half-saved `.env` doesn't take the server down | `functions serve` exits on an `.env` parse error instead of keeping the last good config. | 1 | Keep the last good config and log the error. |
| F10 | Supabase | – | `@supabase/server` errors (`INVALID_API_KEY` with a hint) and PostgREST's 42501 on the private table told the agent exactly what was wrong. | ✓ | – |
| F13 | Docs | – | Supabase docs serve clean `.md` pages, and Resend publishes an `llms.txt`. Both were easy for the agent to read. The catalog is the part of the funnel that isn't. | ✓ | Bring the catalog up to the docs' standard. |

**Glue code:** about 306 backend lines, most of them the feature itself. **About 60 were clearly removable:** a Resend client wrapper (~30),
secret plumbing (~10) and the HTML workaround (~20). About 60 more arguably were: double opt-in and unsubscribe handling, which Resend leaves to the app for transactional email.

---

## Top 3: consumer side (finding and wiring an integration)

1. **Agents can't read the catalog, and when they do, it doesn't install anything (D2, F1, F3).** In practice, discovery happens in the agent's
   prior knowledge, web search and partner docs. The catalog is skipped, and the "Add integration" button leads out of Supabase.
2. **Secrets are moved by hand, one handoff at a time (H4, E1, E3).** Every integration that needs a key blocks the agent.
   A connect flow that writes secrets where they're needed, and a way to declare the human steps up front, would turn five stalls into one approval.
3. **Nothing guarantees partner recipes meet the platform's bar (F4, F5).** Agents copy docs faithfully, so an insecure sample becomes an insecure deploy.
   Supabase's own recipe was the good one. Listings should point to recipes that pass automated checks.

## Top 3: publisher side (making an integration installable and listable)

1. **There's no unit of distribution (D4).** An integration is migrations, functions, secrets, schedules and human steps, but nothing packages them.
   A manifest would serve both sides: publishers ship one thing, and agents install it end to end.
2. **Installing takes too much trust (D5).** An OAuth installer needs arbitrary SQL and read access to every API key to wire up a 5-minute cron job.
3. **There's no place for community supply (D3).** When an agent can build an integration in minutes, individual builders will be most of the supply.
   Today they have the community showcases ([Made with Supabase](https://www.madewithsupabase.com), the Community Content Program), but nothing that helps anyone *install* their work.

What went well, and is worth protecting: registering an OAuth app (D6), current CLI templates (D10), and error messages written so an agent can act on them (D8, F10).
