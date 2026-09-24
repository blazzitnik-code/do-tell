-- Ticker → sector lookup in the DB, so every ingest path (Edge, GitHub Action) gets the same sectors.
create table if not exists public.asset_sectors (symbol text primary key, sector text not null);
insert into public.asset_sectors (symbol, sector) values
('ABTC','crypto'),
('HUT','crypto'),
('MSTR','crypto'),
('COIN','crypto'),
('HOOD','crypto'),
('GLXY','crypto'),
('XXI','crypto'),
('TRON','crypto'),
('ALTS','crypto'),
('DOMH','crypto'),
('BMNR','crypto'),
('SBET','crypto'),
('IBIT','crypto'),
('FBTC','crypto'),
('ETHA','crypto'),
('BITB','crypto'),
('GBTC','crypto'),
('RIOT','crypto'),
('MARA','crypto'),
('CLSK','crypto'),
('CRCL','crypto'),
('CIFR','crypto'),
('WULF','crypto'),
('IREN','crypto'),
('BTC','crypto'),
('ETH','crypto'),
('SOL','crypto'),
('WLFI','crypto'),
('USD1','crypto'),
('TRUMP','crypto'),
('NVDA','tech'),
('AMD','tech'),
('INTC','tech'),
('TSM','tech'),
('AMAT','tech'),
('LRCX','tech'),
('KLAC','tech'),
('ASML','tech'),
('AVGO','tech'),
('QCOM','tech'),
('MU','tech'),
('TXN','tech'),
('ARM','tech'),
('SMCI','tech'),
('MRVL','tech'),
('ON','tech'),
('ADI','tech'),
('NXPI','tech'),
('MCHP','tech'),
('SOXX','tech'),
('SMH','tech'),
('AEIS','tech'),
('GOOGL','tech'),
('GOOG','tech'),
('MSFT','tech'),
('META','tech'),
('AMZN','tech'),
('AAPL','tech'),
('ORCL','tech'),
('CRM','tech'),
('ADBE','tech'),
('NOW','tech'),
('IBM','tech'),
('UBER','tech'),
('SHOP','tech'),
('TSLA','tech'),
('PANW','tech'),
('CRWD','tech'),
('SNOW','tech'),
('DELL','tech'),
('HPE','tech'),
('NET','tech'),
('PLTR','tech'),
('TEM','tech'),
('XLK','tech'),
('VGT','tech'),
('LMT','defense'),
('RTX','defense'),
('NOC','defense'),
('GD','defense'),
('BA','defense'),
('LHX','defense'),
('HII','defense'),
('LDOS','defense'),
('KTOS','defense'),
('AVAV','defense'),
('AXON','defense'),
('XOM','energy'),
('CVX','energy'),
('COP','energy'),
('OXY','energy'),
('EOG','energy'),
('SLB','energy'),
('HAL','energy'),
('PSX','energy'),
('MPC','energy'),
('VLO','energy'),
('NEE','energy'),
('CEG','energy'),
('VST','energy'),
('SMR','energy'),
('OKLO','energy'),
('CCJ','energy'),
('FCX','energy'),
('MP','energy'),
('LNG','energy'),
('XLE','energy'),
('BE','energy'),
('DVN','energy'),
('CMS','energy'),
('DUK','energy'),
('SO','energy'),
('ETN','energy'),
('PWR','energy'),
('GEV','energy'),
('LLY','pharma'),
('PFE','pharma'),
('JNJ','pharma'),
('MRK','pharma'),
('ABBV','pharma'),
('BMY','pharma'),
('AMGN','pharma'),
('GILD','pharma'),
('NVO','pharma'),
('REGN','pharma'),
('VRTX','pharma'),
('UNH','pharma'),
('CVS','pharma'),
('XLV','pharma'),
('DJT','media'),
('PSQH','media'),
('RUM','media'),
('DIS','media'),
('PARA','media'),
('WBD','media'),
('CMCSA','media'),
('FOXA','media'),
('NFLX','media'),
('SPY','macro'),
('VOO','macro'),
('IVV','macro'),
('QQQ','macro'),
('DIA','macro'),
('TLT','macro'),
('IEF','macro'),
('SHY','macro'),
('GLD','macro'),
('F','other'),('GM','other')
on conflict (symbol) do update set sector = excluded.sector;

create or replace function public.trades_fill_sector() returns trigger language plpgsql as $$
begin
  if new.sector is null or new.sector = 'other' then
    select s.sector into new.sector from public.asset_sectors s where s.symbol = upper(new.asset_symbol);
    new.sector := coalesce(new.sector, 'other');
  end if;
  return new;
end $$;
drop trigger if exists trades_fill_sector on public.trades;
create trigger trades_fill_sector before insert on public.trades for each row execute function public.trades_fill_sector();

-- key/value state for incremental jobs (last block, cursors)
create table if not exists public.ingest_state (key text primary key, value text, updated_at timestamptz not null default now());

-- statements: sector + tickers mentioned
alter table public.statements add column if not exists sector text;
alter table public.statements add column if not exists symbols text[] not null default '{}';

-- Link statements to events: same sector, posted within −2d … +7d of the event, and at least one shared title keyword.
create or replace function public.link_statements() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.event_statement_links (event_id, statement_id, confidence, method)
  select e.id, s.id, ts_rank(to_tsvector('english', s.body), q.tsq), 'rule'
    from public.events e
    cross join lateral (select to_tsquery('english', nullif(array_to_string(array(
        select distinct lexeme from unnest(to_tsvector('english', e.title)) where length(lexeme) >= 4), ' | '), '')) as tsq) q
    join public.statements s
      on s.sector = e.sector
     and s.posted_at between e.occurred_at - interval '2 days' and e.occurred_at + interval '7 days'
   where q.tsq is not null
     and to_tsvector('english', s.body) @@ q.tsq
     and not (e.source = 'truth_social' and e.external_id <> s.external_id and s.posted_at < e.occurred_at)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
grant select on public.asset_sectors, public.ingest_state to authenticated;
grant all on public.asset_sectors, public.ingest_state to service_role;
alter table public.asset_sectors enable row level security;
alter table public.ingest_state enable row level security;
drop policy if exists "allowed read" on public.asset_sectors;
create policy "allowed read" on public.asset_sectors for select to authenticated using (public.is_allowed());
