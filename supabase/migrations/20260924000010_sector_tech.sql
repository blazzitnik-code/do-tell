-- 'semis' merged into 'tech' (chips + big tech + AI); extra energy tickers
update public.trades set sector='tech' where sector='semis' or asset_symbol in ('NVDA','AMD','INTC','TSM','AMAT','LRCX','KLAC','ASML','AVGO','QCOM','MU','TXN','ARM','SMCI','MRVL','ON','ADI','NXPI','MCHP','SOXX','SMH','AEIS','GOOGL','GOOG','MSFT','META','AMZN','AAPL','ORCL','CRM','ADBE','NOW','IBM','UBER','SHOP','TSLA','PANW','CRWD','SNOW','DELL','HPE','NET','PLTR','TEM','XLK','VGT');
update public.trades set sector='energy' where asset_symbol in ('BE','DVN','CMS','DUK','SO','ETN','PWR','GEV');
update public.trades set asset_class='Equity', sector='tech' where asset_symbol like 'Tempus AI%';
delete from public.events where source='federal_register';
