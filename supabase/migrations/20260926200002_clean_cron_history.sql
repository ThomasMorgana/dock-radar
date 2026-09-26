-- Dock Radar: keep pg_cron's run history from growing forever.
--
-- The ingestion job runs 288 times a day and each run is logged in cron.job_run_details.
-- One week of history is plenty for debugging. (pg_net already deletes its own
-- responses in net._http_response after 6 hours.)

select cron.schedule(
  'clean-cron-history',
  '17 3 * * *',   -- daily at 03:17 UTC, off the 5-minute ingestion ticks
  $$
  delete from cron.job_run_details
  where end_time < now() - interval '7 days';
  $$
);
