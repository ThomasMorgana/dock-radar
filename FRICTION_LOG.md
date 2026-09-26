# Friction log

Every snag I hit while building Dock Radar, on both sides:
**consumer** (integrating an external data source into Supabase) and
**publisher** (making it installable by others, listing it).

Severity: 1 = minor annoyance, 2 = cost real time or needed a workaround, 3 = blocker.

| # | Side | Step | What I expected | What happened | Time lost | Severity (1–3) | What I'd change (as PM) |
|---|---|---|---|---|---|---|---|
| 1 | Consumer | Setup: install the Supabase CLI on Windows | `npm i -g supabase`, like most JS dev tools | Global npm install isn't supported. The options are Scoop, a dev dependency, or `npx supabase`. I used `npx`. | | 1 | |

## Consumer side: top 3 frictions

*(to write at the end of the day)*

## Publisher side: top 3 frictions

*(to write at the end of the day)*
