-- Publicly labeled wallets (Etherscan name tags). confidence 3 = labeled by explorer / issuer.
insert into public.wallets (entity_id, chain, address, label, confidence, attribution_source, attribution_url)
select e.id, v.chain, lower(v.address), v.label, v.conf, v.src, v.url
  from (values
    ('world-liberty-financial','ethereum','0x5be9a4959308a0d0c7bc0870e319314d8d957dBB','World Liberty: Multisig (treasury, holds WLFI/USD1)',3,'Etherscan name tag','https://etherscan.io/address/0x5be9a4959308a0d0c7bc0870e319314d8d957dbb'),
    ('world-liberty-financial','ethereum','0x97F1F8003AD0fb1c99361170310C65Dc84f921E3','World Liberty 1 (deployer / authority)',3,'Etherscan name tag','https://etherscan.io/address/0x97f1f8003ad0fb1c99361170310c65dc84f921e3')
  ) as v(slug,chain,address,label,conf,src,url)
  join public.entities e on e.slug = v.slug
on conflict (chain, address) do nothing;
update public.wallets set address = lower(address) where chain <> 'solana' and address <> lower(address);
insert into public.assets (symbol, name, asset_class, sector, chain, contract) values
  ('WLFI','World Liberty Financial governance token','Token','crypto','ethereum','0xda5e1988097297dcdc1f90d4dfe7909e847cbef6'),
  ('USD1','World Liberty USD stablecoin','Token','crypto','ethereum','0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d'),
  ('TRUMP','Official Trump memecoin','Token','crypto','solana','6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN')
on conflict (symbol) do update set contract = excluded.contract, chain = excluded.chain, asset_class = excluded.asset_class, sector = excluded.sector;
