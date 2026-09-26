-- pgTAP tests for station_profile and the public access rules. Run with: npx supabase test db
begin;
select plan(10);

-- A test station with two Mondays of history in the 08:00-08:15 slot (Paris time),
-- plus rows that must be ignored: the next slot, and a Tuesday.
insert into public.stations (id, name, lat, lon, capacity)
values ('test-station', 'Test', 44.84, -0.58, 10);

insert into public.station_snapshots
  (station_id, observed_at, bikes_available, docks_available, is_renting, is_returning)
values
  -- Monday 14 Sept
  ('test-station', '2026-09-14 08:00 Europe/Paris', 0, 10, true,  true),   -- empty
  ('test-station', '2026-09-14 08:05 Europe/Paris', 2,  8, true,  true),
  ('test-station', '2026-09-14 08:10 Europe/Paris', 4,  0, true,  true),   -- full
  -- Monday 21 Sept
  ('test-station', '2026-09-21 08:00 Europe/Paris', 0, 10, true,  true),   -- empty
  ('test-station', '2026-09-21 08:05 Europe/Paris', 3,  7, false, true),   -- closed for rentals: counts as empty
  ('test-station', '2026-09-21 08:10 Europe/Paris', 6,  4, true,  true),
  -- Ignored
  ('test-station', '2026-09-21 08:15 Europe/Paris', 9,  1, true,  true),   -- next slot
  ('test-station', '2026-09-22 08:05 Europe/Paris', 9,  1, true,  true);   -- Tuesday

select is(
  (select row(slot_start, slot_end, days_observed, samples)::text
     from public.station_profile('test-station', 1, '08:12')),
  row('08:00'::time, '08:15'::time, 2, 6)::text,
  'any time in the slot maps to 08:00-08:15 and counts only matching Monday rows'
);

select is((select avg_bikes from public.station_profile('test-station', 1, '08:00')), 2.5,
  'average bikes over the slot');
select is((select pct_empty from public.station_profile('test-station', 1, '08:00')), 50::numeric,
  'empty = no bike or not renting (3 of 6)');
select is((select pct_full from public.station_profile('test-station', 1, '08:00')), 17::numeric,
  'full = no dock or not returning (1 of 6, rounded)');

select is((select samples from public.station_profile('test-station', 1, '08:15')), 1,
  'the next slot is separate');

select is(
  (select row(samples, avg_bikes, pct_empty)::text
     from public.station_profile('test-station', 3, '08:00')),
  row(0, null::numeric, null::numeric)::text,
  'no history: one row with samples = 0 and null stats'
);

select is((select slot_start from public.station_profile('test-station', 1, '23:59')), '23:45'::time,
  'last slot of the day');

-- Public access: anon can read and call the function, but not write.
set local role anon;

select is((select samples from public.station_profile('test-station', 1, '08:00')), 6,
  'anon can call station_profile');
select ok((select count(*) from public.stations where id = 'test-station') = 1,
  'anon can read stations');
select throws_ok(
  $$insert into public.station_snapshots (station_id, observed_at, bikes_available, docks_available, is_renting, is_returning)
    values ('test-station', now(), 1, 1, true, true)$$,
  '42501',
  null,
  'anon cannot write snapshots'
);

select * from finish();
rollback;
