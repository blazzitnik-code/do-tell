-- $TRUMP issuer wallet: holds 718.1M TRUMP, identical to Arkham's "Official Trump Meme" entity total; largest TRUMP holder on-chain.
insert into public.wallets (entity_id, chain, address, label, confidence, attribution_source, attribution_url)
select e.id, 'solana', '2RH6rUTPBJ9rUDPpuV9b8z1YL56k1tYU6Uk5ZoaEFFSK', 'Official Trump Meme — main holding wallet (718M TRUMP)', 3,
       'Arkham entity "Official Trump Meme" + largest TRUMP holder (getTokenLargestAccounts)', 'https://arkm.com/explorer/entity/official-trump-meme'
  from public.entities e where e.slug = 'fight-fight-fight'
on conflict (chain, address) do nothing;
update public.entities set name = 'Official Trump Meme (Fight Fight Fight / CIC Digital)' where slug = 'fight-fight-fight';
