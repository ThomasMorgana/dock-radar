-- Dock Radar: core tables.
--
-- stations           one row per dock station, refreshed from GBFS station_information
-- station_snapshots  one row per station per poll, from GBFS station_status (append-only)
--
-- Both tables are publicly readable (the data is open data) and only writable
-- by the ingestion Edge Function, which uses the service_role key and bypasses RLS.

-- ---------------------------------------------------------------------------
-- stations
-- ---------------------------------------------------------------------------
create table public.stations (
  id          text primary key,              -- GBFS station_id (a string in the spec)
  name        text not null,                 -- GBFS 3.0 names are localized; we keep the first entry
  lat         double precision not null,
  lon         double precision not null,
  capacity    integer check (capacity >= 0), -- optional in GBFS
  updated_at  timestamptz not null default now()
);

comment on table public.stations is
  'Bike-share stations, upserted from the GBFS station_information feed.';

-- ---------------------------------------------------------------------------
-- station_snapshots
-- ---------------------------------------------------------------------------
create table public.station_snapshots (
  station_id        text not null references public.stations (id) on delete cascade,
  observed_at       timestamptz not null,    -- feed-level last_updated of the poll, in UTC
  bikes_available   smallint not null check (bikes_available >= 0),  -- GBFS num_vehicles_available
  ebikes_available  smallint check (ebikes_available >= 0),          -- from vehicle_types_available, if published
  docks_available   smallint not null check (docks_available >= 0),
  is_renting        boolean not null,        -- false = station closed for pickups
  is_returning      boolean not null,        -- false = station closed for returns
  primary key (station_id, observed_at)      -- also makes re-ingesting the same poll a no-op
);

comment on table public.station_snapshots is
  'Availability of each station at each poll of the GBFS station_status feed.';

-- The primary key already serves "history of one station" queries.
-- A BRIN index is tiny and fits an append-only, time-ordered table:
-- it serves "latest poll" lookups and future retention jobs.
create index station_snapshots_observed_at_brin
  on public.station_snapshots using brin (observed_at);

-- ---------------------------------------------------------------------------
-- Access: anyone can read, nobody can write through the public API
-- ---------------------------------------------------------------------------
alter table public.stations          enable row level security;
alter table public.station_snapshots enable row level security;

create policy "Stations are publicly readable"
  on public.stations for select
  to anon, authenticated
  using (true);

create policy "Snapshots are publicly readable"
  on public.station_snapshots for select
  to anon, authenticated
  using (true);

-- RLS already blocks writes (there are no insert/update/delete policies).
-- Revoking the privileges as well makes that intent explicit.
revoke insert, update, delete, truncate on public.stations          from anon, authenticated;
revoke insert, update, delete, truncate on public.station_snapshots from anon, authenticated;
grant select on public.stations, public.station_snapshots to anon, authenticated;
