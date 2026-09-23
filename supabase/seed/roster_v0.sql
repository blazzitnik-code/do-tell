-- Do Tell roster v0 (2026-09-23). Tier 3 (Congress) is filled automatically from PTR data later.
-- sec_cik verified via EDGAR search; wallets only when publicly attributed (confidence noted).
insert into public.entities (slug,name,role,tier,kind,focus_sectors,sec_cik,oge_name,verify) values
 ('donald-trump','Donald J. Trump','President; WLFI "chief crypto advocate"',1,'person','{crypto,media,macro}','947033','Trump, Donald J.',null),
 ('donald-trump-revocable-trust','Donald J. Trump Revocable Trust','Holds the President''s business interests (incl. DJT shares)',1,'trust','{media,crypto}','2050191',null,null),
 ('donald-trump-jr','Donald Trump Jr.','WLFI Web3 ambassador; Trump Media director',1,'person','{crypto,media}','2016181',null,null),
 ('eric-trump','Eric Trump','WLFI board & Web3 ambassador; American Bitcoin co-founder',1,'person','{crypto}','2057754',null,null),
 ('barron-trump','Barron Trump','Listed by WLFI as "DeFi visionary"',1,'person','{crypto}',null,null,'Keep on list? Private individual, no filings expected.'),
 ('zach-witkoff','Zach Witkoff','WLFI co-founder; chairman, World Liberty Trust Co.',1,'person','{crypto}',null,null,null),
 ('world-liberty-financial','World Liberty Financial','Trump-linked DeFi protocol; WLFI token, USD1 stablecoin',1,'protocol','{crypto}','2043140',null,'Treasury / multisig wallets to source (Arkham entity page).'),
 ('trump-media','Trump Media & Technology Group','DJT; corporate bitcoin/crypto treasury',1,'company','{media,crypto}','1849635',null,null),
 ('american-bitcoin','American Bitcoin Corp.','ABTC; bitcoin miner co-founded by Eric Trump',1,'company','{crypto}','1755953',null,null),
 ('fight-fight-fight','Fight Fight Fight LLC','Issuer of the $TRUMP memecoin',1,'company','{crypto}',null,null,'Issuer/treasury wallets to source.'),
 ('devin-nunes','Devin Nunes','Trump Media CEO',1,'person','{media}','2015798',null,'Confirm still CEO in 2026.'),
 ('scott-bessent','Scott Bessent','Secretary of the Treasury',2,'person','{macro,crypto}',null,'Bessent, Scott',null),
 ('howard-lutnick','Howard Lutnick','Secretary of Commerce',2,'person','{semis,macro}','1250975','Lutnick, Howard W.',null),
 ('chris-wright','Chris Wright','Secretary of Energy',2,'person','{energy}',null,'Wright, Christopher',null),
 ('doug-burgum','Doug Burgum','Secretary of the Interior',2,'person','{energy}',null,'Burgum, Douglas',null),
 ('pete-hegseth','Pete Hegseth','Secretary of Defense / War',2,'person','{defense}',null,'Hegseth, Peter',null),
 ('jamieson-greer','Jamieson Greer','U.S. Trade Representative',2,'person','{semis,macro}',null,'Greer, Jamieson',null),
 ('russ-vought','Russell Vought','Director, OMB',2,'person','{macro}',null,'Vought, Russell',null),
 ('robert-f-kennedy-jr','Robert F. Kennedy Jr.','Secretary of Health and Human Services',2,'person','{pharma}',null,'Kennedy, Robert F. Jr.',null),
 ('steve-witkoff','Steve Witkoff','Special Envoy; WLFI co-founder (via family)',2,'person','{crypto}',null,'Witkoff, Steven',null),
 ('paul-atkins','Paul Atkins','Chair, SEC',2,'person','{crypto,macro}',null,'Atkins, Paul',null),
 ('michael-selig','Michael Selig','Chair, CFTC',2,'person','{crypto,macro}',null,'Selig, Michael',null),
 ('justin-sun','Justin Sun','Major WLFI investor & adviser; Tron founder',4,'person','{crypto}',null,null,null),
 ('tron-inc','Tron Inc.','TRON; Nasdaq-listed TRX treasury company linked to Justin Sun',4,'company','{crypto}','1956744',null,null),
 ('mgx','MGX','Abu Dhabi fund; used USD1 for $2B deal; stake in WLFI trust entity',4,'fund','{crypto}',null,null,'Wallets to source.'),
 ('brandon-lutnick','Brandon Lutnick','Chairman, Cantor Fitzgerald (son of Howard Lutnick)',4,'person','{crypto,macro}','2048880',null,null),
 ('kyle-lutnick','Kyle Lutnick','Cantor Fitzgerald (son of Howard Lutnick)',4,'person','{crypto,macro}','2055504',null,null),
 ('twenty-one-capital','Twenty One Capital','XXI; bitcoin treasury company (Cantor / Tether)',4,'company','{crypto}','2070457',null,null),
 ('dominari-holdings','Dominari Holdings','DOMH; investment firm linked to Trump sons',4,'company','{crypto}','12239',null,'Confirm current Trump-family role.')
on conflict (slug) do update set name=excluded.name, role=excluded.role, tier=excluded.tier, kind=excluded.kind,
  focus_sectors=excluded.focus_sectors, sec_cik=excluded.sec_cik, oge_name=excluded.oge_name, verify=excluded.verify;

insert into public.wallets (entity_id, chain, address, label, confidence, attribution_source, attribution_url)
select id,'ethereum','0x5AB26169051d0D96217949ADb91E86e51a5FDA74','WLFI holdings (frozen by WLFI)',2,'Arkham research article',
       'https://info.arkm.com/research/world-liberty-financial-wlfi-trump-tokenomics-stablecoin-products'
  from public.entities where slug='justin-sun'
on conflict (chain,address) do nothing;
