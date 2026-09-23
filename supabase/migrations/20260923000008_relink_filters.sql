-- Linking v2: ignore bonds/other (T-bills, munis, private funds); never flag pre-event on broad "macro" events.
create or replace function public.relink_trades() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.trade_event_links where true;
  insert into public.trade_event_links (trade_id, event_id, delta_days, is_pre, before_first_statement)
  select distinct on (t.id)
         t.id, e.id, d.delta,
         (d.delta < 0 and not e.scheduled and e.sector <> 'macro'),
         (d.delta >= 0 and fs.first_at is not null and t.executed_at < fs.first_at)
    from public.trades t
    join public.events e on e.sector = t.sector
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
delete from public.events where source = 'federal_register';
