-- Posts that name a company link only to that ticker (not the whole sector).
alter table public.events add column if not exists symbols text[] not null default '{}';

create or replace function public.relink_trades() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.trade_event_links where true;
  insert into public.trade_event_links (trade_id, event_id, delta_days, is_pre, before_first_statement)
  select distinct on (t.id)
         t.id, e.id, d.delta,
         (d.delta < 0 and not e.scheduled and e.sector <> 'macro' and e.event_type <> 'agency_action'),
         (d.delta >= 0 and fs.first_at is not null and t.executed_at < fs.first_at)
    from public.trades t
    join public.events e
      on (cardinality(e.symbols) = 0 and e.sector = t.sector)
      or (cardinality(e.symbols) > 0 and upper(t.asset_symbol) = any(e.symbols))
    cross join lateral (select extract(epoch from (t.executed_at - e.occurred_at)) / 86400.0 as delta) d
    left join lateral (
      select min(s.posted_at) as first_at
        from public.event_statement_links l join public.statements s on s.id = l.statement_id
       where l.event_id = e.id and s.posted_at > e.occurred_at) fs on true
   where d.delta between -e.window_pre_days and e.window_post_days
     and t.asset_class not in ('Bond','Other')
     and coalesce(t.open_market, true)
   order by t.id, abs(d.delta) + case when d.delta < 0 then 0 else 3 end;
  get diagnostics n = row_count;
  return n;
end $$;

-- Statement ↔ event: same sector and (a ticker the event is about, or ≥2 distinctive shared words), within −2d … +7d.
create or replace function public.link_statements() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.event_statement_links where method = 'rule';
  insert into public.event_statement_links (event_id, statement_id, confidence, method)
  select e.id, s.id, m.shared, 'rule'
    from public.events e
    join public.statements s
      on s.posted_at between e.occurred_at - interval '2 days' and e.occurred_at + interval '7 days'
     and (s.sector = e.sector or s.symbols && e.symbols)
    cross join lateral (
      select count(*) as shared from (
        select lexeme from unnest(to_tsvector('english', e.title)) where length(lexeme) >= 4
          and lexeme not in ('unit','state','america','american','nation','nationa','presid','presidenti','order','execut','determin',
                             'pursuant','section','act','certain','amend','secur','protect','promot','ensur','strengthen','post','trump','great')
        intersect
        select lexeme from unnest(to_tsvector('english', s.body))) x) m
   where (e.source = 'truth_social' and e.external_id = s.external_id)
      or (cardinality(e.symbols) > 0 and s.symbols && e.symbols and s.posted_at >= e.occurred_at)
      or (cardinality(e.symbols) = 0 and m.shared >= 2)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
delete from public.events where source = 'truth_social';
delete from public.statements where source = 'factbase';
