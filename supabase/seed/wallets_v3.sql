-- Arkham labels confirmed in the browser 2026-09-24; balances cross-checked on mempool.space.
insert into public.wallets (entity_id, chain, address, label, confidence, attribution_source, attribution_url)
select e.id, v.chain, v.address, v.label, v.conf, v.src, v.url
  from (values
    ('trump-media','bitcoin','bc1qts0r5ndwcfynvwwqr3ru6gs8r2ydhundxvayv4','Trump Media BTC treasury #1 (~2,140 BTC)',3,'Arkham entity "Trump Media"; balances sum to entity total','https://arkm.com/explorer/entity/trump-media'),
    ('trump-media','bitcoin','bc1qe42nmra8p9q9hlwpv2ns8cc3m3vz2nps6rg59p','Trump Media BTC treasury #2 (~2,119 BTC)',3,'Arkham entity "Trump Media"; balances sum to entity total','https://arkm.com/explorer/entity/trump-media'),
    ('trump-media','bitcoin','bc1qczv6w4hpmma8lqxhermjgdkcmz3p3yk29zx9qs','Trump Media BTC (small)',2,'Arkham entity page; small balance','https://arkm.com/explorer/entity/trump-media'),
    ('trump-media','bitcoin','bc1qxru0a202ltcnpn2nqr3f8hsv3alnaxlwlw7pdz','Trump Media BTC (small)',2,'Arkham entity page; small balance','https://arkm.com/explorer/entity/trump-media'),
    ('american-bitcoin','bitcoin','33whEQMaVrjz2GNsc79MVrkjRQPg7Z2mnK','American Bitcoin treasury (~5,096 BTC)',3,'Arkham address label "American Bitcoin"','https://arkm.com/explorer/address/33whEQMaVrjz2GNsc79MVrkjRQPg7Z2mnK'),
    ('mgx','bsc','0x2087be884f1d98fe12164302822398c9bb393e36','MGX (Mubadala / G42): Binance Investment',3,'Arkham address label','https://arkm.com/explorer/address/0x2087be884F1d98fE12164302822398c9bB393E36')
  ) as v(slug,chain,address,label,conf,src,url)
  join public.entities e on e.slug = v.slug
on conflict (chain, address) do nothing;
