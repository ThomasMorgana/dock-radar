-- pgTAP tests for alert_subscriptions (private) and due_alerts. Run with: npx supabase test db
begin;
select plan(8);

-- A station that was empty last week, on tomorrow's weekday, at 08:05 Paris time.
insert into public.stations (id, name, lat, lon, capacity)
values ('alert-station', 'Alert Test', 44.84, -0.58, 10);

insert into public.station_snapshots
  (station_id, observed_at, bikes_available, docks_available, is_renting, is_returning)
values
  ('alert-station', (((now() at time zone 'Europe/Paris')::date - 6) + time '08:05') at time zone 'Europe/Paris',
   0, 10, true, true);

-- Tomorrow's ISO weekday in Paris.
create temp table t as
  select extract(isodow from (now() at time zone 'Europe/Paris') + interval '1 day')::smallint as tomorrow;

insert into public.alert_subscriptions (email, station_id, weekday, depart_time, confirmed_at, last_sent_on)
select v.email, 'alert-station', t.tomorrow, v.depart_time::time, v.confirmed_at, v.last_sent_on
from t, (values
  ('due@example.com',      '08:10', now(), null::date),
  ('pending@example.com',  '08:10', null,  null),                                  -- never confirmed
  ('sent@example.com',     '08:10', now(), (now() at time zone 'Europe/Paris')::date), -- already emailed today
  ('nodata@example.com',   '17:00', now(), null)                                   -- no history in that slot
) as v(email, depart_time, confirmed_at, last_sent_on);

select is(
  (select array_agg(email) from public.due_alerts(null)),
  array['due@example.com'],
  'only confirmed, not-yet-emailed subscriptions with an empty history are due'
);
select is((select pct_empty from public.due_alerts(null)), 100::numeric, 'returns the usual availability');
select is(
  (select count(*)::int from public.due_alerts(null, 101)), 0,
  'nothing is due when the station is emptier than the threshold'
);
select is(
  (select count(*)::int from public.due_alerts(
     (extract(hour from now() at time zone 'Europe/Paris')::int + 1) % 24)), 0,
  'nothing is due outside the sending hour'
);

-- The public roles can't touch subscriptions at all.
set local role anon;
select throws_ok('select * from public.alert_subscriptions', '42501', null, 'anon cannot read subscriptions');
select throws_ok(
  $$insert into public.alert_subscriptions (email, station_id, weekday, depart_time)
    values ('x@example.com', 'alert-station', 1, '08:00')$$,
  '42501', null, 'anon cannot insert subscriptions');
select throws_ok('select * from public.due_alerts()', '42501', null, 'anon cannot call due_alerts');
set local role authenticated;
select throws_ok('select * from public.alert_subscriptions', '42501', null, 'authenticated cannot read subscriptions');
reset role;

select * from finish();
rollback;
