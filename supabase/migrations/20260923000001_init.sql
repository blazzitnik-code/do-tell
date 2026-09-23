-- Do Tell — initial schema
-- Run once: Supabase Dashboard → SQL Editor → paste → Run (or `supabase db push`).
-- Idempotent where practical. Writes happen only via service_role (ingest jobs); the app only reads.

create extension if not exists pgcrypto;

-- ───────────── reference ─────────────
create table if not exists public.event_type_config (
  event_type      text primary key,
  window_pre_days int  not null,
  window_post_days int not null,
  half_life_days  int  not null
);
insert into public.event_type_config values
  ('executive_order',10,7,30),
  ('legislation',14,7,45),
  ('social_post',3,3,4),
  ('agency_action',10,3,20),
  ('market_event',7,3,7),
  ('scheduled_vote',14,7,30),
  ('scheduled',14,7,30)
on conflict (event_type) do nothing;

create table if not exists public.assets (
  symbol       text primary key,
  name         text,
  asset_class  text not null check (asset_class in ('Crypto','Token','Equity','Option','Fund','Bond','Other')),
  sector       text,               -- crypto, semis, defense, pharma, energy, macro, media, …
  chain        text,
  contract     text
);

-- ───────────── people & wallets ─────────────
create table if not exists public.entities (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  role          text,
  tier          smallint not null check (tier between 1 and 4),   -- 1 core, 2 executive, 3 congress, 4 adjacent
  focus_sectors text[] not null default '{}',
  sec_cik       text,          -- SEC filer id (Form 4)
  bioguide_id   text,          -- Congress member id
  oge_name      text,          -- name as it appears on OGE / White House 278-T
  score         numeric,       -- roster score (weekly job)
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.wallets (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid not null references public.entities(id) on delete cascade,
  chain              text not null check (chain in ('ethereum','base','arbitrum','polygon','bsc','solana','bitcoin','tron')),
  address            text not null,
  label              text,
  confidence         smallint not null default 2 check (confidence between 1 and 3),  -- 1 low, 2 medium, 3 high
  attribution_source text,     -- e.g. 'Arkham label', 'news report', 'on-chain link'
  attribution_url    text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (chain, address)
);

-- ───────────── raw documents ─────────────
create table if not exists public.filings (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('onchain','form4','house','senate','oge','other')),
  external_id text not null,          -- accession no., doc id, tx hash …
  entity_id   uuid references public.entities(id) on delete set null,
  url         text,
  filed_at    timestamptz,
  raw         jsonb,
  raw_text    text,
  status      text not null default 'new' check (status in ('new','parsed','quarantine','ignored')),
  error       text,
  created_at  timestamptz not null default now(),
  unique (source, external_id)
);

-- ───────────── trades ─────────────
create table if not exists public.trades (
  id            uuid primary key default gen_random_uuid(),
  external_key  text not null,        -- dedupe key, e.g. txhash:logIndex or accession:row
  source        text not null check (source in ('onchain','form4','house','senate','oge','other')),
  entity_id     uuid not null references public.entities(id) on delete cascade,
  filing_id     uuid references public.filings(id) on delete set null,
  wallet_id     uuid references public.wallets(id) on delete set null,
  asset_symbol  text not null,
  asset_name    text,
  asset_class   text not null,
  sector        text,
  side          text not null check (side in ('buy','sell','transfer')),
  quantity      numeric,
  amount_usd    numeric,              -- exact (on-chain, Form 4) or range midpoint
  amount_low    numeric,              -- disclosure range, null if exact
  amount_high   numeric,
  executed_at   timestamptz not null,
  disclosed_at  timestamptz not null,
  confidence    smallint not null default 3 check (confidence between 1 and 3),
  tx_hash       text,
  created_at    timestamptz not null default now(),
  unique (source, external_key)
);
create index if not exists trades_exec_idx   on public.trades (executed_at desc);
create index if not exists trades_disc_idx   on public.trades (disclosed_at desc);
create index if not exists trades_entity_idx on public.trades (entity_id, executed_at desc);
create index if not exists trades_sector_idx on public.trades (sector, executed_at);

-- ───────────── events & statements ─────────────
create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  source           text not null,        -- federal_register, congress_gov, manual, …
  external_id      text not null,
  occurred_at      timestamptz not null,
  title            text not null,
  event_type       text not null references public.event_type_config(event_type),
  sector           text,
  url              text,
  scheduled        boolean not null default false,
  window_pre_days  int,
  window_post_days int,
  half_life_days   int,
  created_at       timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists events_sector_idx on public.events (sector, occurred_at);

-- fill per-type defaults when not given
create or replace function public.events_defaults() returns trigger language plpgsql as $$
begin
  select coalesce(new.window_pre_days, c.window_pre_days),
         coalesce(new.window_post_days, c.window_post_days),
         coalesce(new.half_life_days, c.half_life_days)
    into new.window_pre_days, new.window_post_days, new.half_life_days
    from public.event_type_config c where c.event_type = new.event_type;
  return new;
end $$;
drop trigger if exists events_defaults on public.events;
create trigger events_defaults before insert on public.events
  for each row execute function public.events_defaults();

create table if not exists public.statements (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,        -- truth_api, factbase, x_api, transcript …
  external_id     text not null,
  posted_at       timestamptz not null,
  channel         text not null check (channel in ('truth_social','x','tv','press_briefing','speech','other')),
  speaker         text,
  entity_id       uuid references public.entities(id) on delete set null,
  body            text not null,
  url             text,
  ref_symbol      text,
  reaction_1h_pct numeric,
  created_at      timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists statements_posted_idx on public.statements (posted_at desc);

create table if not exists public.event_statement_links (
  event_id     uuid not null references public.events(id) on delete cascade,
  statement_id uuid not null references public.statements(id) on delete cascade,
  confidence   numeric not null default 1,
  method       text not null default 'rule',   -- rule | llm | manual
  primary key (event_id, statement_id)
);

create table if not exists public.trade_event_links (
  trade_id               uuid primary key references public.trades(id) on delete cascade,
  event_id               uuid not null references public.events(id) on delete cascade,
  delta_days             numeric not null,     -- negative = before the event
  is_pre                 boolean not null,
  before_first_statement boolean not null,
  computed_at            timestamptz not null default now()
);

-- ───────────── ops ─────────────
create table if not exists public.source_runs (
  id          bigserial primary key,
  source      text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running','ok','partial','error')),
  items_new   int not null default 0,
  error       text
);
create index if not exists source_runs_idx on public.source_runs (source, started_at desc);

create table if not exists public.allowed_users (
  email    text primary key,
  added_at timestamptz not null default now()
);
insert into public.allowed_users (email) values ('blaz.zitnik@gmail.com') on conflict do nothing;

-- ───────────── linking ─────────────
-- Nearest same-sector event inside that event's own window; pre-event only for unscheduled events.
create or replace function public.relink_trades() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.trade_event_links;
  insert into public.trade_event_links (trade_id, event_id, delta_days, is_pre, before_first_statement)
  select distinct on (t.id)
         t.id, e.id, d.delta,
         (d.delta < 0 and not e.scheduled),
         (d.delta >= 0 and fs.first_at is not null and t.executed_at < fs.first_at)
    from public.trades t
    join public.events e on e.sector = t.sector
    cross join lateral (select extract(epoch from (t.executed_at - e.occurred_at)) / 86400.0 as delta) d
    left join lateral (
      select min(s.posted_at) as first_at
        from public.event_statement_links l join public.statements s on s.id = l.statement_id
       where l.event_id = e.id and s.posted_at > e.occurred_at) fs on true
   where d.delta between -e.window_pre_days and e.window_post_days
   order by t.id, abs(d.delta) + case when d.delta < 0 then 0 else 3 end;
  get diagnostics n = row_count;
  return n;
end $$;

-- ───────────── read models for the app ─────────────
create or replace view public.trade_feed with (security_invoker = on) as
select t.*, en.name as entity_name, en.role as entity_role, en.tier,
       extract(epoch from (t.disclosed_at - t.executed_at)) as lag_seconds,
       l.event_id, l.delta_days, l.is_pre, l.before_first_statement,
       ev.title as event_title, ev.event_type, ev.occurred_at as event_at
  from public.trades t
  join public.entities en on en.id = t.entity_id
  left join public.trade_event_links l on l.trade_id = t.id
  left join public.events ev on ev.id = l.event_id;

create or replace view public.source_health with (security_invoker = on) as
select distinct on (source) source, started_at, finished_at, status, items_new, error,
       (select max(r2.finished_at) from public.source_runs r2 where r2.source = r.source and r2.status = 'ok') as last_ok_at
  from public.source_runs r
 order by source, started_at desc;

-- ───────────── security: invite-only read, service_role writes ─────────────
create or replace function public.is_allowed() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

do $$
declare t text;
begin
  foreach t in array array['event_type_config','assets','entities','wallets','filings','trades','events','statements',
                           'event_statement_links','trade_event_links','source_runs','allowed_users'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "allowed read" on public.%I', t);
    execute format('create policy "allowed read" on public.%I for select to authenticated using (public.is_allowed())', t);
  end loop;
end $$;

-- ───────────── realtime (live feed) ─────────────
do $$
begin
  begin alter publication supabase_realtime add table public.trades;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.statements; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.events;     exception when duplicate_object then null; end;
end $$;
