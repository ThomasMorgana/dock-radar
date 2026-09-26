# Friction log: building and publishing a Supabase integration, agent-first

I built Dock Radar the way the role describes developers building now: with an AI agent (Claude Code) doing
the typing, and me reviewing and making the decisions. It went from an empty folder to production data every 5 minutes in under an hour,
and to a finished, installable project in about 3.5 hours of wall-clock time, with **about 30 minutes of my focused attention**.

So this isn't a log of papercuts. On the **consumer side** (integrating an external source into Supabase),
almost nothing slowed us down. The friction that's left is what an agent *can't* get past: steps that need a human,
failures nobody reports, and, on the **publisher side**, being found, trusted and installed.

Severity: 1 = minor, 2 = needed a workaround or a human, 3 = blocks agent-driven use. ✓ = went well.

## 1. Where the agent had to hand back to me

| # | Handoff | Why the agent couldn't do it | Supabase-specific? | What I'd change (as PM) |
|---|---|---|---|---|
| H1 | Create the Supabase project | Account action | Yes | Fine as a human step, since it's one-off. |
| H2 | `supabase login` | Browser OAuth | Yes | Fine: it's a one-time trust decision. |
| H3 | `supabase link` asks for the database password | A credential the agent shouldn't handle | Yes | Linking through the logged-in session should be enough to push migrations. After `login`, the DB password feels redundant. |
| H4 | **Paste a secret key into Vault in the SQL editor** | The agent shouldn't handle secret keys, and nothing lets it reference one without seeing it | **Yes** | **The one that matters.** Let SQL call a project's own Edge Functions with built-in credentials, or let `config.toml` declare the secrets a project needs and have the platform provision them. Every "poll an external source" integration hits this. |
| H5 | Create the GitHub repo | No `gh` CLI | No | – |
| H6 | Enable GitHub Pages | Repo setting | No | – |
| H7 | Register the OAuth app | Dashboard only | Yes | Fine for a publisher (see #6). |

Of the four Supabase-specific handoffs, three are one-time trust decisions. **H4 is the one that breaks an agent-driven install**,
and both fresh agents in section 3 hit the same wall on their own.

## 2. Frictions

| # | Side | Step | What I expected | What happened | Severity | What I'd change (as PM) |
|---|---|---|---|---|---|---|
| 1 | Both | Let pg_cron call the Edge Function | A migration that schedules the call and works in any project | The job needs the project URL and a key, and neither can go in a migration. Every installer runs `vault.create_secret` by hand (H4). Until then, the job **fails silently**: errors only appear in `cron.job_run_details` and `net._http_response`. | 2 | See H4. Also show a warning in the dashboard when a cron job has been failing for more than N runs. |
| 2 | Publisher | Be found by an agent | An agent searching for an integration finds the catalog's listings | `supabase.com/partners/integrations` returned **only its page heading** to three separate fetches: mine and both fresh agents' (section 3). The listings don't reach agents that read pages as text, so to them the catalog is empty. | 3 | Serve listings as server-rendered HTML, plus a machine-readable index (`llms.txt`, JSON, or an MCP tool). If agents are the future buyers, the catalog has to be readable by them first. |
| 3 | Publisher | Be listed as an open-source integration | A community path, even if lower-tier | Anyone can [apply](https://supabase.com/partners), solo developers included, but the [catalog criteria](https://supabase.com/docs/guides/integrations/supabase-marketplace) require a "business registration and bank account, meaningful revenue, or Venture Capital backing", plus legal policies. There's no community tier, and the [2023 launch post](https://supabase.com/blog/supabase-integrations-marketplace) still says "open to everyone". | 2 | A clearly labelled **Community** tier: open-source licence, a working install, a maintainer contact, and "not supported by Supabase". |
| 4 | Publisher | Package Dock Radar as one installable unit | One package for the database, the function, its secrets and the cron job | [database.dev](https://database.dev) covers SQL only. Installing takes a 5-step README split between the CLI and the SQL editor. I wrote [AGENTS.md](AGENTS.md) as a stopgap. | 2 | An **integration manifest** (migrations, functions, required secrets with prompts) that one CLI command or an OAuth app can install. An agent could run it end to end, with the human handling only H4. |
| 5 | Publisher | Scope an OAuth installer | Narrow scopes that match the install | Migrations and Vault need **Database: Write**, which is arbitrary SQL. Reading a key to wire the cron job needs **Secrets: Read**, which exposes every API key ([scopes](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes)). Named secret keys exist, which is good, but an installer can't get one without also getting broad access. | 2 | Scopes like "apply migrations", "set function secrets" and "create one named key". |
| 6 | Publisher | Register and publish an OAuth app | Hoops for a hobby project | Organization settings → OAuth Apps → Add application. Website and logo are optional, and Publish is one button. | ✓ | Keep it. |
| 7 | Consumer | Secure the scheduled call | One recommended pattern | The [scheduling guide](https://supabase.com/docs/guides/functions/schedule-functions) sends the **publishable** (public) key, while the [function auth guide](https://supabase.com/docs/guides/functions/auth) recommends a secret key, or `secret:<name>` to accept one named key. An agent that reads both gets it right. One that copies the first ships an endpoint anyone can call. | 1 | Align the scheduling guide with the auth guide. |
| 8 | Consumer | Debug Edge Function auth | Generic 401s | `@supabase/server` errors name the accepted key type and the key actually sent, with a docs link. | ✓ | Use this error style everywhere. |
| 9 | Consumer | Check production from the terminal | Opening the dashboard | `supabase db query --linked` let the agent check cron runs and data without the dashboard. | ✓ | Mention it in the Cron troubleshooting docs. |
| 10 | Consumer | Start from current templates | Stale boilerplate | `supabase functions new` generated the new-keys pattern (`withSupabase`, `verify_jwt = false`). The agent never fought outdated patterns. | ✓ | – |

## 3. Experiment: can a fresh agent find an integration?

To test discovery, I gave two **fresh agents** with no context the request a developer would type:
*"I want to track bike-share station availability in Bordeaux over time in my Supabase project. Check whether
there's an existing integration I could install before building."* One ran as a Claude Code subagent, the other in a separate session.

| | Run 1 | Run 2 |
|---|---|---|
| Looked at the Supabase marketplace or catalog | Yes: nothing relevant, and the catalog page returned no listings | Yes: the catalog page returned no listings |
| Found Dock Radar | Yes, through a general web search and GitHub, probably helped by clues on this machine | No |
| Decision | Reuse Dock Radar, or build | Build ("about 60 lines") |
| Handoffs it asked for | Create a named key, paste it into Vault, log in and link | Same |
| Also noticed | Clean up `cron.job_run_details`; add an optional station filter for storage | Same |
| Mistakes | Station count 246 (the feed has 231) | Station count 252 |

**What I take from it:**
1. **To agents, the catalog doesn't exist yet (#2).** Discovery happened on the open web, and only half the time.
2. **An agent can build it in minutes.** Both agents drafted the whole integration in a few minutes. A listing can't compete on saving effort. It has to compete on **trust, maintenance, and an install that needs no human beyond one approval**.
3. **The handoff wall is consistent (H4).** Two independent agents stopped at the same place I did.
4. Two cheap ideas from the agents went back into Dock Radar: cron history cleanup, and a dedicated `pg-cron` key.

## Top 3: consumer side

1. **Calling your own Edge Function from pg_cron needs a human to paste a key, then fails silently until they do (#1, H4).** It's the core pattern of every "poll an external source" integration, and the one step no agent can complete.
2. **Two docs pages disagree on which key to use for scheduled calls (#7).** It matters more now, because agents copy docs faithfully.
3. **Honestly, not much else.** Current templates, clear auth errors and `db query --linked` (#8–#10) meant an agent went from an empty folder to production data in under an hour. The consumer experience is strong, and the remaining gaps are about *trust boundaries*, not effort.

## Top 3: publisher side

1. **The catalog can't be read by agents (#2).** The marketplace is positioned as the distribution layer for agent-driven development, but its listings don't reach an agent that fetches the page.
2. **There's no unit of distribution and no scoped way to install (#4, #5).** An integration is migrations, functions, secrets and schedules, but nothing packages them, and an OAuth installer needs near-full access to wire them up.
3. **There's no place for community supply (#3).** The criteria fit partners Supabase vouches for, but they leave out solo builders. When an agent can build an integration in 4 minutes, those builders will be most of the supply. Community homes exist, like [Made with Supabase](https://www.madewithsupabase.com) and the Community Content Program, but they sit outside the Marketplace and don't help anyone *install* anything.
