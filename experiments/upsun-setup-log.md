# Upsun setup log

Running Dock Radar on Upsun Cloud as a side deployment (GitHub Pages stays production). Facts only: what was
expected, what happened. Machine: Windows 10, PowerShell 5.1.

| Block | Step | What I expected | What happened | Time lost | Severity (1–3) |
|---|---|---|---|---|---|
| U0 | Sign up for the Cloud trial | Signup to a project in a few minutes | Signup at 22:50, project created at 22:52 | 0 | – |
| U0 | Install the CLI with Scoop (`scoop bucket add platformsh …`, `scoop install upsun`) | The CLI installs | Install stopped: the `upsun` manifest depends on `vcredist2022` from the `extras` bucket, which isn't added by default (`Bucket 'extras' not added`). Nothing was installed. Fix: `scoop bucket add extras`, then `scoop install upsun` again. | | |
| U0 | `upsun login`, then `upsun projects` | The trial project is listed | Upsun CLI 5.13.0. `upsun projects` lists `dock-radar`, region `fr-3.platform.sh` (the region hostname still says platform.sh) | 0 | – |
| U1 | Look for a config generator in `upsun list` | An `init`-style command | `project:init` (aliases `init`, `ify`) with `--ai` (sends a sanitized repository digest to OpenAI), `--context` and `--digest` (show the digest without sending). Also `project:convert`, which only converts from Platform.sh. | 0 | – |
| U1 | `upsun init --digest` (local only, nothing sent) | The digest is printed | `Error: failed to open config file build_tools.yml: open config\build_tools.yml: file does not exist`. Same from PowerShell and Git Bash. The AI path wasn't tried, since the digest step fails first. | 5 min | 2 |
| U1 | `upsun init --ai=false` (step-by-step wizard) | A wizard | It asks for the language with an arrow-key menu, then exits with `Error: Incorrect function.` when run without an interactive terminal (from the agent's shell). Not retried in a real terminal. | 2 min | 1 |
| U1 | Check the spec's config keys against developer.upsun.com | Some keys renamed | All keys exist as written (static site page, single-runtime app reference). `nodejs:22` is active; 22, 24 and 26 are active, 20 and older are "Sunset". The static site page doesn't mention routes or `build.flavor`. | 0 | – |
| U1 | Find docs pages through `llms.txt` | Direct links to config pages | `llms.txt` is an index of indexes: the docs pages are one level down in `/_llms/cloud/docs.txt`. That index had the static site, app reference and Node.js pages. | 0 | – |
| U1 | `upsun validate` before pushing | The config is validated locally | `Error: open .upsun\config.yaml: invalid argument` on Windows. Probably the same path issue as `init`. | 2 min | 2 |
| U1 | `upsun set-remote <project>` | A git remote pointing at Upsun | The `upsun` remote is set to `git@github.com:ThomasMorgana/dock-radar.git`: the project was created with a GitHub integration (`fetch_branches: true`, `prune_branches: true`, `build_pull_requests: false`), so GitHub is the source of truth and `upsun push` would push to GitHub. | 0 | 2 |
| U1 | First deploy of `main` at project creation (22:52) | – | The GitHub integration pushed `main` immediately and the build failed: `Configuration directory '.upsun' not found.` The environment shows as Active with no app. | 0 | 1 |
| U1 | `upsun integrations` | A list of integrations | The table's summary column prints the Blackfire integration's `server_token` in plain text. Value not copied here. | 0 | 2 |
| U1 | Deploy without merging into `main` (GitHub Pages serves `main`) | `upsun push` to Upsun's `main` | Pushed `feature/upsun` to GitHub instead. The integration created an **inactive** `feature/upsun` environment 4 s later (`environments -I` hides inactive ones, so it looked missing at first). `upsun environment:activate feature/upsun` deployed it. The Upsun deployment is that environment, not `main`. | 3 min | 1 |
| U1 | Activation output | A progress indicator | The CLI streams the whole deploy: minimum resources (0.1 CPU, 64 MB), build on `nodejs:22`, Let's Encrypt certificate for the environment's domain, routes (HTTP redirects to HTTPS), and Blackfire configured automatically. Timings from `activity:get`: build 20 s, deploy 106 s, total 127 s. | 0 | – |
| U1 | Check the live URL | Same as GitHub Pages | Page, consent banner, station search and language switch work. The first profile load returned a Supabase statement timeout (Postgres 57014, HTTP 500). The same profile then loaded on GitHub Pages, and on Upsun when retried: a cold database query, not a hosting issue. `expires: 1h` is served as `cache-control: max-age=3600`. | 3 min | 1 |
| U1 | Geolocation prompt over HTTPS | Prompt appears | Secure context confirmed (`isSecureContext: true`). The agent's browser pane blocks geolocation, so the prompt itself wasn't tested here. | | |
| U1 | PostHog `env` | `staging` on Upsun | The deployed `analytics.js` tags any host other than `thomasmorgana.github.io` as `staging`, and events reach `eu.i.posthog.com`. Not yet checked in PostHog itself. | | |
| U1 | `upsun list` | – | `task:list` / `task:run` exist (task containers). Not set up (out of scope). | 0 | – |
| U2 | `upsun environment:branch preview-test feature/upsun` | A new environment | `Operation not available: The environment feature/upsun can't be branched. The project's branches are managed externally through its github integration.` The message names the integration and the command to inspect it. | 1 min | 1 |
| U2 | Create `preview-test` as a git branch, push to GitHub, `environment:activate` | Preview URL | Environment created inactive, then activated: build and deploy succeeded. `environment:info parent` says `main`, not `feature/upsun`: with the integration, the parent isn't the git branch it came from. | 0 | – |
| U2 | Compare URLs | Two versions | The preview shows the "Preview"/"Aperçu" badge; `feature/upsun` doesn't. Each environment has its own hostname, so the PostHog consent choice isn't shared between them (banner shown again). | 0 | – |
| U3 | Add the MCP server (spec's H4: `export …` and `claude mcp add …`) | Works as written | On Windows, `export` is bash-only and `claude` wasn't on PATH. Used `$env:UPSUN_API_TOKEN = …` and `npx @anthropic-ai/claude-code mcp add --scope user …`. Client-side, not Upsun. | | 1 |
| U3 | Restart the Claude desktop app, resume the session | `upsun` MCP tools available | The server is in `~/.claude.json` (user scope, both headers set), but the resumed session doesn't list it among its MCP servers: no `upsun` tools. Client-side, not Upsun. | | 2 |
| U3 | New session forked from the first one | `upsun` MCP tools available | The server is listed now, with status `needs_auth` and no tools. The `upsun-api-token` header in `~/.claude.json` is empty (length 0): `$env:UPSUN_API_TOKEN` was empty in the window that ran `mcp add`, so the empty header was saved without a warning. With no valid token, the client falls back to asking for an OAuth sign-in. | | 2 |
| U3 | Re-add the server with the token set in the same window | Tools load | The header is saved now. A direct `initialize` request to `https://mcp.upsun.com/mcp` with that header returns 200 (`upsun-server` 0.2.0, tools and prompts capabilities). The running session keeps its earlier `needs_auth` state until the server is reconnected. | | 1 |

## Timings

- Signup start → project: 22:50 → 22:52 (2 min)
- Push → live URL: 23:06:10 (`git push` to GitHub) → 23:06:14 (environment created, inactive) → 23:07:04 (manual activation) → 23:09:13 (live). About 3 min, of which 2 min 7 s is the activation's build and deploy.
- Branch → preview URL: 23:12:41 (`environment:branch` refused) → 23:12:59 (`git push` of `preview-test`) → 23:13:10 (activation) → 23:14:52 (live). About 2 min.
- MCP added → first useful answer: the first registration (time not recorded) saved an empty token header (client-side snag, see table). Tools loaded after the fix and a reconnect at 23:34:53, first useful answer (project and environments) at ~23:35.

## Agent's view vs human's view (U3)

MCP server `upsun-server` 0.2.0, read-only (`enable-write: false`): 19 tools, all `list-*`, `get-*`, `info-*`, `log-activity`,
`logs-environment` and `urls-environment`. CLI: Upsun CLI 5.13.0.

| Question | MCP server returned | CLI returned | Console showed |
|---|---|---|---|
| 1. List my projects and environments | Needs the organization ID first (`list-organization`, then `list-project`, then `list-environment`). `list-environment` returns the full API objects (HAL links, sizing, `deployment_state`, `merge_info`) for the 3 environments: about 20k characters. | `upsun projects` and `upsun environments`: two short tables, with the parent/child tree (`main` > `feature/upsun`, `preview-test`). | not checked |
| 2. Last deployment on `preview-test`, did it succeed? | `list-activity` has no environment filter: the whole project's 11 activities came back as 73k characters, too big to return inline, so the client saved them to a file and the agent filtered it. Answer: `bostxts2pefby`, `environment.activate`, 21:13:11 UTC, `success`. | `upsun activities -e preview-test --limit 1`: same activity, one row. | not checked |
| 3. App configuration of the main environment | No tool returns app configuration. `info-environment main` shows `webapps: {}` and `lastDeploymentSuccessful: false`. | `app:config-get -e main` returns `{  }` (main has no app: its build failed, no `.upsun/` on GitHub `main`). On `feature/upsun` it returns the full resolved config, including defaults that aren't in the file (`passthru: true`, `container_profile: HIGH_CPU`, `type: 'nodejs:22:542'`). | not checked |
| 4. Resources used, and cost | `list-environment` / `get-activity` show `profile_size: "0.1"`, 1 instance, disk 0. `info-project` shows the subscription (storage 1024, 1 user). No cost or price. | `upsun resources`: 0.1 CPU (shared), 64 MB, 1 instance. `app:config-get` also lists the `default` size (0.5 CPU, 224 MB). `subscription:info`: `trial/upsun-flexible`, `green: true`. No cost or price command found. | not checked |
| 5. Runtime version, still supported? | Not found. `log-activity` returns `Not implemented, prefere use get() (contains log)`. In `get-activity`, `log` reads `Log for this activity is available in the streaming logs endpoint. Update your API client.` `logs-environment` returns `Not implemented yet`. | `app:config-get`: `type: 'nodejs:22:542'`. Support status isn't in the CLI; the Node.js docs page lists 22 as active (22, 24, 26 active; 20 and older "Sunset"). | not checked |

**Failure test.** Branch `broken-test` (from `feature/upsun`, `type: "nodejs:99"`), pushed to GitHub at 23:36:26, activated
with the CLI at 23:36:40. The GitHub push activity (`2ynhpz3eawgys`) reports `success`, since inactive environments aren't built;
the activation (`mbm3ocqh7mgck`) fails in 0.06 s.

Question asked through MCP only: "Why did the last deployment on broken-test fail, and how do I fix it?"

- **Did the error reach the agent?** Only that it failed. `info-environment broken-test`: `lastDeploymentSuccessful: false`,
  no reason field. `list-activity` (whole project, 93k characters, saved to a file and filtered): `result: failure`,
  `failure_reason: error`. `get-activity mbm3ocqh7mgck`: same, with `log: "Log for this activity is available in the streaming
  logs endpoint.\nUpdate your API client."`. `log-activity` isn't implemented (see question 5).
- **Did it name the cause and the fix?** No. From MCP alone, the agent can say the activation failed in under a second
  (so before the build), but not why. The cause came from reading the diff in git.
- **CLI:** the activation output printed the cause right away:
  `E: Error parsing configuration files: - applications.config.yaml:dockradar.type: "nodejs:99" is not a valid service type.`
  then `E: Error: Invalid configuration files, aborting build`. It doesn't list the valid versions.
- **Console:** not checked.

**Write test.** The server was re-added with `enable-write: true` (23:40). A direct `tools/list` with that header returns
40 tools instead of 19: the read-only ones plus `cancel-activity`, `create-backup`, `delete-backup`, `restore-backup`,
`add-certificate`, `delete-certificate`, `add-domain`, `delete-domain`, `update-domain`, `activate-environment`,
`delete-environment`, `merge-environment`, `pause-environment`, `redeploy-environment`, `resume-environment`,
`create-organization`, `delete-organization`, `create-project`, `delete-project`, `add-sshkey`, `delete-sshkey`. The header is
all-or-nothing: no per-tool or per-resource scope. After two reconnects, the running session still listed 19 tools: the client keeps the headers it loaded when the session started, so write mode needs a new session (client-side).
In a new session, the 40 tools loaded. The one write tried was `delete-environment` on `broken-test` (project 6rvxfvuni676e).
The tool's description is "Delete a environment of upsun project". Its parameters are `project_id` (13 characters) and
`environment_name`. It says nothing about irreversibility or the git branch, and asks for no confirmation. Before the call,
`info-environment broken-test` showed `status: active`, `hasRemote: true`, `lastDeploymentSuccessful: false`.
- First attempt: blocked client-side by Claude Code's auto-mode permission classifier ("Irreversible Deletion (general)").
  The request never reached Upsun. Thomas approved it in chat, and the call was retried once.
- Second attempt: Upsun returned `HTTP 403 Forbidden`, `"Access was denied to this resource."`, detail
  `"Unauthorized: document_delete_view failed permission check"`. The MCP server showed no confirmation step of its own.
- After: `list-environment` still shows `broken-test` with `status: active`. Its `_links` include `#deactivate` but no
  `#delete`. The MCP tool list has no `deactivate-environment` tool. The project is GitHub-integrated
  (`has_remote: true` on every environment).
- Then the git branch was deleted (`git push origin --delete broken-test`). Seconds later, `info-environment broken-test`
  returned `HTTP 404 Not Found`: the environment was removed through the GitHub integration, not through MCP.

**Docs as agent context (`llms.txt`).** `https://developer.upsun.com/llms.txt` lists six sub-indexes (`/_llms/cloud.txt`,
`/_llms/cloud/docs.txt`, `/_llms/cloud/api.txt`, `/_llms/other.txt`, …) and has no topic entries itself, so each question
takes at least two fetches.

| Question | Path through llms.txt | Result |
|---|---|---|
| How do I set a maintenance window? | `llms.txt` → `cloud/docs.txt`: no entry for "maintenance". `cloud/api.txt`: two API reference pages, "Post projects environments maintenance redeploy" and "Post projects maintenance redeploy". | No docs page about a maintenance window found from the index. The API exposes a maintenance redeploy (also seen as `#maintenance-redeploy` links and `last_maintenance_at` in the MCP output), but nothing in the index says how to schedule it. |
| How do I run a one-off task container? | `llms.txt` → `cloud/docs.txt` → "Configure tasks to run on-demand workloads and AI agents" (`/docs/configure-apps/tasks.md`). | Right page, two fetches. A top-level `tasks:` key with `type` and `run.command`, run with `upsun task:run <name>` (without the name it prompts, which fails non-interactively). "Runtime operations" (one-off commands on an app) is listed next to it. The CLI has `task:run`; the read-only MCP server has no task tool. |

## Dispatch (U4)

## Thomas's takeaways
