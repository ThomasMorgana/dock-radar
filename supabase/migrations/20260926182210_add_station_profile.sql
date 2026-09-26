-- Dock Radar: how does a station usually look at this time on this day of the week?
--
-- station_profile('42', 1, '08:10') looks at every past Monday between 08:00 and 08:15
-- (local time) and returns the average number of bikes and how often the station
-- was empty or full in that slot.
--
-- "Empty" means you couldn't take a bike: none available, or the station wasn't renting.
-- "Full" means you couldn't return one: no free dock, or the station wasn't accepting returns.
--
-- It always returns exactly one row. With no history yet, samples = 0 and the averages are null.

create or replace function public.station_profile(
  p_station_id text,
  p_weekday    int,                          -- ISO day of week: 1 = Monday ... 7 = Sunday
  p_time       time,                         -- any time inside the 15-minute slot
  p_timezone   text default 'Europe/Paris'   -- the network's local time zone
)
returns table (
  slot_start    time,
  slot_end      time,
  days_observed int,      -- how many distinct past days contributed (e.g. "based on 3 Mondays")
  samples       int,      -- how many snapshots fell in the slot
  avg_bikes     numeric,
  avg_docks     numeric,
  pct_empty     numeric,  -- 0-100
  pct_full      numeric   -- 0-100
)
language sql
stable
security invoker           -- runs as the caller, so the tables' RLS policies apply
set search_path = ''
as $$
  with slot as (
    select date_bin('15 minutes', '2000-01-01'::date + p_time, '2000-01-01')::time as start
  ),
  local_snapshots as (
    select
      s.observed_at at time zone p_timezone as local_ts,
      s.bikes_available,
      s.docks_available,
      (s.bikes_available = 0 or not s.is_renting)   as is_empty,
      (s.docks_available = 0 or not s.is_returning) as is_full
    from public.station_snapshots s
    where s.station_id = p_station_id
  )
  select
    slot.start,
    slot.start + interval '15 minutes',
    count(distinct l.local_ts::date)::int,
    count(l.local_ts)::int,
    round(avg(l.bikes_available), 1),
    round(avg(l.docks_available), 1),
    round(100.0 * count(*) filter (where l.is_empty) / nullif(count(l.local_ts), 0)),
    round(100.0 * count(*) filter (where l.is_full)  / nullif(count(l.local_ts), 0))
  from slot
  left join local_snapshots l
    on  extract(isodow from l.local_ts) = p_weekday
    and date_bin('15 minutes', l.local_ts, '2000-01-01')::time = slot.start
  group by slot.start;
$$;

comment on function public.station_profile is
  'Average availability and % of time empty/full for one station, weekday (ISO 1-7) and 15-minute local-time slot.';

-- Callable by anyone through the API (POST /rest/v1/rpc/station_profile).
revoke execute on function public.station_profile from public;
grant  execute on function public.station_profile to anon, authenticated;
