-- Dock Radar: every station with its most recent snapshot, for the front end's picker and live counts.
--
-- One index lookup per station on the snapshots primary key (station_id, observed_at),
-- so it stays fast however much history piles up.

create view public.station_latest
with (security_invoker = true)   -- the caller's RLS applies, as with the underlying tables
as
select
  s.id,
  s.name,
  s.lat,
  s.lon,
  s.capacity,
  snap.observed_at,
  snap.bikes_available,
  snap.ebikes_available,
  snap.docks_available,
  snap.is_renting,
  snap.is_returning
from public.stations s
left join lateral (
  select *
  from public.station_snapshots ss
  where ss.station_id = s.id
  order by ss.observed_at desc
  limit 1
) snap on true;

comment on view public.station_latest is
  'Each station with its latest availability snapshot.';

grant select on public.station_latest to anon, authenticated;
