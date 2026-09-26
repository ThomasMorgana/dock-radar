# Dock Radar

**Will there be a bike at my station when I leave?**

Bike-share apps show the live count. Dock Radar records every station's availability every few minutes
in Supabase and tells you how your station *usually* looks at this time on this day of the week:

> Monday 8:15, Chartrons: empty 40% of the time. Leave 5 minutes earlier or head to Jardin Public.

It works with any bike-share network that publishes a [GBFS v3](https://gbfs.org) feed.
The first feed is TBM Le Vélo in Bordeaux.

> **Status:** work in progress. Profiles need history. On day one there are only a few hours of data,
> and the "usually" numbers become meaningful after a week or two of collection.

## How it works

```
GBFS feed ──► Edge Function `ingest-gbfs` ──► Postgres (stations, station_snapshots)
                 ▲ every 5 min                        │
             pg_cron + pg_net                          ▼
                                     station_profile() ──► static page (supabase-js)
```

- **Postgres:** `stations` and `station_snapshots` tables, with RLS set to public read and no public write
- **Edge Function:** fetches the GBFS feeds and upserts stations and snapshots *(coming next)*
- **pg_cron + pg_net:** call the function every 5 minutes *(coming next)*
- **SQL function** `station_profile(station_id, weekday, time)`: average bikes, plus % of time empty or full *(planned)*
- **Front end:** one static HTML page on GitHub Pages *(planned)*

## Install in your own Supabase project

*(Coming soon: migrations, `supabase functions deploy`, and setting your city's GBFS URL.)*

## Friction log

Building this doubled as a test of the Supabase integration and publisher experience.
See [FRICTION_LOG.md](FRICTION_LOG.md).

## Data & attribution

Station data: **Bordeaux Métropole / TBM**, open data under the
[Licence Ouverte / Open Licence](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).

## License

[MIT](LICENSE) © ThomasMorgana
