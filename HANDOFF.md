# Do Tell — stanje projekta (za nadaljevanje v novi seji)

Interno orodje (samo na povabilo), ki sledi, kam vlagajo ljudje blizu ameriškega političnega odločanja:
on-chain v realnem času, razkritja (SEC Form 4, House/Senate PTR, OGE 278-T) takoj ko so objavljena,
vsaka poteza postavljena ob politični dogodek (okno na dogodek, relevantnost, odmev prek izjav na Truth Social / X / TV).

Mock + specifikacija (Claude artifact "Do Tell"): https://claude.ai/artifact/Lf8ZTDVfGFMzuPzFot9CDw

## Narejeno
- [x] Supabase projekt: https://cnqguypcqijdilejniij.supabase.co
- [x] Ključi v `.env.local` (Supabase anon + service_role, Alchemy, Helius, congress.gov, SEC user agent)
- [x] `.gitignore` (.env.local ne gre v git), `.env.example`
- [x] Shema baze: `supabase/migrations/20260923000001_init.sql` — nameščena v Supabase (SQL Editor, "Success").
      Tabele: entities, wallets, assets, filings, trades, events, statements, event_statement_links,
      trade_event_links, source_runs, allowed_users, event_type_config. Funkcija `relink_trades()`,
      pogleda `trade_feed` in `source_health`, RLS (branje samo za allowed_users), realtime na trades/statements/events.

- [x] Migracije 0001 (shema), 0002 (Data API grants — novi projekti tabel ne izpostavijo sami), 0003 (fix relink: DELETE ... WHERE true) nameščene. 14 objektov, RLS vklopljen na 12/12 tabelah.
- [x] `SUPABASE_ACCESS_TOKEN` v `.env.local` → SQL prek Management API (`POST api.supabase.com/v1/projects/cnqguypcqijdilejniij/database/query`), CLI: `npx supabase` (v2.117) za deploy Edge Functions.
- [x] Omrežje: dovoljeni `*.supabase.co`, `api.supabase.com`, `*.sec.gov`. Za naslednje vire dodati: api.congress.gov, federalregister.gov, *.alchemy.com, *.helius-rpc.com, *.helius.xyz, api.coingecko.com, disclosures-clerk.house.gov, efdsearch.senate.gov, *.oge.gov, www.whitehouse.gov, rollcall.com.
- Opomba: prvi zagon 0001 ni šel v noben drug projekt (zmrzko preverjen, čist; ostali projekti so pavzirani).

- [x] Roster v0 (`supabase/seed/roster_v0.sql`): 29 entitet (T1: 11, T2: 11, T4: 7), T3 kongres pride avtomatsko iz PTR. Stolpec `verify` = odprta vprašanja.
- [x] Edge Function `ingest-form4` (SEC Form 4, retry/backoff, tx_code + open_market), backfill 730 dni = 116 potez. pg_cron job `ingest-form4` vsakih 10 min (pg_net + Vault secret `cron_secret`; CRON_SECRET v .env.local in v function secrets).
- Deploy: `set -a; . ./.env.local; set +a; export SUPABASE_ACCESS_TOKEN; npx supabase functions deploy <fn> --project-ref cnqguypcqijdilejniij --use-api --no-verify-jwt`
- SQL: Management API query endpoint (glej zgoraj).

- [x] `ingest-events` (Federal Register: predsedniški dokumenti + pomembna pravila agencij, klasifikacija sektorja v `_shared/sectors.ts`), backfill 400 dni = 537 dogodkov. Cron: vsako uro ob :07.
- [x] `ingest-house` (House Clerk PTR: letni ZIP indeks + PDF z pozicijami prek unpdf → vrstice; papirnate vloge → karantena; vsak vlagatelj = T3 entiteta). Cron: vsakih 10 min, 8 PDF/zagon (CPU omejitev Edge). Backlog ~350 PTR za 2026 se sprazni v nekaj urah. Leto 2025 še ni uvoženo (?year=2025).
- Senate eFD: Akamai vrača 403 z naprave; iz cloud okolja 200. Potrebuje agreement POST + CSRF → naslednji korak.
- `_to_delete/debug-house` = star testni function (že odstranjen iz Supabase), mapo lahko izbrišeš.

- [x] Dashboard (Next.js, `app/`) na Vercel: https://do-tell-psi.vercel.app — magic link prijava, dostop samo `allowed_users`. Supabase Auth site_url + redirect nastavljena. Repo: github.com/blazzitnik-code/do-tell (push dela B; git lock datotek ne morem brisati).
- `app/engine.js` je generiran iz mocka s `scripts/build_engine.py` (vir: Claude artifact mock). Popravke delaj neposredno v engine.js.

## Odprto / backlog
- Realtime websocket je v testu vrnil 500 → preveri pri B (zelena "Live" pika).
- Sektor "tech" (GOOGL, MSFT, META, AMZN, AAPL …) + mapiranje v `_shared/sectors.ts`.
- Senate eFD (zagon iz Edge Function, ne z naprave — Akamai 403).
- On-chain: denarnice (WLFI, $TRUMP, MGX) → Alchemy/Helius webhook + `ingest-onchain`.
- OGE / White House 278-T PDF-ji (T2).
- Izjave: Factba.se / Truth Social → `statements` + povezovanje z dogodki.
- House 2025 backfill (`?year=2025`), cene za reakcijo 1h (CoinGecko).

## Naslednji koraki
1. Preveri povezavo do Supabase in SEC iz seje.
2. (narejeno) Form 4. Dodati še 13D/13G (spremembe deležev) in 8-K za podjetja (kripto zakladnice).
3. Sprejemnik on-chain obvestil (Edge Function) + nastavitev webhookov v Alchemy (EVM) in Helius (Solana).
4. Osnutek seznama ljudi in denarnic (T1–T4) → B pregleda in potrdi.
5. Dogodki: Federal Register API, congress.gov API. Nato Senate eFD, House PTR, OGE/White House 278-T, izjave (Factba.se), cene (CoinGecko).
6. Next.js dashboard (port mocka) na Vercel, prijava z magic link, samo allowed_users.
