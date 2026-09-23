-- Schedules: pg_cron + pg_net call Edge Functions; shared secret lives in Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- schedule (run once; secret created separately in Vault as 'cron_secret')
select cron.schedule('ingest-form4','*/10 * * * *', $$ select net.http_post(url := 'https://cnqguypcqijdilejniij.supabase.co/functions/v1/ingest-form4', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')), body := '{}'::jsonb, timeout_milliseconds := 150000) $$);
select cron.schedule('ingest-events','7 * * * *', $$ select net.http_post(url := 'https://cnqguypcqijdilejniij.supabase.co/functions/v1/ingest-events?days=3', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')), body := '{}'::jsonb, timeout_milliseconds := 150000) $$);
select cron.schedule('ingest-house','*/10 * * * *', $$ select net.http_post(url := 'https://cnqguypcqijdilejniij.supabase.co/functions/v1/ingest-house?limit=8', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')), body := '{}'::jsonb, timeout_milliseconds := 150000) $$);
