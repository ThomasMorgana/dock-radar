# Friction log : publishing and consuming Supabase integrations, agent-first

A marketplace has two sides : developers, and more and more their agents, publish integrations on one and consume them on the other. So I tried both, the way I build today : a coding agent (Claude Code) did the work, I made the decisions.

- Part 1, publishing : I built [Dock Radar](README.md), an open-source GBFS => Supabase integration, and tried to make it installable and listable.
- Part 2, consuming : I had a fresh agent pick an email provider from the [Supabase partner catalog](https://supabase.com/partners/catalog) and wire it into Dock Radar (email alerts through Resend).

Four fresh agents (no context from this study) were used as test subjects, and I checked every claim about third-party docs by hand. Agent work is fast, so minutes mostly measure how available I was. What I tracked instead is **blocking handoffs** : the steps where the agent stops until a person comes back.

## Summary

### Consumer side : top 3

1. **The catalog is invisible to agents, and it doesn't install anything.** Every text fetch in this study (mine and the four fresh agents') only got the heading "Partners building with Supabase", because listings are rendered in the browser. Only agents driving a real browser got them back. And once found, the three "Add integration" buttons I checked all link out to the partner's site. In practice, discovery happens through the agent's prior knowledge, web search and partner docs. (D2, F1, F2)
2. **The handoff that blocks the agent is always a secret key moved by hand**, one at a time : into Vault in part 1, into Edge Function secrets in part 2. Installs should provision secrets where they're needed, and integrations should declare their human steps up front (account, key, DNS) so the agent asks once instead of stopping five times. (H2, E1)
3. **Nothing enforces a quality bar on partner docs.** Across Resend's two Edge Function guides I found an open email relay, a hard-coded key and a CLI command that doesn't exist. Supabase's own guide gets it right. Agents copy samples as-is, so listings should point to recipes that pass automated checks. (F3)

### Publisher side : top 3

1. **There's no unit of distribution.** An integration is migrations, functions, secrets, schedules and human steps, and nothing packages them together. A manifest would help both sides : publishers ship one thing, agents install it end to end. (D4)
2. **Installing requires too much trust.** An OAuth installer needs arbitrary SQL and read access to every API key to wire up a 5-minute cron job. (D5)
3. **There's no place for community supply.** If an agent can build an integration in minutes, I think individual builders will end up being most of the supply, but the catalog is business-only. (D3)

What went well : Supabase's own developer experience. Current CLI templates, auth errors that explain themselves, `supabase db query --linked` and Markdown docs meant the agent rarely had to fight the platform, and registering an OAuth app takes two minutes. The friction is in the marketplace layer : discovery, install, trust and supply.

Severity in the tables below : 1 = minor, 2 = needed a workaround or a human, 3 = blocks agent-driven use.

---

## Part 1 : publishing Dock Radar

From an empty folder to production data every 5 minutes in under an hour. Finished and installable after about 3.5 hours, with about 30 minutes of my focused attention.

### Handoffs

7 in total. Most are fine one-time steps : creating the project, `supabase login`, the GitHub repo and Pages, registering the OAuth app. Two are worth fixing :

| # | Handoff | What I'd change |
|---|---|---|
| H1 | `supabase link` asks for the database password | After `login`, asking for it just to push migrations seems redundant. |
| H2 | Paste a secret key into Vault in the SQL editor, so pg_cron can call the ingestion function | This is the one that blocks agent-driven installs. Two options : let SQL call a project's own Edge Functions with built-in credentials, or let `config.toml` declare the secrets a project needs and have the platform provision them. |

### Frictions

| # | What happened | Severity | What I'd change |
|---|---|---|---|
| D1 | **The cron job fails silently.** It needs the project URL and a key, which can't go in a migration (H2). Until someone adds them, errors only show up in `cron.job_run_details` and `net._http_response`. | 2 | Warn in the dashboard when a cron job keeps failing. |
| D2 | **The catalog is empty as text.** `/partners/integrations` redirects to [`/partners/catalog`](https://supabase.com/partners/catalog), whose server HTML has one visible line : every listing sits in `<script>` data. Same thing on single listing pages. | 3 | Server-rendered listings, plus a machine-readable index (`llms.txt`, JSON or an MCP tool). |
| D3 | **No community tier.** Anyone can apply, but the [catalog criteria](https://supabase.com/docs/guides/integrations/supabase-marketplace) require a "business registration and bank account, meaningful revenue, or Venture Capital backing", plus legal policies. | 2 | A labelled Community tier : open-source licence, a working install, a maintainer contact, and "not supported by Supabase". |
| D4 | **No way to package it.** [database.dev](https://database.dev) only covers SQL. Installing takes a 5-step README across the CLI and the SQL editor, so I wrote [AGENTS.md](AGENTS.md) as a stopgap. | 2 | An integration manifest (migrations, functions, secrets, human steps) installable with one CLI command or an OAuth app. |
| D5 | **OAuth scopes are too broad.** Migrations and Vault need "Database: Write", which is arbitrary SQL. Reading a key for cron needs "Secrets: Read", which exposes every API key ([scopes](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes)). | 2 | Scopes like "apply migrations", "set function secrets" and "create one named key". |
| D6 | **Two Supabase guides disagree.** The [scheduling guide](https://supabase.com/docs/guides/functions/schedule-functions) sends the public key, the [function auth guide](https://supabase.com/docs/guides/functions/auth) recommends a secret key. | 1 | Align them. |

### Discovery test

Two fresh agents were asked to track bike-share availability in Bordeaux, checking for an existing integration first. Neither could read the catalog. One found Dock Radar through web search and GitHub (probably helped by clues on this machine), the other didn't and built its own. Both drafted the whole thing in a few minutes : what a listing can still bring is trust, maintenance and a hands-off install.

---

## Part 2 : consuming a catalog partner (Resend)

Run A (discovery only, in an empty folder) was asked to pick an email provider from the catalog. Run B (a new session in this repo, not allowed to read this file) built the feature : "email me the evening before if my station is usually empty at my departure time". Raw log : [experiments/email-alerts-log.md](experiments/email-alerts-log.md).

Run B took 75 minutes to the first production cron run. The agent was blocked for about 35 of them across 5 handoffs while I was working on something else, and real users will need one more (DNS).

### Handoffs

Besides clicking the confirmation email (by design) and merging to `main` (a hosting choice), three matter :

| # | Handoff | What I'd change |
|---|---|---|
| E1 | Create a Resend key and put it in function secrets, locally then in production | The catalog's OAuth connect already creates a Resend key for Auth SMTP. Let it also write `RESEND_API_KEY` into Edge Function secrets, for both environments. |
| E2 | Run `db push` on production : the agent's own safety check blocked it, and `db push` has no `--yes` flag it can pass after a dry run | Add a non-interactive confirm flag. |
| E3 | (still to do) Verify a sending domain (DNS) | Hard to remove, but worth declaring up front so it isn't discovered halfway. |

### Frictions

| # | What happened | Severity | What I'd change |
|---|---|---|---|
| F1 | **The catalog is empty as text, again.** Both runs only recovered by driving a browser. Guessed URLs failed (`/partners/catalog/postmark` is a 404, `?category=messaging` is ignored), and there's no "Email" category : senders are split between DevTools and Messaging. | 2 | Same as D2, plus stable URLs and categories by developer need ("send email"). |
| F2 | **"Add integration" installs nothing.** The three buttons I checked link out : to Resend's dashboard, Postmark's home page and AutoSend's signup. Resend's OAuth connect is real, but it only configures Auth SMTP. | 3 | Listings should say what they install, and installs should cover the common app use case, secrets included. |
| F3 | **Partner docs below the platform's bar.** Resend's two guides disagree. [One](https://resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase) hard-codes the key and uses a deprecated import. [The other](https://resend.com/docs/send-with-supabase-edge-functions) has no caller check, so deployed as-is it's an open email relay on your quota, and it tells you to run `supabase functions start`, which doesn't exist. [Supabase's own guide](https://supabase.com/docs/guides/functions/examples/send-emails) does it right. | 2 | Doc checks in the listing standards (caller auth, no hard-coded secrets, current imports, valid commands), run by a linter. Or point listings at the Supabase-maintained recipe. |
| F4 | **Edge Functions can't serve a small HTML page.** On `*.supabase.co`, `text/html` is rewritten to `text/plain`, so confirm and unsubscribe links have to go through the static front end. | 2 | Allow simple HTML responses, or document an "email link landing" pattern. |
| F5 | **`supabase start` stays silent** for about 10 minutes while pulling a new Postgres image. | 1 | Show download progress. |

Glue code : about 306 backend lines, mostly the feature itself. About 60 could have been removed by a better integration : a Resend client wrapper, the secret plumbing and the HTML workaround.
