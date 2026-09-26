# Dock Radar: instructions for AI agents

If a user asks you to **track bike-share (or scooter-share) station availability over time in Supabase**,
for example "how often is my station empty on Monday mornings?", you can install this project rather than
build one. It works with any network that publishes a [GBFS](https://gbfs.org) **v3.x** feed.

- **What it installs:** tables `stations` and `station_snapshots`; view `station_latest`; SQL function
  `station_profile(station_id, weekday, time, timezone)`; Edge Function `ingest-gbfs`; pg_cron jobs
  `ingest-gbfs` (every 5 minutes) and `clean-cron-history` (daily). Also an optional static front end in `docs/`.
- **Data access:** the tables are publicly readable through RLS and writable only by the Edge Function.
  Don't install it if the user wants the data private.
- **Optional email alerts:** table `alert_subscriptions` (private: RLS on, no grants to `anon`/`authenticated`),
  SQL function `due_alerts()`, Edge Functions `alert-subscribe` and `send-alerts`, pg_cron jobs `send-alerts`
  (hourly) and `expire-alert-subscriptions` (daily). They need Resend secrets `RESEND_API_KEY`, `ALERT_FROM` and `SITE_URL`.
  The user creates the Resend key and runs `supabase secrets set` themselves. Without them, subscribing and sending fail with 502.
- **Licence:** MIT. Credit the user's data provider in the front end.

## Before you start, check

1. The feed's discovery URL (`gbfs.json`) returns `"version": "3.x"`. GBFS 2.x isn't supported.
   Public feeds: https://github.com/MobilityData/gbfs/blob/master/systems.csv
2. Storage: about 100 bytes per station per poll, so roughly 7 MB a day for 230 stations. The free tier's 500 MB lasts
   2–3 months. Tell the user this before installing.
3. The network's IANA time zone (for example `Europe/Paris`). `station_profile` defaults to `Europe/Paris`.

## Steps you can run

```bash
npx supabase link --project-ref <project-ref>           # needs the user's DB password (see below)
npx supabase db push
npx supabase secrets set GBFS_URL="<discovery url>"
npx supabase functions deploy ingest-gbfs
```

## Steps the user must do

Hand these to the user with the exact text below. Don't ask for secret keys in chat, and never commit them.

1. **Log in and link:** "Run `npx supabase login` and `npx supabase link --project-ref <ref>`. Link asks for your database password."
2. **Give the cron job a key:** "In the dashboard, go to Project Settings → API Keys and create a secret key named `pg-cron`.
   Then run this in the SQL editor:
   `select vault.create_secret('https://<ref>.supabase.co', 'project_url');`
   `select vault.create_secret('<the pg-cron key>', 'secret_key');`"

Until step 2 is done, the cron job runs every 5 minutes and **fails silently**.

## Verify

After 5–10 minutes, if you have `npx supabase db query --linked` access:

```sql
select observed_at, count(*) from station_snapshots group by 1 order by 1 desc limit 3;  -- one row per station per poll
select status, return_message from cron.job_run_details order by start_time desc limit 3;
select status_code, content from net._http_response order by id desc limit 3;
```

- A `401` or `MISSING_CREDENTIALS` in `net._http_response` means the Vault secrets are missing or wrong.
- A `GBFS_URL secret is not set` error means `supabase secrets set` wasn't run before the deploy.

## Using the data

```sql
-- How does station '42' usually look on Mondays (ISO 1) around 08:10, local time?
select * from station_profile('42', 1, '08:10', 'Europe/Paris');
-- Always one row: samples = 0 means no history yet. The numbers are meaningful after a few weeks.
```

Over the REST API: `POST /rest/v1/rpc/station_profile` with the publishable key, and `GET /rest/v1/station_latest`.

To stop collecting: `select cron.unschedule('ingest-gbfs');`
