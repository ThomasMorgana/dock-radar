-- pgTAP tests for station_hourly and rollup_station_hourly. Run with: npx supabase test db
begin;
select plan(11);

-- January 2020, so no real snapshots share these days. Paris is UTC+1 then.
insert into public.stations (id, name, lat, lon, capacity)
values ('hourly-station', 'Hourly Test', 44.84, -0.58, 10);

insert into public.station_snapshots
  (station_id, observed_at, bikes_available, docks_available, is_renting, is_returning)
values
  -- Monday 6 January, 08:00-08:59 Paris
  ('hourly-station', '2020-01-06 08:00 Europe/Paris', 0, 10, true,  true),   -- empty
  ('hourly-station', '2020-01-06 08:05 Europe/Paris', 2,  8, true,  true),
  ('hourly-station', '2020-01-06 08:10 Europe/Paris', 4,  0, true,  true),   -- full
  ('hourly-station', '2020-01-06 08:55 Europe/Paris', 3,  7, false, true),   -- closed for rentals: empty
  ('hourly-station', '2020-01-06 09:00 Europe/Paris', 9,  1, true,  true),   -- next hour
  -- Around midnight: the local date, not the UTC one, decides the day
  ('hourly-station', '2020-01-05 23:30+00', 5, 5, true, true),               -- = 6 January 00:30 Paris
  ('hourly-station', '2020-01-06 23:58+00', 5, 5, true, true);               -- = 7 January 00:58 Paris

select is(public.rollup_station_hourly('2020-01-06'), 3, 'one row per local hour with data (00, 08, 09)');

select is(
  (select row(samples, empty_samples, full_samples, avg_bikes, weekday)::text
     from public.station_hourly
    where station_id = 'hourly-station' and local_date = '2020-01-06' and local_hour = 8),
  row(4, 2, 1, 2.3::numeric(5,1), 1::smallint)::text,
  '08:00 hour: 4 samples, 2 empty (no bike / not renting), 1 full, 2.3 bikes on average, Monday'
);

select is(
  (select samples from public.station_hourly
    where station_id = 'hourly-station' and local_date = '2020-01-06' and local_hour = 0),
  1, '23:30 UTC on the 5th lands on the 6th at 00:00 local'
);

select is(
  (select count(*)::int from public.station_hourly
    where station_id = 'hourly-station' and local_date = '2020-01-06' and local_hour = 23),
  0, '23:58 UTC on the 6th does not land on the 6th'
);

select is(public.rollup_station_hourly('2020-01-07'), 1, 'the next local day');
select is(
  (select row(local_hour, weekday)::text from public.station_hourly
    where station_id = 'hourly-station' and local_date = '2020-01-07'),
  row(0::smallint, 2::smallint)::text,
  '23:58 UTC on the 6th lands on Tuesday the 7th at 00:00 local'
);

-- Re-running rewrites the same rows and moves the sync cursor.
update public.station_hourly set rolled_up_at = '2020-01-01' where station_id = 'hourly-station';
select is(public.rollup_station_hourly('2020-01-06'), 3, 're-running returns the same row count');
select is(
  (select count(*)::int from public.station_hourly where station_id = 'hourly-station'),
  4, 're-running does not duplicate rows'
);
select ok(
  (select bool_and(rolled_up_at > '2020-01-01') from public.station_hourly
    where station_id = 'hourly-station' and local_date = '2020-01-06'),
  're-running refreshes rolled_up_at'
);

-- Public access: read only, and the rollup isn't callable.
set local role anon;
select ok((select count(*) from public.station_hourly where station_id = 'hourly-station') = 4,
  'anon can read station_hourly');
select throws_ok('select public.rollup_station_hourly(''2020-01-06'')', '42501', null,
  'anon cannot run the rollup');
reset role;

select * from finish();
rollback;
