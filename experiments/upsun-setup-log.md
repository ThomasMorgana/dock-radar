# Upsun setup log

Running Dock Radar on Upsun Cloud as a side deployment (GitHub Pages stays production). Facts only: what was
expected, what happened. Machine: Windows 10, PowerShell 5.1.

| Block | Step | What I expected | What happened | Time lost | Severity (1–3) |
|---|---|---|---|---|---|
| U0 | Sign up for the Cloud trial | Signup to a project in a few minutes | Signup at 22:50, project created at 22:52 | 0 | – |
| U0 | Install the CLI with Scoop (`scoop bucket add platformsh …`, `scoop install upsun`) | The CLI installs | Install stopped: the `upsun` manifest depends on `vcredist2022` from the `extras` bucket, which isn't added by default (`Bucket 'extras' not added`). Nothing was installed. Fix: `scoop bucket add extras`, then `scoop install upsun` again. | | |
| U0 | `upsun login`, then `upsun projects` | The trial project is listed | Upsun CLI 5.13.0. `upsun projects` lists `dock-radar`, region `fr-3.platform.sh` (the region hostname still says platform.sh) | 0 | – |

## Timings

- Signup start → project: 22:50 → 22:52 (2 min)

## Agent's view vs human's view (U3)

## Dispatch (U4)

## Thomas's takeaways
