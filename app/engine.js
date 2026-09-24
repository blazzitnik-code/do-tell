// Generated from the Do Tell mock (build_engine.py) and wired to Supabase.
// Imperative on purpose: one render() over in-memory data, like the approved mock.
export async function init(sb){

const H=3600e3, D=24*H, NOW=Date.now();
const $=id=>document.getElementById(id);
const SRC={
  onchain:{label:'On-chain',cad:'stream',via:'Alchemy + Helius webhooks',url:'https://intel.arkm.com/'},
  form4:{label:'SEC Form 4',cad:'10 min',via:'SEC EDGAR',url:'https://www.sec.gov/edgar/search/'},
  house:{label:'House PTR',cad:'10 min',via:'House Clerk',url:'https://disclosures-clerk.house.gov/FinancialDisclosure'},
  senate:{label:'Senate eFD',cad:'1 h',via:'Senate eFD',url:'https://efdsearch.senate.gov/search/'},
  oge:{label:'OGE 278-T',cad:'24 h',via:'OGE / White House',url:'https://www.oge.gov/'}
};
const TIERS={1:'Core',2:'Executive',3:'Congress',4:'Adjacent'};

const SECNAME={crypto:'crypto',tech:'tech / AI / chips',semis:'semiconductors / AI',defense:'defense',pharma:'pharma',energy:'energy',macro:'rates / macro',media:'media',other:'other'};

/* ---------- data (Supabase) ---------- */
let ENT={}, EVENTS=[], EV={}, TRADES=[], HEALTH=[];
const TYPE_LABEL={executive_order:'Executive order',agency_action:'Agency action',legislation:'Legislation',social_post:'Social post',market_event:'Market event',scheduled_vote:'Scheduled vote',scheduled:'Scheduled'};
const CH_LABEL={truth_social:'Truth Social',x:'X',tv:'TV interview',press_briefing:'Press briefing',speech:'Speech',other:'Statement'};
const toTrade=r=>({id:r.id,eid:r.entity_id,src:r.source,a:{t:r.asset_symbol,name:r.asset_name||r.asset_symbol,cls:r.asset_class,sec:r.sector||'other'},
  side:r.side,amt:+r.amount_usd||0,lo:r.amount_low!=null?+r.amount_low:null,hi:r.amount_high!=null?+r.amount_high:null,
  exec:Date.parse(r.executed_at),disc:Date.parse(r.disclosed_at),conf:r.confidence||3,tx:r.tx_hash,om:r.open_market!==false,url:r.filing_url,code:r.tx_code});
const toEvent=r=>{const t=Date.parse(r.occurred_at);return {id:r.id,t,kind:r.event_type,title:r.title,sec:r.sector,type:r.subtype||TYPE_LABEL[r.event_type]||r.event_type,
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
const firstAfter=ev=>ev.st.find(x=>x.t>ev.t);
const rel=ev=>ev.up?1:Math.exp(-Math.LN2*((Date.now()-ev.t)/D)/ev.hl);

const K=n=>n==null||isNaN(n)?'—':n>=1e9?'$'+(n/1e9).toFixed(1)+'B':n>=1e6?'$'+(n/1e6).toFixed(n>=1e7?0:1)+'M':n>=1e3?'$'+Math.round(n/1e3)+'K':'$'+Math.round(n);
const Kb=n=>n>=1e6?'$'+Math.round(n/1e6)+'M':'$'+Math.round(n/1e3)+'K';

function link(t){
  let best=null;
  if(t.a.cls==='Bond'||t.a.cls==='Other'||!t.om){t.ev=null;t.evd=null;t.pre=false;t.gap=false;return}
  EVENTS.forEach(ev=>{if(ev.sec!==t.a.sec)return;const d=(t.exec-ev.t)/D;if(d<-ev.pre||d>ev.post)return;
    const score=Math.abs(d)+(d<0?0:3);if(!best||score<best.s)best={s:score,ev,d}});
  t.ev=best?best.ev.id:null;t.evd=best?best.d:null;t.pre=!!best&&best.d<0&&!best.ev.up&&best.ev.sec!=='macro'&&best.ev.kind!=='agency_action';
  t.gap=false;if(best&&best.d>=0){const f=firstAfter(best.ev);t.gap=!!f&&t.exec<f.t}
}
const relinkAll=()=>TRADES.forEach(link);
/* ---------- state ---------- */
const DEF={q:'',range:90,timeBy:'exec',tiers:[1,2,3,4],cls:['Crypto','Token','Equity','Option','Fund'],srcs:Object.keys(SRC),side:'all',min:0,conf:0,pre:false,om:false,entity:null,event:null,sort:{k:'time',d:-1},limit:40,lb:'net'};
let S=JSON.parse(JSON.stringify(DEF));
try{const saved=JSON.parse(localStorage.getItem('dotell-filters')||'null');if(saved)Object.assign(S,saved,{entity:null,event:null,limit:40})}catch(e){}
function save(){try{const {q,range,timeBy,tiers,cls,srcs,side,min,conf,pre,om,sort,lb}=S;localStorage.setItem('dotell-filters',JSON.stringify({q,range,timeBy,tiers,cls,srcs,side,min,conf,pre,om,sort,lb}))}catch(e){}}

const tkey=t=>S.timeBy==='exec'?t.exec:t.disc;

function base(ignoreEvent){
  const now=Date.now(),from=now-S.range*D,q=S.q.trim().toLowerCase();
  return TRADES.filter(t=>{
    const e=ENT[t.eid];
    if(tkey(t)<from)return false;
    if(!S.tiers.includes(e.tier)||!S.cls.includes(t.a.cls)||!S.srcs.includes(t.src))return false;
    if(S.side!=='all'&&t.side!==S.side)return false;
    if(t.amt<S.min)return false;
    if(t.conf<S.conf)return false;
    if(S.pre&&!t.pre)return false;
    if(!S.om&&!t.om)return false;
    if(S.entity&&t.eid!==S.entity)return false;
    if(!ignoreEvent&&S.event&&t.ev!==S.event)return false;
    if(q&&!(e.name+' '+e.role+' '+t.a.t+' '+t.a.name+' '+SRC[t.src].label).toLowerCase().includes(q))return false;
    return true;
  });
}
const SORTS={
  time:t=>tkey(t),entity:t=>ENT[t.eid].name,asset:t=>t.a.t,side:t=>t.side,size:t=>t.amt,
  src:t=>SRC[t.src].label,lag:t=>t.disc-t.exec,event:t=>t.evd==null?1e9:Math.abs(t.evd),conf:t=>t.conf
};

/* ---------- formatting ---------- */
function ago(ts){const s=(Date.now()-ts)/1000;if(s<0){const d=-s/86400;return 'in '+(d<1?Math.round(-s/3600)+'h':Math.round(d)+'d')}
  if(s<60)return Math.max(1,Math.round(s))+'s ago';if(s<3600)return Math.round(s/60)+'m ago';if(s<86400)return Math.round(s/3600)+'h ago';return Math.round(s/86400)+'d ago'}
const dfmt=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short'});
const dtfmt=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
function lagTxt(ms){if(ms<60e3)return Math.round(ms/1000)+'s';if(ms<H)return Math.round(ms/60e3)+'m';if(ms<D)return Math.round(ms/H)+'h';return Math.round(ms/D)+'d'}
function freshChip(t){const ms=t.disc-t.exec;if(t.src==='onchain')return '<span class="fresh live"><span class="dot"></span>LIVE</span>';
  const d=Math.round(ms/D);return '<span class="fresh'+(d>30?' late':'')+'">T+'+d+'d</span>'}
const sideHtml=s=>s==='buy'?'<span class="side buy">▲ Buy</span>':s==='sell'?'<span class="side sell">▼ Sell</span>':'<span class="side transfer">⇄ Transfer</span>';
const sizeTxt=t=>t.lo!=null?(t.hi!=null?Kb(t.lo)+'–'+Kb(t.hi):'Over '+Kb(t.lo)):t.amt>0?K(t.amt):'—';
const confHtml=t=>t.src!=='onchain'?'<span class="conf" style="color:var(--ink-3)">Filed</span>':'<span class="conf" title="Wallet attribution confidence"><i>'+'●'.repeat(t.conf)+'<em>'+'●'.repeat(3-t.conf)+'</em></i> '+['','Low','Med','High'][t.conf]+'</span>';
const evHtml=t=>{if(!t.ev)return '<span class="dlt">—</span>';const ev=EV[t.ev],d=t.evd;
  const lab=d<0?(Math.abs(d)<1?'<1d before':Math.round(-d)+'d before'):(d<1?'<1d after':Math.round(d)+'d after');
  return '<span class="evl">'+(t.pre?'<span class="flag">◆ '+lab+'</span>':t.gap?'<span class="gapf" title="After the event, before the first public statement">◇ '+lab+'</span>':'<span class="dlt">'+lab+'</span>')+'<span class="t">'+ev.title+'</span></span>'};
function relH(ms){const a=Math.abs(ms),sg=ms<0?'−':'+';return sg+(a<D?Math.max(1,Math.round(a/H))+'h':(a<3*D?(a/D).toFixed(1):Math.round(a/D))+'d')}
const ageTxt=ev=>ev.up?'in '+Math.max(1,Math.round((ev.t-Date.now())/D))+'d':ago(ev.t);
const meter=v=>'<span class="meter"><span style="width:'+Math.max(3,Math.round(v*100))+'%"></span></span>';
const median=a=>{if(!a.length)return null;a=a.slice().sort((x,y)=>x-y);const m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2};

/* ---------- controls ---------- */
function seg(el,opts,get,set){el.innerHTML=opts.map(o=>'<button type="button" data-v="'+o[0]+'">'+o[1]+'</button>').join('');
  const sync=()=>el.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===String(get()))));
  el.onclick=e=>{const b=e.target.closest('button');if(!b)return;set(b.dataset.v);sync();S.limit=40;render()};sync();return sync}
function chips(el,opts,arr){el.innerHTML=opts.map(o=>'<button type="button" class="chip" data-v="'+o[0]+'">'+o[1]+'</button>').join('');
  const sync=()=>el.querySelectorAll('button').forEach(b=>{const v=isNaN(+b.dataset.v)?b.dataset.v:+b.dataset.v;b.setAttribute('aria-pressed',String(S[arr].includes(v)))});
  el.onclick=e=>{const b=e.target.closest('button');if(!b)return;const v=isNaN(+b.dataset.v)?b.dataset.v:+b.dataset.v;const a=S[arr];
    const i=a.indexOf(v);if(i>=0){if(a.length>1)a.splice(i,1)}else a.push(v);sync();S.limit=40;render()};sync();return sync}
const syncers=[];
syncers.push(seg($('f-range'),[[7,'7d'],[30,'30d'],[90,'90d'],[365,'1y']],()=>S.range,v=>S.range=+v));
syncers.push(seg($('f-timeby'),[['exec','Executed'],['disc','Disclosed']],()=>S.timeBy,v=>S.timeBy=v));
syncers.push(seg($('f-side'),[['all','All'],['buy','Buy'],['sell','Sell'],['transfer','Transfer']],()=>S.side,v=>S.side=v));
syncers.push(seg($('lb-sort'),[['net','Net flow'],['n','Trades'],['pre','Pre-event']],()=>S.lb,v=>S.lb=v));
syncers.push(chips($('f-tier'),[[1,'T1 Core'],[2,'T2 Exec'],[3,'T3 Congress'],[4,'T4 Adjacent']],'tiers'));
syncers.push(chips($('f-cls'),[['Crypto','Crypto'],['Token','Tokens'],['Equity','Stocks'],['Option','Options'],['Fund','Funds'],['Bond','Bonds'],['Other','Other']],'cls'));
syncers.push(chips($('f-src'),Object.keys(SRC).map(k=>[k,SRC[k].label]),'srcs'));
const syncInputs=()=>{$('q').value=S.q;$('f-min').value=String(S.min);$('f-conf').value=String(S.conf);$('f-pre').checked=S.pre;$('f-om').checked=!!S.om};
syncInputs();
$('q').oninput=e=>{S.q=e.target.value;S.limit=40;render()};
$('f-min').onchange=e=>{S.min=+e.target.value;S.limit=40;render()};
$('f-conf').onchange=e=>{S.conf=+e.target.value;S.limit=40;render()};
$('f-pre').onchange=e=>{S.pre=e.target.checked;S.limit=40;render()};
$('f-om').onchange=e=>{S.om=e.target.checked;S.limit=40;render()};
$('reset').onclick=()=>{S=JSON.parse(JSON.stringify(DEF));syncers.forEach(f=>f());syncInputs();render()};

const COLS=[['time','When',''],['entity','Who',''],['asset','Asset',''],['side','Side',''],['size','Size','r'],['src','Source',''],['lag','Filing lag','r'],['event','Nearest policy event',''],['conf','Wallet match','']];
function renderHead(){
  $('thead').innerHTML=COLS.filter(c=>SHOWCONF||c[0]!=='conf').map(c=>{const on=S.sort.k===c[0];const lab=c[0]==='time'?(S.timeBy==='exec'?'Executed':'Disclosed'):c[1];
    return '<th class="'+c[2]+'"'+(on?' aria-sort="'+(S.sort.d<0?'descending':'ascending')+'"':'')+'><button type="button" data-k="'+c[0]+'">'+lab+' <span class="ar">'+(on?(S.sort.d<0?'▼':'▲'):'↕')+'</span></button></th>'}).join('');
}
$('thead').onclick=e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;
  if(S.sort.k===k)S.sort.d*=-1;else S.sort={k,d:(k==='entity'||k==='asset'||k==='src'||k==='event')?1:-1};render()};

/* ---------- render ---------- */
let freshIds=new Set();
let SHOWCONF=true;
function render(){
  SHOWCONF=TRADES.some(t=>t.src==='onchain');
  save();renderHead();
  const rows=base();
  const f=SORTS[S.sort.k];
  rows.sort((a,b)=>{const x=f(a),y=f(b);return (x<y?-1:x>y?1:0)*S.sort.d||(tkey(b)-tkey(a))});
  // KPIs
  const vol=rows.reduce((s,t)=>s+t.amt,0);
  const net=rows.reduce((s,t)=>s+(t.side==='buy'?t.amt:t.side==='sell'?-t.amt:0),0);
  const linked=rows.filter(t=>t.ev),pre=rows.filter(t=>t.pre);
  const lags=rows.filter(t=>t.src!=='onchain').map(t=>(t.disc-t.exec)/D);
  const live24=TRADES.filter(t=>Date.now()-t.disc<D).length;
  const med=median(lags);
  $('kpis').innerHTML=[
    ['Trades',rows.length.toLocaleString('en-US'),live24+' disclosed in the last 24h','Number of individual transactions matching the filters. One filing often lists many transactions.'],
    ['Volume',K(vol),'ranges counted at midpoint','Sum of trade sizes. Congress reports only ranges (e.g. $15K–$50K); each counts at its midpoint, so this is an estimate.'],
    ['Net flow','<span class="'+(net>=0?'pos':'neg')+'">'+(net>=0?'+':'−')+K(Math.abs(net))+'</span>',net>=0?'more bought than sold':'more sold than bought','Buys minus sells in dollars. Dominated by a few large filers; selling is often taxes, rebalancing or divesting, not a market view.'],
    ['Pre-event',rows.length?Math.round(pre.length/rows.length*100)+'%':'—',pre.length+' of '+rows.length+' trades inside a same-sector event’s pre-window','Share of trades executed shortly before an unscheduled policy event in the same sector. A timing flag, not evidence of anything.'],
    ['Median filing lag',med==null?'—':Math.round(med)+' days','execution → disclosure','Typical days between the trade and the day it became public. Congress may take up to 45 days; SEC Form 4 is due in 2 business days.']
  ].map(k=>'<div class="kpi" title="'+esc(k[3]||'')+'"><div class="l">'+k[0]+'</div><div class="v">'+k[1]+'</div><div class="s">'+k[2]+'</div></div>').join('');
  // active pills
  const pills=[];
  if(S.entity)pills.push('<button class="pill-x" data-clear="entity">'+ENT[S.entity].name+' <span>×</span></button>');
  if(S.event)pills.push('<button class="pill-x" data-clear="event">'+EV[S.event].title+' <span>×</span></button>');
  $('active').innerHTML=pills.join('');
  // table
  const shown=rows.slice(0,S.limit);
  $('count').textContent='Showing '+shown.length+' of '+rows.length;
  $('tbody').innerHTML=shown.length?shown.map(t=>{const e=ENT[t.eid];
    return '<tr tabindex="0" data-id="'+t.id+'"'+(freshIds.has(t.id)?' class="flash"':'')+'>'+
    '<td><div class="ent"><b class="mono" style="font-weight:500">'+ago(tkey(t))+'</b><small>'+dfmt.format(tkey(t))+'</small></div></td>'+
    '<td><div class="ent"><b><span class="tier">T'+e.tier+'</span>'+e.name+'</b><small>'+e.role+'</small></div></td>'+
    '<td><span class="tk">'+t.a.t+'</span><span class="cls">'+t.a.cls+'</span></td>'+
    '<td>'+sideHtml(t.side)+'</td>'+
    '<td class="r mono">'+sizeTxt(t)+'</td>'+
    '<td><span class="srcn">'+SRC[t.src].label+'</span>'+freshChip(t)+'</td>'+
    '<td class="r mono">'+lagTxt(t.disc-t.exec)+'</td>'+
    '<td>'+evHtml(t)+'</td>'+
    (SHOWCONF?'<td>'+confHtml(t)+'</td>':'')+'</tr>'}).join(''):'<tr><td colspan="9"><div class="empty">No trades match these filters. Widen the window or press Reset.</div></td></tr>';
  freshIds.clear();
  $('more').innerHTML=rows.length>S.limit?'<span>'+(rows.length-S.limit)+' more</span><button class="btn" id="showmore">Show 40 more</button>':'<span>End of results</span>';
  const sm=$('showmore');if(sm)sm.onclick=()=>{S.limit+=40;render()};
  renderLB(base().filter(t=>!S.entity||true));
  renderEvents();
}
function renderLB(){
  const saved=S.entity;S.entity=null;const rows=base();S.entity=saved;
  const g={};rows.forEach(t=>{const o=g[t.eid]||(g[t.eid]={id:t.eid,n:0,net:0,pre:0});o.n++;o.pre+=t.pre?1:0;o.net+=t.side==='buy'?t.amt:t.side==='sell'?-t.amt:0});
  let arr=Object.values(g);
  arr.sort((a,b)=>S.lb==='net'?Math.abs(b.net)-Math.abs(a.net):S.lb==='n'?b.n-a.n:b.pre-a.pre||b.n-a.n);
  arr=arr.slice(0,10);
  const mx=Math.max(1,...arr.map(o=>Math.abs(o.net)));
  $('lb').innerHTML=arr.length?arr.map(o=>{const e=ENT[o.id],w=Math.max(2,Math.abs(o.net)/mx*50);
    const bar=o.net>=0?'<span style="left:50%;width:'+w+'%;background:var(--buy)"></span>':'<span style="right:50%;width:'+w+'%;background:var(--sell)"></span>';
    const val=S.lb==='net'?'<span class="'+(o.net>=0?'pos':'neg')+'">'+(o.net>=0?'+':'−')+K(Math.abs(o.net))+'</span>':S.lb==='n'?o.n+' trades':o.pre+' flagged';
    return '<li tabindex="0" data-e="'+o.id+'"'+(S.entity===o.id?' aria-current="true"':'')+'><div class="nm"><b>'+e.name+'</b><small>T'+e.tier+' · '+e.role+'</small></div><div class="div" title="Net flow '+(o.net>=0?'+':'−')+K(Math.abs(o.net))+'">'+bar+'</div><div class="num">'+val+'</div></li>'}).join(''):'<li style="cursor:default;color:var(--ink-3)">Nobody in this filter.</li>';
}
function renderEvents(){
  const rows=base(true);
  const cnt={};rows.forEach(t=>{if(t.ev&&t.pre)cnt[t.ev]=(cnt[t.ev]||0)+1});
  const from=Date.now()-S.range*D;
  const list=EVENTS.filter(ev=>ev.up||ev.t>=from).sort((a,b)=>b.t-a.t).slice(0,150);
  $('ev').innerHTML=list.map(ev=>{const r=rel(ev);
    return '<li tabindex="0" data-v="'+ev.id+'" class="'+(ev.up?'up':'')+'"'+(S.event===ev.id?' aria-current="true"':'')+'><span class="d">'+(ev.up?'':dfmt.format(ev.t))+'<b>'+ageTxt(ev)+'</b></span><div><div class="tt">'+ev.title+'</div><div class="ty">'+ev.type+' · '+SECNAME[ev.sec]+' · window −'+ev.pre+'d / +'+ev.post+'d'+(ev.st.length?' · '+ev.st.length+' statement'+(ev.st.length>1?'s':''):'')+'</div></div><span class="n">'+(cnt[ev.id]?'<span>◆ '+cnt[ev.id]+'</span>':'')+(ev.up?'<small>scheduled</small>':meter(r)+'<small>'+Math.round(r*100)+'%</small>')+'</span></li>'}).join('');
}
$('active').onclick=e=>{const b=e.target.closest('[data-clear]');if(!b)return;S[b.dataset.clear]=null;render()};
function act(el,sel,fn){el.addEventListener('click',e=>{const x=e.target.closest(sel);if(x)fn(x)});el.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const x=e.target.closest(sel);if(x){e.preventDefault();fn(x)}})}
act($('lb'),'li[data-e]',li=>{S.entity=S.entity===li.dataset.e?null:li.dataset.e;S.limit=40;render()});
act($('ev'),'li[data-v]',li=>openEvent(li.dataset.v));
act($('tbody'),'tr[data-id]',tr=>openDrawer(tr.dataset.id));

/* ---------- drawer ---------- */
let lastFocus=null;
function openDrawer(id){
  const t=TRADES.find(x=>x.id===id);if(!t)return;const e=ENT[t.eid],ev=t.ev?EV[t.ev]:null;if($('drawer').hidden)lastFocus=document.activeElement;
  const lab=t.side==='buy'?'bought':t.side==='sell'?'sold':'transferred';
  let why='';
  if(t.pre)why='<div class="why"><b>◆ Pre-event</b> — executed '+(Math.abs(t.evd)<1?'less than a day':Math.round(-t.evd)+' days')+' before “'+ev.title+'” ('+ev.type.toLowerCase()+', '+dfmt.format(ev.t)+'). The asset’s sector ('+SECNAME[t.a.sec]+') matches the event’s sector.<small>A timing flag computed from public data, not a claim about intent or non-public information.</small></div>';
  else if(ev)why='<div class="why" style="background:var(--surface-2);border-color:var(--line)">Executed '+(Math.abs(t.evd)<1?'less than a day':Math.round(Math.abs(t.evd))+' days')+(t.evd<0?' before':' after')+' “'+ev.title+'” — same sector, not flagged'+(t.evd<0?(ev.up?' because the event was publicly scheduled':' because it is outside this event’s window'):'')+'.</div>';
  if(t.gap){const f=firstAfter(ev);why+='<div class="why" style="background:var(--surface-2);border-color:var(--ink-3);border-style:dashed"><b style="color:var(--ink)">◇ Before first statement</b> — executed '+relH(t.exec-ev.t)+' after the event, before the first public statement ('+f.ch+', '+relH(f.t-ev.t)+').</div>'}
  if(ev)why+='<div style="margin-top:10px"><button class="btn" id="openev">Open event: '+ev.title+'</button></div>';
  $('drawer').innerHTML='<button class="btn x" id="dclose">Close</button>'+
    '<div class="dh"><div class="eyebrow">T'+e.tier+' '+TIERS[e.tier]+' · '+e.role+'</div><h3 id="d-title">'+e.name+' '+lab+' '+sizeTxt(t)+' of '+t.a.t+'</h3><p>'+t.a.name+' · '+t.a.cls+'</p></div>'+
    '<dl class="facts">'+[
      ['Executed',dtfmt.format(t.exec)],['Disclosed',dtfmt.format(t.disc)],['Filing lag',lagTxt(t.disc-t.exec)],
      ['Size',t.lo!=null?sizeTxt(t)+' (range)':t.amt>0?K(t.amt)+' (exact)':'not stated'],['Source',SRC[t.src].label],
      [t.src==='onchain'?'Wallet match':'Transaction code',t.src==='onchain'?['','Low','Medium','High'][t.conf]:(t.code||'—')]
    ].map(f=>'<div><dt>'+f[0]+'</dt><dd>'+f[1]+'</dd></div>').join('')+'</dl>'+why+
    '<div class="dsec"><h4>'+e.name+' · all trades ±45 days</h4><div id="tlwrap"></div><div class="legend"><span><i class="sw" style="background:var(--buy)"></i>▲ Buy (above line)</span><span><i class="sw" style="background:var(--sell)"></i>▼ Sell (below)</span><span><i class="sw" style="background:var(--ink-3)"></i>Transfer</span><span><i class="sw" style="background:var(--flag);border-radius:1px"></i>Policy event, '+SECNAME[t.a.sec]+'</span></div></div>'+
    '<div class="dsec"><h4>Source</h4><div class="srcbox"><span>'+SRC[t.src].via+(t.tx?' · tx <span class="mono">'+esc(t.tx)+'</span>':'')+'</span><a href="'+esc(t.url||SRC[t.src].url)+'" target="_blank" rel="noopener">'+(t.url?'Open filing':'Open '+SRC[t.src].label)+' ↗</a></div></div>';
  $('scrim').hidden=false;$('drawer').hidden=false;$('drawer').scrollTop=0;$('dclose').onclick=closeDrawer;$('dclose').focus();
  if($('openev'))$('openev').onclick=()=>openEvent(ev.id);
  drawTimeline(t);
}
function closeDrawer(){$('drawer').hidden=true;$('scrim').hidden=true;$('tip').hidden=true;if(lastFocus)lastFocus.focus()}
$('scrim').onclick=closeDrawer;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('drawer').hidden)closeDrawer()});

function drawTimeline(t){
  const W=580,Ht=170,pl=14,pr=14,mid=86;
  const x0=t.exec-45*D,x1=Math.min(t.exec+45*D,Date.now()+12*D);
  const X=v=>pl+(v-x0)/(x1-x0)*(W-pl-pr);
  const trs=TRADES.filter(o=>o.eid===t.eid&&o.exec>=x0&&o.exec<=x1);
  const evs=EVENTS.filter(v=>v.sec===t.a.sec&&v.t>=x0&&v.t<=x1);
  const r=a=>Math.max(4,Math.min(10,2+Math.log10(a)*1.2));
  let s='<svg class="tl" viewBox="0 0 '+W+' '+Ht+'" role="img" aria-label="Timeline of trades and policy events">';
  // ticks
  for(let d=Math.ceil(x0/(15*D))*15*D;d<=x1;d+=15*D){const x=X(d);s+='<line x1="'+x+'" x2="'+x+'" y1="16" y2="'+(Ht-24)+'" stroke="var(--line)" stroke-width="1"/><text x="'+x+'" y="'+(Ht-8)+'" fill="var(--ink-3)" font-size="10.5" text-anchor="middle" font-family="IBM Plex Mono, monospace">'+dfmt.format(d)+'</text>'}
  const nx=X(Date.now());if(nx<W-pr)s+='<line x1="'+nx+'" x2="'+nx+'" y1="10" y2="'+(Ht-24)+'" stroke="var(--ink-3)" stroke-dasharray="2 3"/><text x="'+(nx-4)+'" y="12" fill="var(--ink-3)" font-size="10" text-anchor="end">now</text>';
  s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+mid+'" y2="'+mid+'" stroke="var(--line-2)" stroke-width="1.5"/>';
  evs.forEach(v=>{const x=X(v.t);s+='<g data-tip="'+(v.up?'Scheduled':dfmt.format(v.t))+' · '+v.title.replace(/"/g,'&quot;')+'"><rect x="'+(x-9)+'" y="'+(mid-9)+'" width="18" height="18" fill="transparent"/><rect x="'+(x-5)+'" y="'+(mid-5)+'" width="10" height="10" transform="rotate(45 '+x+' '+mid+')" fill="var(--flag)" stroke="var(--surface)" stroke-width="2"/></g>'});
  trs.forEach(o=>{const x=X(o.exec),rr=r(o.amt);const y=o.side==='buy'?mid-14-rr-(Math.log10(o.amt)-3)*6:o.side==='sell'?mid+14+rr+(Math.log10(o.amt)-3)*6:mid-4-rr;
    const col=o.side==='buy'?'var(--buy)':o.side==='sell'?'var(--sell)':'var(--ink-3)';const me=o.id===t.id;
    s+='<g data-tip="'+dfmt.format(o.exec)+' · '+(o.side==='buy'?'▲ Buy':o.side==='sell'?'▼ Sell':'⇄ Transfer')+' '+o.a.t+' '+sizeTxt(o)+'"><circle cx="'+x+'" cy="'+y+'" r="'+(rr+6)+'" fill="transparent"/>'+(me?'<circle cx="'+x+'" cy="'+y+'" r="'+(rr+4)+'" fill="none" stroke="var(--ink)" stroke-width="2"/>':'')+'<circle cx="'+x+'" cy="'+y+'" r="'+rr+'" fill="'+col+'" stroke="var(--surface)" stroke-width="2"/></g>'});
  s+='</svg>';
  const w=$('tlwrap');w.innerHTML=s;attachTip(w);
}
function attachTip(w){const tip=$('tip');
  w.onmousemove=e=>{const g=e.target.closest('[data-tip]');if(!g){tip.hidden=true;return}tip.textContent=g.getAttribute('data-tip');tip.hidden=false;
    const tx=Math.min(e.clientX+12,window.innerWidth-tip.offsetWidth-8);tip.style.left=tx+'px';tip.style.top=(e.clientY+14)+'px'};
  w.onmouseleave=()=>tip.hidden=true;}
const esc=x=>String(x).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const WPRE=[3,7,10,14,30],WPOST=[1,3,7,14];
function openEvent(id){
  const ev=EV[id];if(!ev)return;if($('drawer').hidden)lastFocus=document.activeElement;
  const r=rel(ev),fa=firstAfter(ev);
  const inWin=TRADES.filter(t=>{if(t.a.sec!==ev.sec)return false;const d=(t.exec-ev.t)/D;return d>=-ev.pre&&d<=ev.post}).sort((a,b)=>a.exec-b.exec);
  const before=inWin.filter(t=>t.exec<ev.t),after=inWin.filter(t=>t.exec>=ev.t);
  const gap=fa?after.filter(t=>t.exec<fa.t):[];
  const nb=before.reduce((s,t)=>s+(t.side==='buy'?t.amt:t.side==='sell'?-t.amt:0),0);
  const withMv=ev.st.filter(x=>x.mv!=null);const big=withMv.length?withMv.reduce((m,x)=>Math.abs(x.mv)>Math.abs(m.mv)?x:m):null;
  const tl=ev.type.toLowerCase();
  const segs=(sid,arr,cur)=>'<div class="seg" id="'+sid+'">'+arr.map(v=>'<button type="button" data-v="'+v+'" aria-pressed="'+(v===cur)+'">'+v+'d</button>').join('')+'</div>';
  const changed=ev.pre!==ev.dpre||ev.post!==ev.dpost;
  $('drawer').innerHTML='<button class="btn x" id="dclose">Close</button>'+
    '<div class="dh"><div class="eyebrow">'+ev.type+' · '+SECNAME[ev.sec]+'</div><h3 id="d-title">'+ev.title+'</h3><p>'+(ev.up?'Scheduled for '+dfmt.format(ev.t)+' · '+ageTxt(ev):dfmt.format(ev.t)+' · '+ageTxt(ev))+(ev.url?' · <a href="'+esc(ev.url)+'" target="_blank" rel="noopener">Source ↗</a>':'')+'</p></div>'+
    (ev.up?'<div class="relrow"><span>Publicly scheduled, so trades before it are shown but never flagged pre-event.</span></div>':'<div class="relrow">'+meter(r)+'<span><b style="color:var(--ink)">Relevance '+Math.round(r*100)+'%</b> · halves every '+ev.hl+' days for '+tl+'s</span></div>')+
    '<div class="dsec"><h4>Window for this event</h4><div class="wrow"><span>Before</span>'+segs('w-pre',WPRE,ev.pre)+'<span>After</span>'+segs('w-post',WPOST,ev.post)+
      (changed?'<button class="btn" id="w-reset">Reset to −'+ev.dpre+'d / +'+ev.dpost+'d</button>':'<span class="muted">default for '+tl+'s</span>')+'</div></div>'+
    '<dl class="facts f4">'+[
      ['Trades before',before.length+(before.length?' · '+(nb>=0?'+':'−')+K(Math.abs(nb)):'')],
      ['Trades after',String(after.length)],
      ['Before 1st statement',fa?gap.length+' trade'+(gap.length===1?'':'s'):(ev.up?'—':'no statement yet')],
      ['Biggest reaction',big?big.ref+' '+(big.mv>0?'▲ +':'▼ ')+Math.abs(big.mv).toFixed(1)+'% / 1h':'—']
    ].map(f=>'<div><dt>'+f[0]+'</dt><dd>'+f[1]+'</dd></div>').join('')+'</dl>'+
    '<div class="dsec"><h4>Trades, event and statements</h4><div id="tlwrap"></div><div class="legend"><span><i class="sw" style="background:var(--buy)"></i>▲ Buy</span><span><i class="sw" style="background:var(--sell)"></i>▼ Sell</span><span><i class="sw" style="background:var(--ink-3)"></i>Transfer</span><span><i class="sw" style="background:var(--flag);border-radius:1px"></i>Event</span><span><i class="sw" style="background:var(--ink);border-radius:2px"></i>Public statement</span><span><i class="sw" style="background:var(--surface-2);border:1px solid var(--line-2);border-radius:2px"></i>Window</span></div></div>'+
    '<div class="dsec"><h4>Public statements linked to this event</h4>'+(ev.st.length?'<ul class="stl">'+ev.st.map(x=>'<li><div class="sth"><span class="chn">'+x.ch+'</span><span class="mono dlt">'+relH(x.t-ev.t)+(x.t<ev.t?' before':' after')+'</span><span class="who">'+x.who+'</span></div><q>'+esc(x.q)+'</q><div class="stm"><span>via '+x.via+' · '+dtfmt.format(x.t)+'</span>'+(x.mv!=null?'<span class="mono">'+x.ref+' '+(x.mv>0?'▲ +':'▼ ')+Math.abs(x.mv).toFixed(1)+'% in 1h</span>':'')+'</div></li>').join('')+'</ul>':'<p class="muted">'+(ev.up?'Nothing yet. Statements are linked automatically as they appear.':'No linked statements.')+'</p>')+'</div>'+
    '<div class="dsec"><h4>Same-sector trades in window · '+inWin.length+'</h4>'+(inWin.length?'<ul class="twl">'+inWin.map(t=>{const pre=t.exec<ev.t&&!ev.up,g=fa&&t.exec>=ev.t&&t.exec<fa.t;
      return '<li tabindex="0" data-id="'+t.id+'"><span class="mono dlt">'+relH(t.exec-ev.t)+'</span><span><b>'+ENT[t.eid].name+'</b> '+sideHtml(t.side)+' <span class="tk">'+t.a.t+'</span></span><span class="mono">'+sizeTxt(t)+'</span><span class="fl">'+(pre?'<span class="flag">◆ pre-event</span>':'')+(g?'<span class="gapf">◇ before 1st statement</span>':'')+'</span></li>'}).join('')+'</ul>':'<p class="muted">No same-sector trades in this window yet.'+(ev.t>Date.now()-45*D&&!ev.up?' Congressional and OGE filings for it can still arrive (up to 45 days after the trade).':'')+'</p>')+'</div>'+
    '<div class="dsec"><button class="btn" id="evfilter">'+(S.event===ev.id?'Clear feed filter':'Show only this event in the feed')+'</button></div>';
  $('scrim').hidden=false;$('drawer').hidden=false;$('drawer').scrollTop=0;$('dclose').onclick=closeDrawer;$('dclose').focus();
  const setW=(k,v)=>{ev[k]=v;relinkAll();render();const st=$('drawer').scrollTop;openEvent(id);$('drawer').scrollTop=st};
  $('w-pre').onclick=e=>{const b=e.target.closest('button');if(b)setW('pre',+b.dataset.v)};
  $('w-post').onclick=e=>{const b=e.target.closest('button');if(b)setW('post',+b.dataset.v)};
  if($('w-reset'))$('w-reset').onclick=()=>{ev.post=ev.dpost;setW('pre',ev.dpre)};
  $('evfilter').onclick=()=>{S.event=S.event===ev.id?null:ev.id;S.limit=40;closeDrawer();render()};
  const tw=$('drawer').querySelector('.twl');if(tw)act(tw,'li[data-id]',li=>openDrawer(li.dataset.id));
  drawEventTimeline(ev);
}
function drawEventTimeline(ev){
  const W=580,Ht=200,pl=14,pr=14,mid=118,sy=34;
  const last=ev.st.length?ev.st[ev.st.length-1].t:ev.t,first=ev.st.length?ev.st[0].t:ev.t;
  const x0=Math.min(ev.t-(ev.pre+1.5)*D,first-.5*D),x1=Math.max(ev.t+(ev.post+1.5)*D,last+.5*D);
  const X=v=>pl+(v-x0)/(x1-x0)*(W-pl-pr);
  const span=(x1-x0)/D,step=(span>40?10:span>18?5:span>8?2:1)*D;
  let s='<svg class="tl" viewBox="0 0 '+W+' '+Ht+'" role="img" aria-label="Trades, event and statements around '+esc(ev.title)+'">';
  const wx0=X(ev.t-ev.pre*D),wx1=X(Math.min(ev.t+ev.post*D,x1));
  s+='<rect x="'+wx0+'" y="'+(sy+14)+'" width="'+(wx1-wx0)+'" height="'+(Ht-24-sy-14)+'" fill="var(--surface-2)"/>';
  for(let d=Math.ceil(x0/step)*step;d<=x1;d+=step){const x=X(d);s+='<line x1="'+x+'" x2="'+x+'" y1="'+(sy+14)+'" y2="'+(Ht-24)+'" stroke="var(--line)"/><text x="'+x+'" y="'+(Ht-8)+'" fill="var(--ink-3)" font-size="10.5" text-anchor="middle" font-family="IBM Plex Mono, monospace">'+dfmt.format(d)+'</text>'}
  const nx=X(Date.now());if(nx>pl&&nx<W-pr)s+='<line x1="'+nx+'" x2="'+nx+'" y1="'+(sy+10)+'" y2="'+(Ht-24)+'" stroke="var(--ink-3)" stroke-dasharray="2 3"/><text x="'+(nx-4)+'" y="'+(Ht-30)+'" fill="var(--ink-3)" font-size="10" text-anchor="end">now</text>';
  s+='<text x="'+pl+'" y="14" fill="var(--ink-3)" font-size="10" letter-spacing=".08em">STATEMENTS</text>';
  s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+mid+'" y2="'+mid+'" stroke="var(--line-2)" stroke-width="1.5"/>';
  ev.st.forEach(x=>{const cx=X(x.t);s+='<g data-tip="'+relH(x.t-ev.t)+' · '+x.ch+' · “'+esc(x.q)+'”'+(x.mv!=null?' · '+x.ref+' '+(x.mv>0?'+':'−')+Math.abs(x.mv).toFixed(1)+'% in 1h':'')+'"><line x1="'+cx+'" x2="'+cx+'" y1="'+(sy+6)+'" y2="'+mid+'" stroke="var(--ink-3)" stroke-dasharray="2 3"/><rect x="'+(cx-10)+'" y="'+(sy-10)+'" width="20" height="20" fill="transparent"/><rect x="'+(cx-6)+'" y="'+(sy-6)+'" width="12" height="12" rx="2" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/></g>'});
  const ex=X(ev.t);s+='<g data-tip="'+esc(ev.title)+'"><rect x="'+(ex-7)+'" y="'+(mid-7)+'" width="14" height="14" transform="rotate(45 '+ex+' '+mid+')" fill="var(--flag)" stroke="var(--surface)" stroke-width="2"/></g>';
  const r=a=>Math.max(4,Math.min(10,2+Math.log10(a)*1.2));
  TRADES.filter(o=>o.a.sec===ev.sec&&o.exec>=x0&&o.exec<=x1).forEach(o=>{const x=X(o.exec),rr=r(o.amt);
    const y=o.side==='buy'?mid-12-rr-(Math.log10(o.amt)-3)*5:o.side==='sell'?mid+12+rr+(Math.log10(o.amt)-3)*4:mid-4-rr;
    const d=(o.exec-ev.t)/D,inw=d>=-ev.pre&&d<=ev.post;
    const col=o.side==='buy'?'var(--buy)':o.side==='sell'?'var(--sell)':'var(--ink-3)';
    s+='<g data-tip="'+relH(o.exec-ev.t)+' · '+esc(ENT[o.eid].name)+' · '+(o.side==='buy'?'▲ Buy':o.side==='sell'?'▼ Sell':'⇄ Transfer')+' '+o.a.t+' '+sizeTxt(o)+(inw?'':' (outside window)')+'" opacity="'+(inw?1:.35)+'"><circle cx="'+x+'" cy="'+y+'" r="'+(rr+6)+'" fill="transparent"/><circle cx="'+x+'" cy="'+y+'" r="'+rr+'" fill="'+col+'" stroke="var(--surface)" stroke-width="2"/></g>'});
  s+='</svg>';
  const w=$('tlwrap');w.innerHTML=s;attachTip(w);
}

/* ---------- health + live ---------- */
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


  $('signout').onclick=async()=>{await sb.auth.signOut();location.href='/login'};
  const {data:{user}}=await sb.auth.getUser();$('me').textContent=user?.email||'';
  $('tbody').innerHTML='<tr><td colspan="9"><div class="loading">Loading filings…</div></td></tr>';
  try{await loadAll()}catch(err){$('tbody').innerHTML='<tr><td colspan="9"><div class="empty">Could not load data: '+esc(err.message||err)+'</div></td></tr>';return}
  render();renderHealth();subscribeLive();
}
