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

## Timings

- Signup start → project: 22:50 → 22:52 (2 min)
- Push → live URL: 23:06:10 (`git push` to GitHub) → 23:06:14 (environment created, inactive) → 23:07:04 (manual activation) → 23:09:13 (live). About 3 min, of which 2 min 7 s is the activation's build and deploy.

## Agent's view vs human's view (U3)

## Dispatch (U4)

## Thomas's takeaways
