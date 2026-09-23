alter table public.trades add column if not exists tx_code text;          -- SEC transaction code (P,S,A,M,G,F…)
alter table public.trades add column if not exists open_market boolean;    -- true for P/S (real buys/sells), false for grants, gifts, tax withholding…
drop view if exists public.trade_feed;
create view public.trade_feed with (security_invoker = on) as
select t.*, en.name as entity_name, en.role as entity_role, en.tier,
       extract(epoch from (t.disclosed_at - t.executed_at)) as lag_seconds,
       l.event_id, l.delta_days, l.is_pre, l.before_first_statement,
       ev.title as event_title, ev.event_type, ev.occurred_at as event_at
  from public.trades t
  join public.entities en on en.id = t.entity_id
  left join public.trade_event_links l on l.trade_id = t.id
  left join public.events ev on ev.id = l.event_id;
grant select on public.trade_feed to authenticated;
grant all on public.trade_feed to service_role;
