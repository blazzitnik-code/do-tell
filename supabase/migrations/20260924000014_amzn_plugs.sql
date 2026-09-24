update public.statements set symbols = array_remove(symbols, 'AMZN'), ref_symbol = (array_remove(symbols, 'AMZN'))[1]
 where 'AMZN' = any(symbols) and body ~* '\m(book|film|movie|documentary|pre-?order|available (now )?(on|at))\M';
update public.events e set symbols = s.symbols
  from public.statements s where e.source = 'truth_social' and s.source = 'factbase' and s.external_id = e.external_id and e.symbols <> s.symbols;
delete from public.events where source = 'truth_social' and cardinality(symbols) = 0;
select public.link_statements();
select public.relink_trades();
