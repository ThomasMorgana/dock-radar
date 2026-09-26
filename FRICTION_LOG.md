# Friction log

Every snag I hit while building Dock Radar, on both sides:
**consumer** (integrating an external data source into Supabase) and
**publisher** (making it installable by others, listing it).

Severity: 1 = minor annoyance, 2 = cost real time or needed a workaround, 3 = blocker.

| # | Side | Step | What I expected | What happened | Time lost | Severity (1–3) | What I'd change (as PM) |
|---|---|---|---|---|---|---|---|
| 1 | Consumer | Setup: install the Supabase CLI on Windows | `npm i -g supabase`, like most JS dev tools | Global npm install isn't supported. The options are Scoop, a dev dependency, or `npx supabase`. I used `npx`. | | 1 | |
| 2 | Consumer | Test the migration locally | Apply and check the schema locally without extra tooling | `supabase start` needs Docker running, plus a multi-GB image download on the first run | | 1 | |
| 3 | Publisher | Make the cron job installable | Ship the schedule as a migration that works in any project | The job needs the project URL and secret key, which can't go in a migration. Every installer has to run `vault.create_secret` by hand after `db push`. There's no install-time parameter to prompt for them. | | 2 | |
| 4 | Publisher | Find where an open-source integration can be listed | A path for community integrations, even if it's separate or lower-tier | Anyone can apply to the [partner program](https://supabase.com/partners), solo developers included. But the program is built for companies, and the [Partner Catalog requirements](https://supabase.com/docs/guides/integrations/supabase-marketplace) ask for "official business registration and bank account, meaningful revenue, or Venture Capital backing", plus Terms and Conditions, a Privacy Policy and an Acceptable Use Policy. There's no community tier in the catalog. | | 2 | |
| 5 | Publisher | Understand who the marketplace is for | One consistent story across the docs | The [2023 launch post](https://supabase.com/blog/supabase-integrations-marketplace) calls the marketplace "open to everyone". The current catalog criteria are business-only. | | 1 | |
| 7 | Publisher | Register and publish an OAuth app | A form with hoops for a hobby project | **Smooth.** Organization settings → OAuth Apps → Add application. Website and logo are optional, and Publish is one button at the bottom. | 0 | – | Keep it this simple |
| 8 | Publisher | Choose the OAuth scopes for a Dock Radar installer | Narrow scopes that match what the installer does | Applying migrations and creating Vault secrets need **Database: Write**, which is arbitrary SQL. Wiring the cron job needs **Secrets: Read**, which exposes all of the project's API keys, secret key included. A small integration has to ask for near-full trust ([scopes](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes)). | | 2 | |
| 6 | Publisher | Package Dock Radar as one installable unit | A single package that covers the database, the function, its secrets and the cron job | [database.dev](https://database.dev) packages Postgres SQL, but it doesn't cover Edge Functions, function secrets or Vault setup. Installing takes a 5-step README across the CLI and the SQL editor. | | 2 | |

## Consumer side: top 3 frictions

*(to write at the end of the day)*

## Publisher side: top 3 frictions

*(to write at the end of the day)*
