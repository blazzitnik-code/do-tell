import re
src=open('/home/claude/orbit/orbit-ledger.html').read()
css=src[src.index('<style>')+7:src.index('</style>')]
markup=src[src.index('<div class="wrap">'):src.index('<script>')]
js=src[src.index('(function(){')+len('(function(){'):src.rindex('})();')]
def cut(s,a,b):
    i=s.index(a); j=s.index(b,i)+len(b); return s[:i]+s[j:]
def rep(a,b):
    global js
    assert a in js, 'MISSING: '+a[:80]
    js=js.replace(a,b)
markup=cut(markup,'<div class="demo">','</div>')
markup=cut(markup,'<section id="view-spec"','</section>')
markup=markup.replace('''    <div class="tabs" role="tablist">
      <button role="tab" id="tab-dash" aria-selected="true" aria-controls="view-dash">Dashboard</button>
      <button role="tab" id="tab-spec" aria-selected="false" aria-controls="view-spec">MVP spec</button>
    </div>''','''    <div class="hdr-actions"><span id="me"></span><button class="btn" id="signout">Sign out</button></div>''')
markup=markup.replace('<section id="view-dash" role="tabpanel" aria-labelledby="tab-dash">','<section id="view-dash">')
markup=markup.replace('''      <div class="fg"><span class="lab">&nbsp;</span><label class="toggle"><input type="checkbox" id="f-pre"> Pre-event only</label></div>''',
'''      <div class="fg"><span class="lab">&nbsp;</span><label class="toggle"><input type="checkbox" id="f-pre"> Pre-event only</label></div>
      <div class="fg"><span class="lab">&nbsp;</span><label class="toggle"><input type="checkbox" id="f-om"> Include grants, gifts &amp; exercises</label></div>''')
markup=markup.replace('<span class="meta">◆ pre-event trades · bar = relevance</span>','<span class="meta">market-relevant · ◆ pre-event · bar = relevance</span>')
assert 'view-spec' not in markup and 'DEMO' not in markup and 'id="me"' in markup and 'f-om' in markup
css+='''
.hdr-actions{display:flex;gap:10px;align-items:center;font-size:12.5px;color:var(--ink-2)}
.dot.off{background:var(--line-2)} .dot.err{background:var(--sell)} .dot.warn{background:var(--warn)}
.loading{padding:60px 16px;text-align:center;color:var(--ink-2)}
'''
i=js.index('function rng('); j=js.index('const SRC={'); js=js[:i]+js[j:]
rep('const H=3600e3, D=24*H, NOW=Date.now();','const H=3600e3, D=24*H, NOW=Date.now();\nconst $=id=>document.getElementById(id);')
i=js.index('const SRC={'); j=js.index('};',i)+2
js=js[:i]+'''const SRC={
  onchain:{label:'On-chain',cad:'stream',via:'Alchemy + Helius webhooks',url:'https://intel.arkm.com/'},
  form4:{label:'SEC Form 4',cad:'10 min',via:'SEC EDGAR',url:'https://www.sec.gov/edgar/search/'},
  house:{label:'House PTR',cad:'10 min',via:'House Clerk',url:'https://disclosures-clerk.house.gov/FinancialDisclosure'},
  senate:{label:'Senate eFD',cad:'1 h',via:'Senate eFD',url:'https://efdsearch.senate.gov/search/'},
  oge:{label:'OGE 278-T',cad:'24 h',via:'OGE / White House',url:'https://www.oge.gov/'}
};'''+js[j:]
i=js.index('const ASSETS={'); j=js.index('const SECNAME='); js=js[:i]+js[j:]
rep("const SECNAME={crypto:'crypto',semis:'semiconductors',defense:'defense',pharma:'pharma',energy:'energy',macro:'rates / macro',media:'media'};",
"const SECNAME={crypto:'crypto',semis:'semiconductors / AI',defense:'defense',pharma:'pharma',energy:'energy',macro:'rates / macro',media:'media',other:'other'};")
i=js.index('const ENTITIES=['); j=js.index('const firstAfter=')
js=js[:i]+'''/* ---------- data (Supabase) ---------- */
let ENT={}, EVENTS=[], EV={}, TRADES=[], HEALTH=[];
const TYPE_LABEL={executive_order:'Executive order',agency_action:'Agency action',legislation:'Legislation',social_post:'Social post',market_event:'Market event',scheduled_vote:'Scheduled vote',scheduled:'Scheduled'};
const CH_LABEL={truth_social:'Truth Social',x:'X',tv:'TV interview',press_briefing:'Press briefing',speech:'Speech',other:'Statement'};
const toTrade=r=>({id:r.id,eid:r.entity_id,src:r.source,a:{t:r.asset_symbol,name:r.asset_name||r.asset_symbol,cls:r.asset_class,sec:r.sector||'other'},
  side:r.side,amt:+r.amount_usd||0,lo:r.amount_low!=null?+r.amount_low:null,hi:r.amount_high!=null?+r.amount_high:null,
  exec:Date.parse(r.executed_at),disc:Date.parse(r.disclosed_at),conf:r.confidence||3,tx:r.tx_hash,om:r.open_market!==false,url:r.filing_url,code:r.tx_code});
const toEvent=r=>{const t=Date.parse(r.occurred_at);return {id:r.id,t,title:r.title,sec:r.sector,type:r.subtype||TYPE_LABEL[r.event_type]||r.event_type,
  up:!!r.scheduled&&t>Date.now(),pre:r.window_pre_days,post:r.window_post_days,dpre:r.window_pre_days,dpost:r.window_post_days,hl:r.half_life_days||30,url:r.url,st:[]}};
async function all(build){const out=[];for(let from=0;;from+=1000){const {data,error}=await build().range(from,from+999);if(error)throw error;out.push(...data);if(data.length<1000)break}return out}
async function loadAll(){
  const since=new Date(Date.now()-400*D).toISOString();
  const [tr,en,ev,st,sl,hl]=await Promise.all([
    all(()=>sb.from('trade_feed').select('id,entity_id,source,asset_symbol,asset_name,asset_class,sector,side,amount_usd,amount_low,amount_high,executed_at,disclosed_at,confidence,tx_hash,open_market,tx_code,filing_url').gte('executed_at',since).order('executed_at',{ascending:false})),
    all(()=>sb.from('entities').select('id,name,role,tier,kind').order('name')),
    all(()=>sb.from('events').select('*').gte('occurred_at',since).not('sector','is',null).order('occurred_at')),
    all(()=>sb.from('statements').select('*').gte('posted_at',since).order('posted_at')),
    all(()=>sb.from('event_statement_links').select('event_id,statement_id').order('event_id')),
    sb.from('source_health').select('*').then(r=>r.data||[])
  ]);
  ENT={};en.forEach(e=>ENT[e.id]={...e,wallet:null});
  EVENTS=ev.map(toEvent);EV={};EVENTS.forEach(e=>EV[e.id]=e);
  const SM={};st.forEach(s=>SM[s.id]={t:Date.parse(s.posted_at),ch:CH_LABEL[s.channel]||s.channel,via:s.source,who:s.speaker||'',q:s.body,ref:s.ref_symbol||'',mv:s.reaction_1h_pct!=null?+s.reaction_1h_pct:null,url:s.url});
  sl.forEach(l=>{if(EV[l.event_id]&&SM[l.statement_id])EV[l.event_id].st.push(SM[l.statement_id])});
  EVENTS.forEach(e=>e.st.sort((a,b)=>a.t-b.t));
  TRADES=tr.map(toTrade).filter(t=>ENT[t.eid]);
  HEALTH=hl;
  relinkAll();
}
'''+js[j:]
i=js.index('const BUCKETS='); j=js.index('const K='); js=js[:i]+js[j:]
i=js.index('let seq=0;'); j=js.index('function link(t)'); js=js[:i]+js[j:]
i=js.index('function seedAround()'); j=js.index('/* ---------- state ---------- */'); js=js[:i]+js[j:]
rep("EVENTS.forEach(ev=>{if(ev.sec!==t.a.sec)return;","if(t.a.cls==='Bond'||t.a.cls==='Other'||!t.om){t.ev=null;t.evd=null;t.pre=false;t.gap=false;return}\n  EVENTS.forEach(ev=>{if(ev.sec!==t.a.sec)return;")
rep("t.pre=!!best&&best.d<0&&!best.ev.up;","t.pre=!!best&&best.d<0&&!best.ev.up&&best.ev.sec!=='macro';")
rep("const DEF={q:'',range:30,timeBy:'exec',tiers:[1,2,3,4],cls:['Crypto','Token','Equity','Option'],srcs:Object.keys(SRC),side:'all',min:0,conf:0,pre:false,",
    "const DEF={q:'',range:90,timeBy:'exec',tiers:[1,2,3,4],cls:['Crypto','Token','Equity','Option','Fund'],srcs:Object.keys(SRC),side:'all',min:0,conf:0,pre:false,om:false,")
rep("localStorage.getItem('orbit-filters')","localStorage.getItem('dotell-filters')")
rep("function save(){try{const {q,range,timeBy,tiers,cls,srcs,side,min,conf,pre,sort,lb}=S;localStorage.setItem('orbit-filters',JSON.stringify({q,range,timeBy,tiers,cls,srcs,side,min,conf,pre,sort,lb}))}catch(e){}}",
    "function save(){try{const {q,range,timeBy,tiers,cls,srcs,side,min,conf,pre,om,sort,lb}=S;localStorage.setItem('dotell-filters',JSON.stringify({q,range,timeBy,tiers,cls,srcs,side,min,conf,pre,om,sort,lb}))}catch(e){}}")
rep("\nconst $=id=>document.getElementById(id);\nconst tkey","\nconst tkey")
rep("    if(S.pre&&!t.pre)return false;","    if(S.pre&&!t.pre)return false;\n    if(!S.om&&!t.om)return false;")
rep("const sizeTxt=t=>t.lo?Kb(t.lo)+'–'+Kb(t.hi):K(t.amt);","const sizeTxt=t=>t.lo!=null?(t.hi!=null?Kb(t.lo)+'–'+Kb(t.hi):'Over '+Kb(t.lo)):t.amt>0?K(t.amt):'—';")
rep("const K=n=>","const K=n=>n==null||isNaN(n)?'—':")
rep("[[1,'24h'],[7,'7d'],[30,'30d'],[90,'90d']]","[[7,'7d'],[30,'30d'],[90,'90d'],[365,'1y']]")
rep("[['Crypto','Crypto'],['Token','Tokens'],['Equity','Stocks'],['Option','Options']]","[['Crypto','Crypto'],['Token','Tokens'],['Equity','Stocks'],['Option','Options'],['Fund','Funds'],['Bond','Bonds'],['Other','Other']]")
rep("const syncInputs=()=>{$('q').value=S.q;$('f-min').value=String(S.min);$('f-conf').value=String(S.conf);$('f-pre').checked=S.pre};",
    "const syncInputs=()=>{$('q').value=S.q;$('f-min').value=String(S.min);$('f-conf').value=String(S.conf);$('f-pre').checked=S.pre;$('f-om').checked=!!S.om};")
rep("$('f-pre').onchange=e=>{S.pre=e.target.checked;S.limit=40;render()};","$('f-pre').onchange=e=>{S.pre=e.target.checked;S.limit=40;render()};\n$('f-om').onchange=e=>{S.om=e.target.checked;S.limit=40;render()};")
rep("const live24=TRADES.filter(t=>t.src==='onchain'&&Date.now()-t.exec<D).length;","const live24=TRADES.filter(t=>Date.now()-t.disc<D).length;")
rep("live24+' on-chain in last 24h'","live24+' disclosed in the last 24h'")
rep("'filings counted at range midpoint'","'ranges counted at midpoint'")
rep("'on-chain: seconds'","'execution → disclosure'")
rep("  const list=EVENTS.slice().sort((a,b)=>b.t-a.t);\n  $('ev').innerHTML","  const from=Date.now()-S.range*D;\n  const list=EVENTS.filter(ev=>ev.up||ev.t>=from).sort((a,b)=>b.t-a.t).slice(0,150);\n  $('ev').innerHTML")
rep("[t.src==='onchain'?'Wallet match':'Document',t.src==='onchain'?['','Low','Medium','High'][t.conf]:'Periodic transaction report']",
    "[t.src==='onchain'?'Wallet match':'Transaction code',t.src==='onchain'?['','Low','Medium','High'][t.conf]:(t.code||'—')]")
rep("['Size',t.lo?Kb(t.lo)+'–'+Kb(t.hi)+' (range)':K(t.amt)+' (exact)']","['Size',t.lo!=null?sizeTxt(t)+' (range)':t.amt>0?K(t.amt)+' (exact)':'not stated']")
rep("(t.tx?' · tx <span class=\"mono\">'+t.tx+'</span> · wallet <span class=\"mono\">'+e.wallet+'</span>':'')+'</span><a href=\"'+SRC[t.src].url+'\" target=\"_blank\" rel=\"noopener\">Open '+SRC[t.src].label+' ↗</a>",
    "(t.tx?' · tx <span class=\"mono\">'+esc(t.tx)+'</span>':'')+'</span><a href=\"'+esc(t.url||SRC[t.src].url)+'\" target=\"_blank\" rel=\"noopener\">'+(t.url?'Open filing':'Open '+SRC[t.src].label)+' ↗</a>")
rep("' because it is outside the 10-day window'","' because it is outside this event’s window'")
rep("const big=ev.st.length?ev.st.reduce((m,x)=>Math.abs(x.mv)>Math.abs(m.mv)?x:m):null;","const withMv=ev.st.filter(x=>x.mv!=null);const big=withMv.length?withMv.reduce((m,x)=>Math.abs(x.mv)>Math.abs(m.mv)?x:m):null;")
rep("<span class=\"mono\">'+x.ref+' '+(x.mv>0?'▲ +':'▼ ')+Math.abs(x.mv).toFixed(1)+'% in 1h</span>","'+(x.mv!=null?'<span class=\"mono\">'+x.ref+' '+(x.mv>0?'▲ +':'▼ ')+Math.abs(x.mv).toFixed(1)+'% in 1h</span>':'')+'")
rep("'” · '+x.ref+' '+(x.mv>0?'+':'−')+Math.abs(x.mv).toFixed(1)+'% in 1h\">","'”'+(x.mv!=null?' · '+x.ref+' '+(x.mv>0?'+':'−')+Math.abs(x.mv).toFixed(1)+'% in 1h':'')+'\">")
rep("<p>'+(ev.up?'Scheduled for '+dfmt.format(ev.t)+' · '+ageTxt(ev):dtfmt.format(ev.t)+' · '+ageTxt(ev))+'</p></div>'",
    "<p>'+(ev.up?'Scheduled for '+dfmt.format(ev.t)+' · '+ageTxt(ev):dfmt.format(ev.t)+' · '+ageTxt(ev))+(ev.url?' · <a href=\"'+esc(ev.url)+'\" target=\"_blank\" rel=\"noopener\">Source ↗</a>':'')+'</p></div>'")
i=js.index('/* ---------- health + live simulation ---------- */'); j=js.index('/* ---------- tabs ---------- */'); k=js.index('render();',j)
js=js[:i]+'''/* ---------- health + live ---------- */
const HSRC=[['form4','SEC Form 4',20*60e3],['house','House PTR',20*60e3],['events_fr','Federal Register',2*H],['senate','Senate eFD',2*H],['oge','OGE 278-T',30*H],['onchain','On-chain',H],['statements','Statements',H]];
let liveState='connecting';
function renderHealth(){
  const items=HSRC.map(([k,label,maxAge])=>{const h=HEALTH.find(x=>x.source===k);
    if(!h)return '<span class="src"><span class="dot off"></span>'+label+' <span class="mono">not connected</span></span>';
    const okAt=h.last_ok_at?Date.parse(h.last_ok_at):0,stale=!okAt||Date.now()-okAt>maxAge;
    const cls=h.status==='error'||stale?'err':h.status==='partial'?'warn':'';
    return '<span class="src" title="'+esc(h.error||'')+'"><span class="dot '+cls+'"></span>'+label+' <span class="mono">'+(okAt?ago(okAt):'never')+(h.status==='partial'?' · partial':h.status==='error'?' · error':'')+'</span></span>'});
  $('health').innerHTML=items.join('')+'<span class="ctrl"><span class="src"><span class="dot'+(liveState==='live'?' pulse':' off')+'"></span>'+(liveState==='live'?'Live':'Connecting…')+'</span></span>';
}
setInterval(async()=>{const r=await sb.from('source_health').select('*');if(r.data)HEALTH=r.data;renderHealth()},60000);
let toastT;
function toast(html){const el=$('toast');el.innerHTML='<span class="dot"></span>'+html;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,5200)}
function subscribeLive(){
  sb.channel('do-tell-live')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'trades'},async p=>{
      const {data}=await sb.from('trade_feed').select('*').eq('id',p.new.id).maybeSingle();if(!data||!ENT[data.entity_id])return;
      const t=toTrade(data);link(t);TRADES.push(t);freshIds.add(t.id);
      if(Date.now()-t.disc<3*D)toast('<b>'+esc(ENT[t.eid].name)+'</b>&nbsp;'+(t.side==='buy'?'bought':t.side==='sell'?'sold':'moved')+' '+sizeTxt(t)+' '+esc(t.a.t));
      if($('drawer').hidden)render()})
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'events'},p=>{const r=p.new;if(!r.sector)return;const e=toEvent(r);EVENTS.push(e);EV[e.id]=e;relinkAll();if($('drawer').hidden)render()})
    .subscribe(s=>{liveState=s==='SUBSCRIBED'?'live':'connecting';renderHealth()});
}
setInterval(()=>{if($('drawer').hidden)render()},60000);
'''+js[k+len('render();'):]
js='''// Generated from the Do Tell mock (build_engine.py) and wired to Supabase.
// Imperative on purpose: one render() over in-memory data, like the approved mock.
export async function init(sb){
'''+js+'''
  $('signout').onclick=async()=>{await sb.auth.signOut();location.href='/login'};
  const {data:{user}}=await sb.auth.getUser();$('me').textContent=user?.email||'';
  $('tbody').innerHTML='<tr><td colspan="9"><div class="loading">Loading filings…</div></td></tr>';
  try{await loadAll()}catch(err){$('tbody').innerHTML='<tr><td colspan="9"><div class="empty">Could not load data: '+esc(err.message||err)+'</div></td></tr>';return}
  render();renderHealth();subscribeLive();
}
'''
for bad in ['makeTrade','seedAround','pick(','R()','hex(','TYPE_CFG','QUOTES','showTab','tab-spec','lastSync','LIVE_ENT']:
    if bad in js: print('LEFTOVER',bad, js.count(bad))
open('engine.js','w').write(js); open('markup.html','w').write(markup); open('globals.css','w').write(css)
print('ok',len(js),len(markup),len(css))
