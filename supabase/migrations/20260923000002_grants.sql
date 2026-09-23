-- Do Tell — explicit Data API grants (new Supabase projects no longer expose public tables automatically)
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on all tables in schema public to authenticated;
grant execute on all functions in schema public to service_role, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant select on tables to authenticated;
notify pgrst, 'reload schema';
-- check: expect 14 (12 tables + 2 views)
select count(*) as do_tell_objects from information_schema.tables where table_schema = 'public';
