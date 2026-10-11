-- Dock Radar: an hourly rollup of station_snapshots.
--
-- One row per station, local date and local hour: how many snapshots, how many were empty
-- or full, and the average number of bikes. About 230 x 24 = 5.5k rows a day instead of
-- 66k snapshots, small enough to sync to PostHog's data warehouse (its free tier allows
-- 1M synced rows a month; station_snapshots alone would be about 2M) and to keep long after
-- old snapshots are deleted.
--
-- Filled nightly by the rollup-station-hourly cron job, for the previous local day.
-- rolled_up_at changes whenever a row is (re)written: it's the cursor for incremental syncs.

create table public.station_hourly (
  station_id     text not null references public.stations (id) on delete cascade,
  local_date     date not null,                                      -- in the network's time zone
  local_hour     smallint not null check (local_hour between 0 and 23),
  weekday        smallint not null check (weekday between 1 and 7),  -- ISO: 1 = Monday ... 7 = Sunday
  samples        int not null,
  empty_samples  int not null,           -- same definition of empty as station_profile
  full_samples   int not null,           -- same definition of full as station_profile
  avg_bikes      numeric(5,1) not null,
  rolled_up_at   timestamptz not null default now(),
  primary key (station_id, local_date, local_hour)
);

comment on table public.station_hourly is
  'Hourly rollup of station_snapshots per station and local hour. Filled nightly by rollup_station_hourly().';

-- Incremental syncs ask for "rows rolled up since the last sync".
create index station_hourly_rolled_up_at on public.station_hourly (rolled_up_at);

-- ---------------------------------------------------------------------------
-- Access: like the other open-data tables, anyone can read, nobody can write through the API
-- ---------------------------------------------------------------------------
alter table public.station_hourly enable row level security;

create policy "Hourly rollups are publicly readable"
  on public.station_hourly for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.station_hourly from anon, authenticated;
grant select on public.station_hourly to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rollup_station_hourly('2026-10-10') aggregates one local day and returns the number of rows written.
-- Running it again for the same day rewrites those rows (no duplicates).
-- On the autumn DST change, local hour 2 happens twice: both land in the same row.
-- ---------------------------------------------------------------------------
create or replace function public.rollup_station_hourly(
  p_date     date,
  p_timezone text default 'Europe/Paris'   -- the network's local time zone, as in station_profile
)
returns int
language sql
volatile
security invoker
set search_path = ''
as $$
  with rolled as (
    insert into public.station_hourly
      (station_id, local_date, local_hour, weekday, samples, empty_samples, full_samples, avg_bikes, rolled_up_at)
    select
      s.station_id,
      p_date,
      extract(hour from s.observed_at at time zone p_timezone)::smallint,
      extract(isodow from p_date)::smallint,
      count(*),
      -- Empty and full: keep these in sync with station_profile.
      count(*) filter (where s.bikes_available = 0 or not s.is_renting),
      count(*) filter (where s.docks_available = 0 or not s.is_returning),
      round(avg(s.bikes_available), 1),
      now()
    from public.station_snapshots s
    -- The local day as a UTC range, so the BRIN index on observed_at is used.
    where s.observed_at >= (p_date::timestamp at time zone p_timezone)
      and s.observed_at <  ((p_date + 1)::timestamp at time zone p_timezone)
    group by s.station_id, extract(hour from s.observed_at at time zone p_timezone)
    on conflict (station_id, local_date, local_hour) do update set
      weekday       = excluded.weekday,
      samples       = excluded.samples,
      empty_samples = excluded.empty_samples,
      full_samples  = excluded.full_samples,
      avg_bikes     = excluded.avg_bikes,
      rolled_up_at  = excluded.rolled_up_at
    returning 1
  )
  select count(*)::int from rolled;
$$;

comment on function public.rollup_station_hourly is
  'Rolls up one local day of station_snapshots into station_hourly. Returns the number of rows written.';

-- Only pg_cron (and the database owner) runs it.
revoke execute on function public.rollup_station_hourly from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: every past local day from the first snapshot to yesterday.
-- ---------------------------------------------------------------------------
select public.rollup_station_hourly(d::date)
from generate_series(
  (select min(observed_at) at time zone 'Europe/Paris' from public.station_snapshots)::date,
  (now() at time zone 'Europe/Paris')::date - 1,
  interval '1 day'
) as d;

-- ---------------------------------------------------------------------------
-- Nightly: yesterday, local time. 03:47 UTC is after midnight in Paris all year,
-- and off the 5-minute ingestion ticks and clean-cron-history (03:17).
-- ---------------------------------------------------------------------------
select cron.schedule(
  'rollup-station-hourly',
  '47 3 * * *',
  $$ select public.rollup_station_hourly((now() at time zone 'Europe/Paris')::date - 1); $$
);
