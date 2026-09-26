-- Dock Radar: call the ingest-gbfs Edge Function every 5 minutes.
--
-- The project URL and secret key differ per project, so they can't live in a migration.
-- They're read from Vault each time the job runs. Create them once per project:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<your sb_secret_... key>', 'secret_key');
--
-- Until both secrets exist, each run fails and is logged in cron.job_run_details.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

select cron.schedule(
  'ingest-gbfs',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/ingest-gbfs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')
    ),
    timeout_milliseconds := 30000
  );
  $$
);
