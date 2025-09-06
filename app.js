/* Лут v3.2 — мобильные улучшения + установка PWA по-умному:
   - На мобильных CR и d20 → select (без клавиатуры и без авто-зумма).
   - Всем полям задан шрифт 16px (CSS) → iOS не зумит.
   - После генерации: blur() активного поля и scrollIntoView() к результату.
   - Секция установки PWA скрыта по умолчанию. Появляется, когда реально есть beforeinstallprompt.
     На iOS — показываем короткий хинт. В режиме standalone — скрываем совсем.
   - Вкладка «Инструкция» удалена.
*/

const LS_KEYS = {
  ITEMS: 'lootgen_items_override',
  GEMS: 'lootgen_gems_override',
  TABLES: 'lootgen_tables_override',
  HISTORY: 'lootgen_history',
  SETTINGS: 'lootgen_settings',
  MUSIC: 'lootgen_music_settings'
};

const DEFAULT_SETTINGS = { hardness: 1.0, maxItems: 1 };

const STATE = {
  data: { items: [], gems: null, tables: null, music: null },
  settings: { ...DEFAULT_SETTINGS },
  deferredPrompt: null,
  lastResult: null,
  music: { categories: [], tracks: [], filtered: [], currentIndex: -1, shuffle: false, loop: false, volume: 0.8, currentCategory: null },
  isMobile: false
};

const RARITY_MAP = { ordinary:'обычный', rare:'редкий', very_rare:'очень редкий', legendary:'легендарный' };
const RARITY_ORDER = ['legendary','very_rare','rare','ordinary'];

const ENVELOPES = {
  mob:   { coins_1:0.85, items_1:0.13, coins_20:0.50, items_20:0.40 },
  chest: { coins_1:0.60, items_1:0.30, coins_20:0.35, items_20:0.45 }
};
const FLOOR = { coinFloorPctTotal:0.05, coinFloorMinZm:1, overflowAllowancePct:0.10 };

const $  = (s,el=document)=> el.querySelector(s);
const $$ = (s,el=document)=> Array.from(el.querySelectorAll(s));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const randInt=(min,max)=>Math.floor(Math.random()*(max-min+1))+min;
const rollDice=(n,s)=>{let t=0; for(let i=0;i<n;i++) t+=randInt(1,s); return t;};
const lerp=(a,b,t)=>a+(b-a)*t;
const prettyJson=o=>JSON.stringify(o,null,2);
const formatGP=n=>Number(n.toFixed(2)).toString();

function downloadFile(filename, text){
  const blob = new Blob([text], {type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function shuffleInPlace(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
function loadFromLS(k,f=null){ try{const v=localStorage.getItem(k); return v?JSON.parse(v):f;}catch{return f;} }
function saveToLS(k,v){ localStorage.setItem(k, JSON.stringify(v)); }

/* ---------- fetch + data ---------- */
async function fetchJson(path){ const r=await fetch(path); if(!r.ok) throw new Error(`fetch ${path} ${r.status}`); return r.json(); }
async function loadData(){
  const [itemsBase,gemsBase,tablesBase,musicBase] = await Promise.all([
    fetchJson('./data/items.json'),
    fetchJson('./data/gems.json'),
    fetchJson('./data/tables.json'),
    fetchJson('./data/music.json').catch(()=>({categories:[],tracks:[]}))
  ]);
  const itemsOverride  = loadFromLS(LS_KEYS.ITEMS, null);
  const gemsOverride   = loadFromLS(LS_KEYS.GEMS, null);
  const tablesOverride = loadFromLS(LS_KEYS.TABLES, null);

  STATE.data.items  = Array.isArray(itemsOverride)?itemsOverride:itemsBase;
  STATE.data.gems   = gemsOverride && gemsOverride.small ? gemsOverride : gemsBase;
  STATE.data.tables = tablesOverride && tablesOverride.tiers ? tablesOverride : tablesBase;
  STATE.data.music  = musicBase;
}

/* ---------- монеты ---------- */
const COIN_TABLE = [
  { label:'0-1',  dice:[1,6], mult:1 },
  { label:'2-3',  dice:[2,6], mult:1 },
  { label:'4-5',  dice:[3,6], mult:5 },
  { label:'6-7',  dice:[4,6], mult:10 },
  { label:'8-10', dice:[5,6], mult:15 },
  { label:'11-13',dice:[6,6], mult:25 },
  { label:'14-16',dice:[8,6], mult:40 },
  { label:'17+',  dice:[10,6],mult:75 },
];
const coinsForLabel = label=> COIN_TABLE.find(r=>r.label===label) || COIN_TABLE[0];
function coinsRollForLabel(label){ const row=coinsForLabel(label); const [n,s]=row.dice; return rollDice(n,s)*row.mult; }
function splitCoins(totalGP){
  let gpRemain=totalGP;
  const pm=Math.floor(gpRemain*0.05/10); gpRemain-=pm*10;
  const sm=Math.floor(gpRemain*0.25*10);
  const zm=Math.floor(gpRemain*0.70);
  const mm=Math.floor(totalGP*0.05*100);
  return { pm, zm, sm, mm };
}

/* ---------- Tier / Hoard ---------- */
function findTierByCR(cr){ const t=STATE.data.tables.tiers; for(const x of t){ if(cr>=x.min_cr && cr<=x.max_cr) return x; } return t[t.length-1]; }
function getTierByLabel(label){ return STATE.data.tables.tiers.find(t=>t.label===label) ?? STATE.data.tables.tiers[0]; }
function hoardBandForTierLabel(label){
  if(['0-1','2-3','4-5'].includes(label)) return '0-4';
  if(['6-7','8-10'].includes(label)) return '5-10';
  if(['11-13','14-16'].includes(label)) return '11-16';
  return '17+';
}

/* ---------- d20 / редкость ---------- */
function getMultipliersForD20(d20){
  const v=clamp(Number(d20)||1,1,20);
  if(v===1) return {budget:0.60, coins:0.10};
  if(v<=5)  return {budget:0.75, coins:0.30};
  if(v<=10) return {budget:0.90, coins:0.60};
  if(v<=15) return {budget:1.10, coins:1.00};
  if(v<=19) return {budget:1.25, coins:1.30};
  return {budget:1.40, coins:1.50};
}
function tiltRarityByD20(baseChance, d20, allowed){
  const p={ ordinary:baseChance.ordinary||0, rare:baseChance.rare||0, very_rare:baseChance.very_rare||0, legendary:baseChance.legendary||0 };
  const v=clamp(Number(d20)||1,1,20);
  if(v===1){ p.ordinary=1; p.rare=p.very_rare=p.legendary=0; }
  else if(v<=5){ const r0=p.rare, vr0=p.very_rare, l0=p.legendary; p.rare*=0.5; p.very_rare*=0.5; p.legendary=0; const freed=(r0-p.rare)+(vr0-p.very_rare)+l0; p.ordinary+=freed; }
  else if(v>=16 && v<=19){ const move=Math.min(p.ordinary,p.ordinary*0.30); p.ordinary-=move; p.rare+=move*0.60; p.very_rare+=move*0.40; }
  else if(v===20){ let move=Math.min(p.ordinary,p.ordinary*0.40); p.ordinary-=move; p.rare+=move*0.60; p.very_rare+=move*0.40; if(allowed.legendary){ const addL=0.05; if(p.ordinary>=addL)p.ordinary-=addL,p.legendary+=addL; else if(p.rare>=addL)p.rare-=addL,p.legendary+=addL; else if(p.very_rare>=addL)p.very_rare-=addL,p.legendary+=addL; } }
  for(const k of Object.keys(p)){ if(!allowed[k]) p[k]=0; p[k]=Math.max(0,p[k]); }
  const s=p.ordinary+p.rare+p.very_rare+p.legendary;
  if(s>0){ for(const k of Object.keys(p)) p[k]/=s; } else { p.ordinary=1; p.rare=p.very_rare=p.legendary=0; }
  return p;
}
function sampleRarity(ch){ const r=Math.random(); let a=0; for(const k of ['ordinary','rare','very_rare','legendary']){ a+=(ch[k]??0); if(r<a) return k; } return 'ordinary'; }

/* ---------- gems ---------- */
function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function rareGemCapForBand(b){ if(b==='0-4')return 0; if(b==='5-10')return 250; if(b==='11-16')return 500; return Infinity; }
function rareGemBaseChanceForBand(b){ if(b==='0-4')return 0; if(b==='5-10')return 0.12; if(b==='11-16')return 0.20; return 0.30; }
function d20RareModifier(v){ v=clamp(Number(v)||1,1,20); if(v===1)return 0; if(v<=5)return 0.3; if(v<=10)return 0.7; if(v<=15)return 1.0; if(v<=19)return 1.2; return 1.5; }
function maybeSmallGems(tierLbl, cap){
  const base=0.40, bump=['8-10','11-13','14-16','17+'].includes(tierLbl)?0.1:0;
  const picks=[];
  if(Math.random()<base+bump){ const cnt=randInt(1,2); for(let i=0;i<cnt;i++) picks.push({...pickRandom(STATE.data.gems.small)}); }
  picks.sort((a,b)=>b.value_gp-a.value_gp);
  let sum=picks.reduce((s,g)=>s+g.value_gp,0);
  while(sum>cap && picks.length){ picks.shift(); sum=picks.reduce((s,g)=>s+g.value_gp,0); }
  return picks;
}
function maybeRareGemsControlled(tierLbl, d20, cap){
  const band=hoardBandForTierLabel(tierLbl);
  const gemCap=Math.min(cap, rareGemCapForBand(band));
  if(gemCap<=0) return [];
  let chance=rareGemBaseChanceForBand(band)*d20RareModifier(d20);
  if(Math.random()<chance){
    const pool=STATE.data.gems.rare.filter(g=>(g.value_gp||0)<=gemCap);
    if(!pool.length) return [];
    return [{...pickRandom(pool)}];
  }
  return [];
}

/* ---------- предметы ---------- */
function rarityAllowedForTier(k, ch){ return (ch[k]??0)>0; }
function filterCandidates(source, tierObj, rarityKey){
  const rarRu=RARITY_MAP[rarityKey], maxTier=tierObj.max_cr;
  return STATE.data.items.filter(it=>{
    const tierOk= typeof it.tier==='number' ? it.tier<=maxTier : true;
    const srcOk= Array.isArray(it.loot_source) ? it.loot_source.includes(source) : true;
    const rarOk=(it.rarity||'').toLowerCase()===rarRu;
    return tierOk && srcOk && rarOk;
  });
}
function pickByD20(list, d20){ if(!list.length) return null; const idx=(clamp(d20,1,20)-1)%list.length; return list[idx]; }

/* ---------- конверты ---------- */
function getEnvelopeShares(source,d20){
  const t=(clamp(Number(d20)||1,1,20)-1)/19;
  const cfg= source==='mob'?ENVELOPES.mob:ENVELOPES.chest;
  const coins=lerp(cfg.coins_1,cfg.coins_20,t);
  const items=lerp(cfg.items_1,cfg.items_20,t);
  const gems =Math.max(0,1-coins-items);
  return {coins,items,gems};
}

/* ---------- генерация ---------- */
function generateLoot({ source, cr=null, containerSize=null, selectedTierLabel=null, d20=null, isBoss=false }){
  const settings=STATE.settings||DEFAULT_SETTINGS;
  const D20=clamp(Number(d20)||1,1,20);
  const {budget:budgetMul, coins:coinsMul}=getMultipliersForD20(D20);

  const tierObj = source==='mob'? findTierByCR(cr) : getTierByLabel(selectedTierLabel);
  const allowed = {
    ordinary:(tierObj.chance.ordinary||0)>0,
    rare:(tierObj.chance.rare||0)>0,
    very_rare:(tierObj.chance.very_rare||0)>0,
    legendary:(tierObj.chance.legendary||0)>0
  };

  let baseBudget;
  if(source==='mob'){ baseBudget=tierObj.budget_gp; }
  else { const band=hoardBandForTierLabel(tierObj.label); baseBudget=(STATE.data.tables.hoard_bands?.[band]) ?? tierObj.budget_gp; }
  let budget=Math.round(baseBudget*budgetMul*(settings.hardness??1.0));
  if(source==='mob' && isBoss) budget=Math.round(budget*2.0);

  const shares=getEnvelopeShares(source,D20);
  let coinsCap=Math.round(budget*shares.coins);
  let itemsCap=Math.round(budget*shares.items);
  let gemsCap =Math.round(budget*shares.gems);

  let rolledCoins=coinsRollForLabel(tierObj.label);
  if(source!=='mob'){ const mult=(STATE.data.tables.containers?.[containerSize]?.coin_multiplier)??1; rolledCoins=Math.round(rolledCoins*mult); }
  rolledCoins=Math.round(rolledCoins*coinsMul*(settings.hardness??1.0));
  if(source==='mob' && isBoss) rolledCoins=Math.round(rolledCoins*2.0);
  let coins=Math.min(rolledCoins, coinsCap);

  const tilted=tiltRarityByD20(tierObj.chance,D20,allowed);
  let rarityKey=sampleRarity(tilted);
  if(!rarityAllowedForTier(rarityKey,tierObj.chance)){
    for(const k of RARITY_ORDER.slice().reverse()){ if(rarityAllowedForTier(k,tierObj.chance)){ rarityKey=k; break; } }
  }
  let candidates=filterCandidates(source,tierObj,rarityKey);
  if(!candidates.length){
    for(const k of RARITY_ORDER.slice().reverse()){
      if(!rarityAllowedForTier(k,tierObj.chance)) continue;
      const alt=filterCandidates(source,tierObj,k);
      if(alt.length){ rarityKey=k; candidates=alt; break; }
    }
  }
  shuffleInPlace(candidates);
  const items=[];
  if(candidates.length){ const first=pickByD20(candidates,D20); if(first) items.push(first); }
  const maxItems=STATE.settings.maxItems??1;
  while(items.length<maxItems){ break; }

  const smallGems=maybeSmallGems(tierObj.label,gemsCap);
  const smallVal =smallGems.reduce((s,g)=>s+g.value_gp,0);
  const rareGems =maybeRareGemsControlled(tierObj.label,D20,Math.max(0,gemsCap-smallVal));
  const rareVal  =rareGems.reduce((s,g)=>s+g.value_gp,0);

  const itemsValue=items.reduce((s,it)=>s+(Number(it.value_gp)||0),0);
  const coinFloorFromPct=Math.round(budget*(FLOOR.coinFloorPctTotal||0));
  const coinFloor=Math.max(coinFloorFromPct, FLOOR.coinFloorMinZm||0);
  const overflowAllowance=Math.round(budget*(FLOOR.overflowAllowancePct||0));

  if(itemsValue>itemsCap){
    const need=itemsValue-itemsCap;
    const canBorrow=Math.max(0, coins-coinFloor);
    const take=Math.min(need, canBorrow);
    coins-=take; itemsCap+=take;
  }

  let total=coins+itemsValue+smallVal+rareVal;
  if(total>budget+overflowAllowance){
    const needReduce=total-(budget+overflowAllowance);
    coins=Math.max(coinFloor, coins-needReduce);
    total=coins+itemsValue+smallVal+rareVal;
  }

  return {
    input:{source,cr,containerSize,tier:tierObj.label,d20:D20,boss:!!isBoss},
    budget_gp:budget,
    envelopes:{shares,caps:{coins:coinsCap,items:itemsCap,gems:gemsCap},coin_floor:coinFloor,overflow_allowance:overflowAllowance},
    coins_gp:Number(coins.toFixed(2)),
    coins_breakdown:splitCoins(coins),
    items:items.map(({id,name,type,rarity,value_gp,description})=>({id,name,type,rarity,value_gp,description})),
    smallGems, rareGems,
    totalValue_gp:Number((coins+itemsValue+smallVal+rareVal).toFixed(2))
  };
}

/* ---------- история / рендер ---------- */
function getHistory(){ return loadFromLS(LS_KEYS.HISTORY, []); }
function setHistory(list){ saveToLS(LS_KEYS.HISTORY, list); }
function addToHistory(entry){ const l=getHistory(); l.unshift({ts:Date.now(),...entry}); if(l.length>100) l.length=100; setHistory(l); renderHistory(); }

function renderResult(res){
  STATE.lastResult=res;

  const coinsList=$('#coinsList'); coinsList.innerHTML='';
  const {pm,zm,sm,mm}=res.coins_breakdown;
  [['Платиновые монеты (пм)',pm],['Золотые монеты (зм)',zm],['Серебряные монеты (см)',sm],['Медные монеты (мм)',mm]]
    .forEach(([label,val])=>{ const li=document.createElement('li'); li.textContent=`${label}: ${val}`; coinsList.appendChild(li); });

  const itemsList=$('#itemsList'); itemsList.innerHTML='';
  res.items.forEach(it=>{
    const li=document.createElement('li');
    li.innerHTML=`<strong>${it.name}</strong> — ${it.rarity}, ${it.type} <br><span class="hint">~${it.value_gp} gp</span><br><span class="hint">${it.description||''}</span>`;
    itemsList.appendChild(li);
  });
  if(!res.items.length){ const li=document.createElement('li'); li.textContent='—'; itemsList.appendChild(li); }

  const sUl=$('#smallGemsList'); sUl.innerHTML='';
  res.smallGems.forEach(g=>{ const li=document.createElement('li'); li.textContent=`${g.name} (~${g.value_gp} gp)`; sUl.appendChild(li); });
  if(!res.smallGems.length){ const li=document.createElement('li'); li.textContent='—'; sUl.appendChild(li); }

  const rUl=$('#rareGemsList'); rUl.innerHTML='';
  res.rareGems.forEach(g=>{ const li=document.createElement('li'); li.textContent=`${g.name} (~${g.value_gp} gp)`; rUl.appendChild(li); });
  if(!res.rareGems.length){ const li=document.createElement('li'); li.textContent='—'; rUl.appendChild(li); }

  $('#totalValue').textContent = formatGP(res.totalValue_gp);
}
function renderHistory(){
  const list=getHistory(); const ol=$('#historyList'); ol.innerHTML='';
  list.forEach((h,idx)=>{
    const li=document.createElement('li');
    const dt=new Date(h.ts);
    const title=`[${idx+1}] ${dt.toLocaleString()} • ${h.input?.source??'?'} • Tier ${h.input?.tier??'?'} • total ${h.totalValue_gp} gp`;
    li.innerHTML=`<strong>${title}</strong><pre class="mono" style="white-space:pre-wrap">${prettyJson(h)}</pre>`;
    ol.appendChild(li);
  });
}

/* ---------- настройки ---------- */
function loadSettings(){
  STATE.settings={...DEFAULT_SETTINGS, ...(loadFromLS(LS_KEYS.SETTINGS, {}))};
  $('#hardnessRange').value=STATE.settings.hardness;
  $('#hardnessLabel').textContent=`${STATE.settings.hardness.toFixed(1)}×`;
  $('#maxItemsInput').value=STATE.settings.maxItems;

  const m=loadFromLS(LS_KEYS.MUSIC,{});
  STATE.music.shuffle=!!m.shuffle;
  STATE.music.loop=!!m.loop;
  STATE.music.volume=typeof m.volume==='number'?m.volume:0.8;
  STATE.music.currentCategory=m.category||null;
  const vol=clamp(STATE.music.volume,0,1);
  const audio=$('#audio'); if(audio){ audio.volume=vol; $('#volumeRange').value=vol; }
  setBtnActive('#shuffleBtn', STATE.music.shuffle);
  setBtnActive('#loopBtn', STATE.music.loop);
}
function saveSettings(){
  STATE.settings.hardness=Number($('#hardnessRange').value);
  STATE.settings.maxItems=clamp(Number($('#maxItemsInput').value),1,3);
  saveToLS(LS_KEYS.SETTINGS, STATE.settings);
  $('#hardnessLabel').textContent=`${STATE.settings.hardness.toFixed(1)}×`;
  alert('Настройки сохранены.');
}
function resetSettings(){ STATE.settings={...DEFAULT_SETTINGS}; saveToLS(LS_KEYS.SETTINGS, STATE.settings); loadSettings(); }

/* ---------- Музыка ---------- */
function secondsToMMSS(sec){ sec=Math.max(0,Math.round(sec)); const m=Math.floor(sec/60), s=sec%60; return `${m}:${s.toString().padStart(2,'0')}`; }
function setBtnActive(sel,active){ const b=$(sel); if(b) b.classList.toggle('primary', !!active); }
function initMusic(){
  const mdata=STATE.data.music||{categories:[],tracks:[]};
  STATE.music.categories=mdata.categories||[];
  STATE.music.tracks=(mdata.tracks||[]).filter(t=>!!t.file);
  const sel=$('#musicCategory'); if(!sel) return; sel.innerHTML='';
  STATE.music.categories.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });
  let cat=STATE.music.currentCategory||(STATE.music.categories[0]?.id??null);
  if(!STATE.music.categories.find(c=>c.id===cat)){ cat=STATE.music.categories[0]?.id??null; }
  STATE.music.currentCategory=cat; if(cat) sel.value=cat;
  renderTrackList(); updateNowPlaying();
}
function renderTrackList(){
  const cat=STATE.music.currentCategory, ul=$('#trackList'); if(!ul) return; ul.innerHTML='';
  const tracks=STATE.music.tracks.filter(t=>!cat || t.category===cat);
  STATE.music.filtered=tracks;
  tracks.forEach((t,i)=>{
    const li=document.createElement('li'); li.dataset.index=i.toString();
    li.innerHTML=`<span class="title">${t.title}</span><span class="len">${t.length?secondsToMMSS(t.length):''}</span>`;
    if(i===STATE.music.currentIndex) li.classList.add('active');
    li.addEventListener('click',()=>{ STATE.music.currentIndex=i; playCurrentTrack(); renderTrackList(); });
    ul.appendChild(li);
  });
  if(!tracks.length){ const li=document.createElement('li'); li.innerHTML='<span class="title">Нет треков в этой категории</span>'; ul.appendChild(li); }
}
function currentTrack(){ const i=STATE.music.currentIndex; return (i>=0 && i<STATE.music.filtered.length)?STATE.music.filtered[i]:null; }
function playCurrentTrack(){ const t=currentTrack(), audio=$('#audio'); if(!audio) return; if(!t){ audio.pause(); updateNowPlaying(); return; } audio.src=t.file; audio.play().catch(e=>console.warn('audio play error',e)); updateNowPlaying(); }
function updateNowPlaying(){ const t=currentTrack(), label=$('#nowPlaying'); if(label) label.textContent=t?`Сейчас играет: ${t.title}`:'Ничего не играет'; $$('#trackList li').forEach((li,idx)=> li.classList.toggle('active', idx===STATE.music.currentIndex)); }
function musicNext(){ if(!STATE.music.filtered.length) return; if(STATE.music.shuffle){ let n=randInt(0,STATE.music.filtered.length-1); if(STATE.music.filtered.length>1 && n===STATE.music.currentIndex) n=(n+1)%STATE.music.filtered.length; STATE.music.currentIndex=n; } else { STATE.music.currentIndex=(STATE.music.currentIndex+1)%STATE.music.filtered.length; } playCurrentTrack(); renderTrackList(); }
function musicPrev(){ if(!STATE.music.filtered.length) return; if(STATE.music.shuffle){ let n=randInt(0,STATE.music.filtered.length-1); if(STATE.music.filtered.length>1 && n===STATE.music.currentIndex) n=(n+1)%STATE.music.filtered.length; STATE.music.currentIndex=n; } else { STATE.music.currentIndex=(STATE.music.currentIndex-1+STATE.music.filtered.length)%STATE.music.filtered.length; } playCurrentTrack(); renderTrackList(); }

/* ---------- helpers: mobile/inputs/install ---------- */
function detectMobile(){
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  STATE.isMobile = isMobile;
  document.body.classList.toggle('mobile', isMobile);

  // заполнить селекты CR/d20 на мобайле
  if (isMobile){
    const crSel = $('#crSelect'); if (crSel){ crSel.innerHTML=''; for(let i=0;i<=30;i++){ const o=document.createElement('option'); o.value=String(i); o.textContent=String(i); crSel.appendChild(o);} crSel.value='1';}
    const d20Sel = $('#d20Select'); if (d20Sel){ d20Sel.innerHTML=''; for(let i=1;i<=20;i++){ const o=document.createElement('option'); o.value=String(i); o.textContent=String(i); d20Sel.appendChild(o);} }
    const d20SelEnv = $('#d20SelectEnv'); if (d20SelEnv){ d20SelEnv.innerHTML=''; for(let i=1;i<=20;i++){ const o=document.createElement('option'); o.value=String(i); o.textContent=String(i); d20SelEnv.appendChild(o);} }
  }
}
function getCR(){
  return STATE.isMobile ? Number($('#crSelect').value||1) : Number($('#crInput').value||1);
}
function getD20Battle(){
  return STATE.isMobile ? Number($('#d20Select').value||0) : Number($('#d20Input').value||0);
}
function getD20Env(){
  return STATE.isMobile ? Number($('#d20SelectEnv').value||0) : Number($('#d20InputEnv').value||0);
}

function afterGenerateFocusFix(){
  if (document.activeElement && typeof document.activeElement.blur==='function') document.activeElement.blur();
  const card = $('#resultCard'); if (card) setTimeout(()=> card.scrollIntoView({behavior:'smooth', block:'start'}), 60);
}

/* PWA install */
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  STATE.deferredPrompt = e;
  const card = $('#installCard'); const btn = $('#installBtn');
  if (card && btn){
    card.hidden = false;
    btn.hidden = false;
  }
});
function setupInstallHint(){
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const card = $('#installCard'); const hint = $('#installHint'); const btn = $('#installBtn');

  if (isStandalone){ if(card) card.hidden = true; return; }
  if (STATE.deferredPrompt){ return; }
  if (isiOS){
    if (card && hint){ card.hidden = false; hint.hidden = false; if (btn) btn.hidden = true; }
  } else {
    if (card) card.hidden = true;
  }
}
function triggerInstall(){
  if (!STATE.deferredPrompt) return;
  STATE.deferredPrompt.prompt();
  STATE.deferredPrompt.userChoice.finally(()=>{ STATE.deferredPrompt = null; $('#installCard')?.setAttribute('hidden',''); });
}

/* ---------- события ---------- */
function bindEvents(){
  // табы
  $$('.tab').forEach(btn=> btn.addEventListener('click', ()=>{
    // переключение вкладок
    $$('.tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    $$('.mode').forEach(m=>m.classList.remove('visible'));
    const targetId = btn.dataset.tab;
    document.getElementById(targetId).classList.add('visible');

    // показывать/скрывать карточку "Результат": прячем на вкладке Музыка
    const isMusic = targetId === 'mode-music';
    const resultCard = $('#resultCard');
    if (resultCard) resultCard.hidden = isMusic;
  }));

  // генерация лута
  $('#generateBtn').addEventListener('click', ()=>{
    const activeTab=$('.tab.active').dataset.tab;

    if(activeTab==='mode-battle'){
      const cr = clamp(getCR(),0,30);
      const d20 = getD20Battle();
      if(!d20){ alert('Укажите результат d20 (1–20).'); return; }
      const boss=$('#bossCheck').checked;
      const res=generateLoot({source:'mob', cr, d20, isBoss:boss});
      renderResult(res); afterGenerateFocusFix();
    } else if (activeTab==='mode-env'){
      const container=$('#containerSelect').value;
      const label=$('#tierSelect').value;
      const d20=getD20Env();
      if(!d20){ alert('Укажите результат d20 (1–20).'); return; }
      const res=generateLoot({source:'chest', containerSize:container, selectedTierLabel:label, d20});
      renderResult(res); afterGenerateFocusFix();
    } else {
      alert('Вы на вкладке Музыка. Переключитесь на Бой/Окружение для генерации лута.');
    }
  });

  $('#copyBtn').addEventListener('click', ()=>{
    if(!STATE.lastResult){ alert('Сначала сгенерируйте лут.'); return; }
    navigator.clipboard.writeText(prettyJson(STATE.lastResult)).then(()=> alert('Скопировано в буфер.'));
  });
  $('#saveHistoryBtn').addEventListener('click', ()=>{
    if(!STATE.lastResult){ alert('Сначала сгенерируйте лут.'); return; }
    addToHistory(STATE.lastResult); alert('Сохранено в историю.');
  });

  // боковая панель
  $('#menuBtn').addEventListener('click', ()=> $('#sidePanel').classList.add('open'));
  $('#closeMenuBtn').addEventListener('click', ()=> $('#sidePanel').classList.remove('open'));
  $$('.stab').forEach(b=> b.addEventListener('click', ()=>{
    $$('.stab').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    $$('.spanel').forEach(x=>x.classList.remove('visible')); document.getElementById(b.dataset.panel).classList.add('visible');
  }));

  // история
  $('#exportHistoryBtn').addEventListener('click', ()=>{
    const list=getHistory(); const ts=new Date().toISOString().replace(/[:.]/g,'-');
    downloadFile(`loot-history-${ts}.json`, prettyJson(list));
  });
  $('#clearHistoryBtn').addEventListener('click', ()=>{ if(confirm('Очистить историю?')){ setHistory([]); renderHistory(); } });

  // настройки
  $('#hardnessRange').addEventListener('input', ()=> $('#hardnessLabel').textContent=`${Number($('#hardnessRange').value).toFixed(1)}×`);
  $('#saveSettingsBtn').addEventListener('click', saveSettings);
  $('#resetSettingsBtn').addEventListener('click', resetSettings);

  // музыка
  $('#musicCategory')?.addEventListener('change', (e)=>{ STATE.music.currentCategory=e.target.value; saveToLS(LS_KEYS.MUSIC,{...loadFromLS(LS_KEYS.MUSIC,{}),category:STATE.music.currentCategory,shuffle:STATE.music.shuffle,loop:STATE.music.loop,volume:STATE.music.volume}); STATE.music.currentIndex=-1; renderTrackList(); updateNowPlaying(); });
  $('#playBtn')?.addEventListener('click', ()=>{ const audio=$('#audio'); if(!audio) return; if(audio.paused){ if(STATE.music.currentIndex===-1 && STATE.music.filtered.length){ STATE.music.currentIndex=0; } playCurrentTrack(); } else { audio.pause(); } });
  $('#nextBtn')?.addEventListener('click', musicNext);
  $('#prevBtn')?.addEventListener('click', musicPrev);
  $('#shuffleBtn')?.addEventListener('click', ()=>{ STATE.music.shuffle=!STATE.music.shuffle; setBtnActive('#shuffleBtn',STATE.music.shuffle); saveToLS(LS_KEYS.MUSIC,{...loadFromLS(LS_KEYS.MUSIC,{}),category:STATE.music.currentCategory,shuffle:STATE.music.shuffle,loop:STATE.music.loop,volume:STATE.music.volume}); });
  $('#loopBtn')?.addEventListener('click', ()=>{ STATE.music.loop=!STATE.music.loop; setBtnActive('#loopBtn',STATE.music.loop); saveToLS(LS_KEYS.MUSIC,{...loadFromLS(LS_KEYS.MUSIC,{}),category:STATE.music.currentCategory,shuffle:STATE.music.shuffle,loop:STATE.music.loop,volume:STATE.music.volume}); });
  $('#volumeRange')?.addEventListener('input', (e)=>{ const v=clamp(Number(e.target.value)||0.8,0,1); $('#audio').volume=v; STATE.music.volume=v; saveToLS(LS_KEYS.MUSIC,{...loadFromLS(LS_KEYS.MUSIC,{}),category:STATE.music.currentCategory,shuffle:STATE.music.shuffle,loop:STATE.music.loop,volume:v}); });

  // установка PWA
  $('#installBtn').addEventListener('click', triggerInstall);
}

/* ---------- инициализация ---------- */
async function init(){
  detectMobile();
  loadSettings();
  await loadData();
  fillTierSelect();
  renderHistory();
  bindEvents();
  initMusic();
  setupInstallHint();

  // при старте на бою/окружении "Результат" виден
  const resultCard = $('#resultCard');
  if (resultCard) resultCard.hidden = false;
}
init().catch(err=>{
  console.error('Init error', err);
  alert('Ошибка инициализации. Проверьте, что сайт открыт через http(s) (не file://) и JSON доступен.');
});

/* ---------- утилита UI ---------- */
function fillTierSelect(){
  const sel=$('#tierSelect'); if(!sel) return; sel.innerHTML='';
  const hb=STATE.data.tables.hoard_bands||{};
  for(const t of STATE.data.tables.tiers){
    const band=hoardBandForTierLabel(t.label);
    const hoardBudget=hb[band] ?? t.budget_gp;
    const opt=document.createElement('option');
    opt.value=t.label; opt.textContent=`${t.label} (клад ~${hoardBudget} gp)`;
    sel.appendChild(opt);
  }
}
