-- Dock Radar: "email me the evening before if my station is usually empty at my departure time".
--
-- alert_subscriptions  one row per (email, station, weekday, departure time), double opt-in
-- due_alerts()         the subscriptions to email right now, with tomorrow's usual availability
--
-- Nobody can read or write subscriptions through the public API: RLS is on with no policies,
-- and the public roles have no privileges. The alert-subscribe and send-alerts Edge Functions
-- use the service role. Email addresses are personal data, unlike the open station data.

create table public.alert_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  station_id    text not null references public.stations (id) on delete cascade,
  weekday       smallint not null check (weekday between 1 and 7),  -- ISO: 1 = Monday
  depart_time   time not null,
  timezone      text not null default 'Europe/Paris',               -- the network's time zone
  token         uuid not null unique default gen_random_uuid(),     -- secret in confirm/unsubscribe links
  created_at    timestamptz not null default now(),                 -- last confirmation email sent
  confirmed_at  timestamptz,                                        -- null = pending, never emailed alerts
  last_sent_on  date,                                               -- local date of the last alert
  unique (email, station_id, weekday, depart_time)
);

comment on table public.alert_subscriptions is
  'Email alert subscriptions (double opt-in). Private: only Edge Functions can access them.';

alter table public.alert_subscriptions enable row level security;
revoke all on public.alert_subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- due_alerts: who gets an email now?
-- ---------------------------------------------------------------------------
-- A confirmed subscription is due when, in its time zone, it's p_hour o'clock, tomorrow is its
-- weekday, it hasn't been emailed today, and station_profile says the station was empty at
-- least p_min_pct_empty % of the time in that slot. p_hour = null skips the hour check (for tests).

create or replace function public.due_alerts(
  p_hour           int     default 19,
  p_min_pct_empty  numeric default 50
)
returns table (
  id             uuid,
  email          text,
  token          uuid,
  station_name   text,
  weekday        smallint,
  depart_time    time,
  local_date     date,
  days_observed  int,
  avg_bikes      numeric,
  pct_empty      numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.email, a.token, s.name, a.weekday, a.depart_time,
         (now() at time zone a.timezone)::date,
         p.days_observed, p.avg_bikes, p.pct_empty
  from public.alert_subscriptions a
  join public.stations s on s.id = a.station_id
  cross join lateral public.station_profile(a.station_id, a.weekday, a.depart_time, a.timezone) p
  where a.confirmed_at is not null
    and a.weekday = extract(isodow from (now() at time zone a.timezone) + interval '1 day')
    and (p_hour is null or extract(hour from now() at time zone a.timezone) = p_hour)
    and a.last_sent_on is distinct from (now() at time zone a.timezone)::date
    and p.samples > 0
    and p.pct_empty >= p_min_pct_empty;
$$;

comment on function public.due_alerts is
  'Confirmed alert subscriptions to email now: tomorrow is their weekday and the station is usually empty.';

revoke execute on function public.due_alerts from public, anon, authenticated;
grant  execute on function public.due_alerts to service_role;

-- ---------------------------------------------------------------------------
-- Schedule: check hourly (each subscription's own 19:00), expire unconfirmed rows daily
-- ---------------------------------------------------------------------------
-- Same Vault secrets as the ingest-gbfs job (see the schedule_ingestion migration).

select cron.schedule(
  'send-alerts',
  '2 * * * *',   -- a couple of minutes past each hour, off the 5-minute ingestion ticks
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')
    ),
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'expire-alert-subscriptions',
  '23 3 * * *',
  $$
  delete from public.alert_subscriptions
  where confirmed_at is null and created_at < now() - interval '2 days';
  $$
);
