"use strict";
const TAURI=!!window.__TAURI__,OVERLAY=new URLSearchParams(location.search).get("mode")==="overlay";
const invoke=(c,a)=>window.__TAURI__.core.invoke(c,a);
const acc=c=>c.replace(/ \+ /g,"+").replace("Arrow","");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let RESTORED=false;
let LIM=60,MIR="Ви маєте право зберігати мовчання. Усе, що ви скажете, може бути використано проти вас у суді.\nВи маєте право на адвоката. Якщо ви не можете його собі дозволити, його буде надано державою.\nЧи зрозумілі вам ваші права?";
const FALLBACK={version:"1.1.0",limits:{max_jail_minutes:60},updated_at:"2026-11-02",categories:[
{id:"kk",abbr:"КК",title:"Кримінальний Кодекс (КК)",color:"red",articles:[
{id:"kk-1.1",number:"1.1",title:"Напад на держслужбовця",description:"Замах на життя або здоров’я працівника державних органів під час виконання службових обов’язків.",fine:15000,jail_minutes:30,wanted_level:3,bail:null,tags:["напад","силовики","тяжкий злочин"]},
{id:"kk-1.2",number:"1.2",title:"Погроза держслужбовцю",description:"Словесна або фізична погроза працівнику держоргану при виконанні обов’язків.",fine:6000,jail_minutes:15,wanted_level:2,bail:8000,tags:["погроза","силовики"]},
{id:"kk-2.1",number:"2.1",title:"Незаконне носіння зброї",description:"Зберігання або носіння вогнепальної зброї без ліцензії.",fine:12000,jail_minutes:25,wanted_level:3,bail:20000,extra:"Вилучення ліцензії на зброю",tags:["зброя","ліцензія"]},
{id:"kk-3.1",number:"3.1",title:"Крадіжка транспорту",description:"Таємне або відкрите заволодіння чужим транспортним засобом.",fine:9000,jail_minutes:20,wanted_level:2,bail:12000,tags:["авто","крадіжка"]},
{id:"kk-4.1",number:"4.1",title:"Втеча від правоохоронців",description:"Умисне ухилення від зупинки або затримання.",fine:7000,jail_minutes:15,wanted_level:2,bail:9000,tags:["втеча","погоня"]}]},
{id:"adm",abbr:"АК",title:"Адміністративний Кодекс (АК)",color:"blue",articles:[
{id:"adm-1.1",number:"1.1",title:"Перевищення швидкості",description:"Рух зі швидкістю, що перевищує встановлені обмеження.",fine:1500,jail_minutes:0,wanted_level:0,bail:null,tags:["авто","швидкість","пдр"]},
{id:"adm-1.2",number:"1.2",title:"Проїзд на червоне світло",description:"Порушення сигналу світлофора.",fine:2000,jail_minutes:0,wanted_level:0,bail:null,tags:["авто","світлофор","пдр"]},
{id:"adm-2.1",number:"2.1",title:"Порушення громадського порядку",description:"Нецензурна лайка, хуліганство, створення перешкод у публічному місці.",fine:2500,jail_minutes:5,wanted_level:1,bail:2500,tags:["хуліганство","порядок"]}]},
{id:"tk",abbr:"ТК",title:"Транспортний Кодекс (ТК)",color:"gold",articles:[
{id:"tk-1.1",number:"1.1",title:"Керування без посвідчення",description:"Керування транспортом без чинного водійського посвідчення.",fine:3500,jail_minutes:5,wanted_level:1,bail:3500,extra:"Вилучення транспорту на штрафмайданчик",tags:["авто","права"]},{id:"tk-1.2",number:"1.2",title:"Керування в стані сп’яніння",description:"Керування транспортом під впливом алкоголю чи інших речовин.",fine:0,jail_minutes:0,wanted_level:0,bail:null,extra:"Вилучення водійського посвідчення; Конфіскація транспорту",tags:["авто","сп’яніння"]}]}]};

// ---- локальне сховище ----
// У застосунку дані зберігає Rust у зашифрованих файлах (AES-256-GCM) в AppData; тут лише копія в пам'яті.
// Поза застосунком (перегляд у браузері) використовується звичайний localStorage.
const MEM=Object.create(null);
const store={
  get(k){if(!TAURI){try{return localStorage.getItem(k)}catch(e){return null}}return k in MEM?MEM[k]:null},
  set(k,v){if(!TAURI){try{localStorage.setItem(k,v)}catch(e){}return}MEM[k]=v;invoke("vault_set",{key:k,value:v,src:OVERLAY?"overlay":"main"}).catch(()=>{})},
  del(k){if(!TAURI){try{localStorage.removeItem(k)}catch(e){}return}delete MEM[k];invoke("vault_del",{key:k,src:OVERLAY?"overlay":"main"}).catch(()=>{})}
};
const parse=s=>{try{return s?JSON.parse(s):null}catch(e){return null}};
const later={};
// відкладений запис для повзунків: не пишемо зашифрований файл на кожен піксель руху
function setLater(k,v,ms=300){MEM[k]=v;clearTimeout(later[k]);later[k]=setTimeout(()=>store.set(k,v),ms)}

const $=id=>document.getElementById(id);
const toast=t=>{const e=$("toast");e.textContent=t;e.style.display="block";clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display="none",2200)};
const fmt=n=>"$"+Number(n||0).toLocaleString("uk-UA");
const norm=s=>String(s??"").toLowerCase().replace(/[’ʼ'`]/g,"");
async function copyBtn(btn,text){
  try{await navigator.clipboard.writeText(text)}catch(e){toast("Не вдалося скопіювати");return}
  if(!btn)return;
  if(btn._t)clearTimeout(btn._t);else btn.dataset.o=btn.textContent;
  btn.textContent="✓ Скопійовано!";btn.classList.add("done");
  btn._t=setTimeout(()=>{btn.textContent=btn.dataset.o;btn.classList.remove("done");btn._t=0},1600);
}
async function copy(t){try{await navigator.clipboard.writeText(t);toast("Скопійовано")}catch(e){toast("Не вдалося скопіювати")}}
const abbrOf=t=>{const m=/\(([^)]{1,8})\)/.exec(t);return m?m[1]:(t.split(/\s+/).filter(w=>w.length>2).map(w=>w[0]).join("").slice(0,4).toUpperCase()||"?")};
function setNet(on){$("net").textContent=on?"Онлайн":"Офлайн режим";$("dot").classList.toggle("off",!on)}

// ---- завантаження даних ----
let MAN=null;
const validLaws=d=>!!d&&Array.isArray(d.categories);
const validFaq=d=>!!d&&Array.isArray(d.items);
const validNews=validFaq;
const validCodes=d=>!!d&&Array.isArray(d.codes);
const CODES_URL=typeof DEFAULT_CODES_URL!=="undefined"?DEFAULT_CODES_URL:"";
const TEMPLATES_URL=typeof DEFAULT_TEMPLATES_URL!=="undefined"?DEFAULT_TEMPLATES_URL:"";
const validTpl=d=>!!d&&Array.isArray(d.templates);
async function getManifest(){
  try{const r=await fetch(MANIFEST_URL,{cache:"no-store"});if(r.ok){const m=await r.json();if(m&&typeof m==="object"){store.set("manifest.cache",JSON.stringify(m));return m}}}catch(e){}
  return parse(store.get("manifest.cache"));
}
async function fetchCached(url,key,valid){
  try{if(!url)throw 0;const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw 0;const d=await r.json();if(!valid(d))throw 0;store.set(key,JSON.stringify(d));return{d,src:"net"}}catch(e){}
  const d=parse(store.get(key));return valid(d)?{d,src:"cache"}:{d:null,src:"none"};
}
async function loadAll(manual,prog){
  const p=prog||(()=>{});
  p(40,"Завантаження маніфесту…");MAN=await getManifest();if(MAN)applyManifest(MAN);
  p(55,"Завантаження бази законів…");
  const L=await fetchCached((MAN&&MAN.laws_url)||DEFAULT_LAWS_URL,"laws.cache",validLaws);
  applyDB(L.d||FALLBACK);setNet(L.src==="net");
  if(manual)toast(L.src==="net"?"Базу оновлено до v"+DB.version:L.src==="cache"?"Немає зв’язку. Використано кеш":"Немає зв’язку. Завантажено вбудовану копію");
  p(80,"Завантаження довідника…");
  const F=await fetchCached((MAN&&MAN.faq_url)||DEFAULT_FAQ_URL,"faq.cache",validFaq);applyFaq(F.d);
  if(MAN&&MAN.news_url){const N=await fetchCached(MAN.news_url,"news.cache",validNews);setNews(N.d?N.d.items:[])}else setNews([]);
  const C=await fetchCached((MAN&&MAN.codes_url)||CODES_URL,"codes.cache",validCodes);applyCodes(C.d);
  const TP=await fetchCached((MAN&&MAN.templates_url)||TEMPLATES_URL,"templates.cache",validTpl);applyTemplates(TP.d);
  p(100,"Готово");
}
// Оверлей не робить власних запитів: дані надає головне вікно через спільне зашифроване сховище.
function loadFromStore(){
  const m=parse(store.get("manifest.cache"));if(m){MAN=m;applyManifest(m)}
  const L=parse(store.get("laws.cache"));applyDB(validLaws(L)?L:FALLBACK);
  const F=parse(store.get("faq.cache"));applyFaq(validFaq(F)?F:null);
  const TP=parse(store.get("templates.cache"));applyTemplates(validTpl(TP)?TP:null);
  setNet(navigator.onLine);
}

// ---- кодекси ----
let DB=null,CATS=[],IDX=[];const sel=new Set(),opened=new Set();let inited=false;
function applyDB(d){
  DB=d;LIM=(d.limits&&+d.limits.max_jail_minutes)||60;
  CATS=(d.categories||[]).map(c=>({id:c.id,title:c.title,color:c.color||"",abbr:c.abbr||abbrOf(c.title),
    groups:[...(c.articles&&c.articles.length?[{title:"",articles:c.articles}]:[]),...(c.sections||[]).map(s=>({title:s.title||"",articles:s.articles||[]}))]}));
  if(!inited&&CATS.length){opened.add(CATS[0].id);inited=true}
  $("ver").textContent=d.version;$("upd").textContent=d.updated_at;render();
}
const all=()=>CATS.flatMap(c=>c.groups.flatMap(g=>g.articles.map(a=>({...a,cat:c.title,code:c.abbr,sec:g.title}))));
const picked=()=>all().filter(a=>sel.has(a.id));
// додаткові (нестандартні) санкції: поле extra (або specialPenalty), текст або масив; кілька значень через «;»
function xlist(a){
  const s=a.extra??a.specialPenalty??"";
  return(Array.isArray(s)?s:String(s).split(/[;\n]+/)).map(x=>String(x).trim()).filter(Boolean);
}
function artHtml(a){
  const on=sel.has(a.id),xs=xlist(a);
  const b=a.jail_minutes>0?(a.bail?`<dd class="ok">${fmt(a.bail)}</dd>`:`<dd class="no">Немає</dd>`):`<dd class="no">—</dd>`;
  return `<div class="art ${on?"sel":""}" data-id="${esc(a.id)}" tabindex="0" role="checkbox" aria-checked="${on}"><input type="checkbox" ${on?"checked":""} tabindex="-1" aria-hidden="true"><div class="num">${esc(a.number)}</div><div class="body"><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p>${xs.length?`<div class="xline"><b>Додатково</b>${xs.map(x=>`<span class="xchip">${esc(x)}</span>`).join("")}</div>`:""}${(a.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div><dl class="facts"><div><dt>Штраф</dt><dd>${a.fine?fmt(a.fine):"—"}</dd></div><div><dt>КПЗ</dt><dd>${a.jail_minutes?a.jail_minutes+" хв":"—"}</dd></div><div><dt>Розшук</dt><dd>${"★".repeat(a.wanted_level)||"—"}</dd></div><div><dt>Застава</dt>${b}</div></dl></div>`;
}
function render(){
  let h="";
  for(const c of CATS){
    const n=c.groups.reduce((s,g)=>s+g.articles.length,0),op=opened.has(c.id);
    h+=`<section class="code ${op?"open":""}" data-c="${esc(c.id)}"><button class="code-h" aria-expanded="${op}"><span class="badge ${esc(c.color)}">${esc(c.abbr)}</span><span class="ct">${esc(c.title.replace(/\s*\([^)]{1,8}\)\s*$/,""))}</span><span class="cnt" data-n="${n}">${n} ст.</span><span class="chev">▶</span></button><div class="gb"><div>`;
    for(const g of c.groups){if(g.title)h+=`<div class="sec">${esc(g.title)}</div>`;h+=g.articles.map(artHtml).join("")}
    h+="</div></div></section>";
  }
  $("list").innerHTML=h+'<div class="empty" id="empty" hidden>Нічого не знайдено. Спробуйте інший запит або тег.</div>';
  IDX=all().map(a=>({id:a.id,h:norm([a.cat,a.code,a.sec,a.number,a.title,a.description,...xlist(a),...(a.tags||[])].join(" "))}));
  filter();calc();
}
function filter(){
  const ts=norm($("q").value.trim()).split(/\s+/).filter(Boolean),ok=new Set();
  for(const x of IDX)if(ts.every(t=>x.h.includes(t)))ok.add(x.id);
  let any=false;
  document.querySelectorAll("#list .code").forEach(g=>{
    let n=0;g.querySelectorAll(".art").forEach(el=>{const v=ok.has(el.dataset.id);el.hidden=!v;if(v)n++});
    let sec=null,k=0;[...g.querySelector(".gb>div").children].forEach(el=>{if(el.classList.contains("sec")){if(sec)sec.hidden=!k;sec=el;k=0}else if(!el.hidden)k++});if(sec)sec.hidden=!k;
    g.hidden=!n;g.classList.toggle("force",ts.length>0);
    const c=g.querySelector(".cnt");c.textContent=ts.length?`${n} з ${c.dataset.n}`:`${c.dataset.n} ст.`;if(n)any=true;
  });
  $("empty").hidden=any;
}
let XS=[];
function calc(){
  const p=picked();
  const f=p.reduce((s,a)=>s+a.fine,0),raw=p.reduce((s,a)=>s+a.jail_minutes,0),j=Math.min(raw,LIM),w=Math.min(5,p.reduce((s,a)=>s+a.wanted_level,0));
  const jl=p.filter(a=>a.jail_minutes>0),noBail=jl.some(a=>!a.bail),bail=jl.reduce((s,a)=>s+(a.bail||0),0);
  // усі додаткові санкції вибраних статей одним списком, без повторів
  XS=[];const seen=new Set();for(const a of p)for(const x of xlist(a)){const k=x.toLowerCase();if(!seen.has(k)){seen.add(k);XS.push(x)}}
  $("tf").textContent=f?fmt(f):(p.length?"—":"$0");$("tj").textContent=j+" хв";$("tw").textContent=w?"★".repeat(w):"—";
  const tb=$("tb");tb.className=(!jl.length||noBail)?"no":"";tb.textContent=!jl.length?"—":noBail?"Немає":fmt(bail);
  $("txw").classList.toggle("hide",!XS.length);$("tx").innerHTML=XS.map(x=>`<span class="xchip">${esc(x)}</span>`).join("");
  $("jnote").textContent=raw>LIM?`КПЗ обмежено до ${LIM} хв (сума за статтями: ${raw} хв).`+(noBail?" Заставу не передбачено.":""):(noBail?"Серед обраних є стаття без права на заставу.":"");
  $("picked").textContent=p.length?"Обрано: "+p.map(a=>a.code+" "+a.number).join(", "):"Оберіть статті зі списку";
}
const sumText=()=>["Штраф: "+$("tf").textContent,"КПЗ: "+$("tj").textContent,"Розшук: "+$("tw").textContent,"Застава: "+$("tb").textContent].join("; ")+(XS.length?"\nДодатково: "+XS.join("; "):"");
$("copySum").onclick=()=>{if(!picked().length){toast("Спершу оберіть статті");return}copyBtn($("copySum"),sumText())};
function toggle(id){
  sel.has(id)?sel.delete(id):sel.add(id);
  const el=document.querySelector(`.art[data-id="${CSS.escape(id)}"]`);
  if(el){const on=sel.has(id);el.classList.toggle("sel",on);el.setAttribute("aria-checked",on);el.querySelector("input").checked=on}
  calc();
}
$("list").addEventListener("click",e=>{
  const h=e.target.closest(".code-h");
  if(h){const g=h.closest(".code"),o=g.classList.toggle("open");o?opened.add(g.dataset.c):opened.delete(g.dataset.c);h.setAttribute("aria-expanded",o);return}
  const a=e.target.closest(".art");if(a)toggle(a.dataset.id);
});
$("list").addEventListener("keydown",e=>{if((e.key===" "||e.key==="Enter")&&e.target.classList.contains("art")){e.preventDefault();e.target.click()}});
let raf=0;$("q").addEventListener("input",()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(filter)});
$("sync").onclick=()=>loadAll(true);
$("clr").onclick=()=>{sel.clear();render()};
$("mir").onclick=()=>{const t=$("mtext");t.value=MIR;t.rows=6;t.hidden=!t.hidden;$("mcopy").hidden=t.hidden};
$("mcopy").onclick=()=>copyBtn($("mcopy"),MIR);

// ---- довідник (faq.json): розділи задаються полем category у кожному питанні ----
let FAQ=[],FIDX=[],fcat="";const ftags=new Set();
function applyFaq(d){
  FAQ=(d&&Array.isArray(d.items)?d.items:[]).map((i,n)=>({...i,id:String(i.id??n),tags:Array.isArray(i.tags)?i.tags.map(String):[],category:String(i.category||"").trim()||"Загальне"}));
  renderFaq();
}
const qaHtml=i=>`<section class="code qa" data-id="${esc(i.id)}" data-cat="${esc(i.category)}"><button class="code-h" aria-expanded="false"><span class="ct">${esc(i.question)}</span><span class="chev">▶</span></button><div class="gb"><div><div class="ans">${esc(i.answer)}</div><div class="qa-foot"><button data-copy="${esc(i.id)}">Копіювати відповідь</button>${i.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div></div></div></section>`;
function renderFaq(){
  const cats=[...new Set(FAQ.map(i=>i.category))]; // порядок першої появи у файлі
  if(fcat&&!cats.includes(fcat))fcat="";
  const tags=[...new Set(FAQ.flatMap(i=>i.tags))].sort((a,b)=>a.localeCompare(b,"uk"));
  for(const t of[...ftags])if(!tags.includes(t))ftags.delete(t);
  $("fcats").innerHTML=cats.length>1?[`<button class="ctab ${fcat?"":"on"}" data-cat="">Усі<span>${FAQ.length}</span></button>`,...cats.map(c=>`<button class="ctab ${c===fcat?"on":""}" data-cat="${esc(c)}">${esc(c)}<span>${FAQ.filter(i=>i.category===c).length}</span></button>`)].join(""):"";
  $("ftags").innerHTML=tags.map(t=>`<button class="chip ${ftags.has(t)?"on":""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("");
  $("flist").innerHTML=cats.map(c=>`<div class="fh" data-ch="${esc(c)}">${esc(c)}</div>`+FAQ.filter(i=>i.category===c).map(qaHtml).join("")).join("")
    +`<div class="empty" id="fempty" hidden>${FAQ.length?"Нічого не знайдено.":"Довідник порожній. Адміністрація додає питання у файл faq.json."}</div>`;
  FIDX=FAQ.map(i=>({id:i.id,h:norm([i.question,i.answer,i.category,...i.tags].join(" ")),tags:i.tags,cat:i.category}));
  filterFaq();
}
function filterFaq(){
  const ts=norm($("fq").value.trim()).split(/\s+/).filter(Boolean),ok=new Set();
  for(const x of FIDX)if((!fcat||x.cat===fcat)&&ts.every(t=>x.h.includes(t))&&[...ftags].every(t=>x.tags.includes(t)))ok.add(x.id);
  let n=0,head=null,cnt=0;
  [...$("flist").children].forEach(el=>{
    if(el.classList.contains("fh")){if(head)head.hidden=!cnt||!!fcat;head=el;cnt=0}
    else if(el.classList.contains("qa")){const v=ok.has(el.dataset.id);el.hidden=!v;if(v){n++;cnt++}el.classList.toggle("force",ts.length>0&&v)}
  });
  if(head)head.hidden=!cnt||!!fcat;
  $("fempty").hidden=n>0;
}
$("fq").addEventListener("input",()=>requestAnimationFrame(filterFaq));
$("fcats").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(!b)return;fcat=b.dataset.cat;$("fcats").querySelectorAll(".ctab").forEach(x=>x.classList.toggle("on",x===b));filterFaq()});
$("ftags").addEventListener("click",e=>{const b=e.target.closest("[data-tag]");if(!b)return;const t=b.dataset.tag;ftags.has(t)?ftags.delete(t):ftags.add(t);b.classList.toggle("on");filterFaq()});
$("flist").addEventListener("click",e=>{
  const cp=e.target.closest("[data-copy]");if(cp){const it=FAQ.find(i=>i.id===cp.dataset.copy);if(it)copyBtn(cp,it.answer);return}
  const h=e.target.closest(".code-h");if(h){const g=h.closest(".qa"),o=g.classList.toggle("open");h.setAttribute("aria-expanded",o)}
});

// ---- нотатки (зашифровано, автозбереження): кольорові теги та шаблони з templates.json ----
const NTAGS=[{id:"red",n:"Важливо",c:"#c0605a"},{id:"amber",n:"Терміново",c:"#d1a24f"},{id:"green",n:"Готово",c:"#6aa083"},{id:"blue",n:"Інфо",c:"#6a8fb8"},{id:"violet",n:"Ідеї",c:"#9a86b8"},{id:"gray",n:"Інше",c:"#8a94a1"}];
let NOTES=[],cur=null,saveT=0,dirty=false,lastRaw=null,delArm=0,nfil="";
const nsort=()=>NOTES.sort((a,b)=>b.updated-a.updated);
const ntitle=n=>(n.text.split("\n").find(l=>l.trim())||"Без назви").trim().slice(0,60);
const dotsHtml=ts=>(ts||[]).map(id=>{const t=NTAGS.find(x=>x.id===id);return t?`<i class="ndot" style="--c:${t.c}" title="${esc(t.n)}"></i>`:""}).join("");
const curNote=()=>NOTES.find(x=>x.id===cur);
async function loadNotes(){
  const raw=store.get("notes.cache");if(raw===lastRaw&&lastRaw!==null)return;lastRaw=raw;
  const d=parse(raw);
  NOTES=Array.isArray(d)?d.filter(n=>n&&typeof n.text==="string").map(n=>({...n,tags:Array.isArray(n.tags)?n.tags.filter(t=>NTAGS.some(x=>x.id===t)):[]})):[];
  if(!curNote())cur=NOTES.length?nsort()[0].id:null;renderNotes();
}
async function saveNotes(){const raw=JSON.stringify(NOTES);store.set("notes.cache",raw);lastRaw=raw;dirty=false;$("nstat").textContent="✓ Збережено"}
function queueSave(){dirty=true;$("nstat").textContent="Збереження…";clearTimeout(saveT);saveT=setTimeout(saveNotes,400)}
function renderNFilter(){
  const cnt=id=>NOTES.filter(n=>n.tags.includes(id)).length;
  $("nfilter").innerHTML=`<button class="nf ${nfil?"":"on"}" data-f="">Усі ${NOTES.length}</button>`+NTAGS.filter(t=>cnt(t.id)||nfil===t.id).map(t=>`<button class="nf ${nfil===t.id?"on":""}" data-f="${t.id}" title="${esc(t.n)}"><i class="ndot" style="--c:${t.c}"></i>${cnt(t.id)}</button>`).join("");
}
function renderNList(){
  const L=nsort().filter(n=>!nfil||n.tags.includes(nfil));
  $("nlist").innerHTML=L.map(n=>`<button class="nitem ${n.id===cur?"on":""}" data-id="${esc(n.id)}"><b><span class="dots">${dotsHtml(n.tags)}</span><span class="tt">${esc(ntitle(n))}</span></b><span>${new Date(n.updated).toLocaleString("uk-UA",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span></button>`).join("")||`<div class="empty">${NOTES.length?"Немає нотаток з цим тегом.":"Нотаток поки немає."}</div>`;
}
function renderNTags(){
  const n=curNote();
  $("ntagrow").innerHTML=NTAGS.map(t=>`<button class="ntg ${n&&n.tags.includes(t.id)?"on":""}" data-tg="${t.id}" style="--c:${t.c}" ${n?"":"disabled"}><i></i>${esc(t.n)}</button>`).join("");
}
function renderNotes(){
  renderNFilter();renderNList();renderNTags();
  const n=curNote(),t=$("ntext");
  t.disabled=!n;t.value=n?n.text:"";t.placeholder=n?"Текст нотатки…":"Створіть нотатку кнопкою «Нова нотатка» або оберіть шаблон";
  $("ncopy").disabled=$("ndel").disabled=!n;
}
function newNote(text="",tags=[]){
  const n={id:Date.now().toString(36),text,tags:[...tags],updated:Date.now()};
  NOTES.unshift(n);cur=n.id;if(nfil&&!n.tags.includes(nfil))nfil="";
  renderNotes();saveNotes();$("ntext").focus();
}
$("nnew").onclick=()=>{closeTpl();newNote()};
$("nfilter").addEventListener("click",e=>{const b=e.target.closest("[data-f]");if(b){nfil=b.dataset.f;renderNFilter();renderNList()}});
$("nlist").addEventListener("click",e=>{const b=e.target.closest("[data-id]");if(b){cur=b.dataset.id;renderNotes()}});
$("ntagrow").addEventListener("click",e=>{
  const b=e.target.closest("[data-tg]"),n=curNote();if(!b||!n)return;
  const i=n.tags.indexOf(b.dataset.tg);i<0?n.tags.push(b.dataset.tg):n.tags.splice(i,1);
  b.classList.toggle("on",i<0);renderNFilter();renderNList();queueSave();
});
$("ntext").addEventListener("input",()=>{
  const n=curNote();if(!n)return;
  n.text=$("ntext").value;n.updated=Date.now();renderNList();queueSave();
});
$("ncopy").onclick=()=>copyBtn($("ncopy"),$("ntext").value);
$("ndel").onclick=()=>{
  if(!delArm){delArm=setTimeout(()=>{delArm=0;$("ndel").textContent="Видалити"},3000);$("ndel").textContent="Підтвердити видалення";return}
  clearTimeout(delArm);delArm=0;$("ndel").textContent="Видалити";
  NOTES=NOTES.filter(x=>x.id!==cur);cur=NOTES.length?nsort()[0].id:null;renderNotes();saveNotes();
};
addEventListener("focus",()=>{if(!dirty)loadNotes()});
// шаблони: файл templates.json з репозиторію (manifest → templates_url); змінюються без оновлення програми
let TPLS=[],tplSig="";
const pad2=n=>String(n).padStart(2,"0");
const fillTpl=s=>{const d=new Date();return s.replace(/\{(date|дата)\}/gi,`${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()}`).replace(/\{(time|час)\}/gi,`${pad2(d.getHours())}:${pad2(d.getMinutes())}`)};
function applyTemplates(d){
  tplSig=JSON.stringify(d&&d.templates||[]);
  TPLS=(d&&Array.isArray(d.templates)?d.templates:[]).filter(t=>t&&t.title).slice(0,50).map((t,i)=>({id:String(t.id??i),title:String(t.title).slice(0,60),text:String(t.text??""),tags:Array.isArray(t.tags)?t.tags.filter(x=>NTAGS.some(n=>n.id===x)):[]}));
  renderTplMenu();
}
function renderTplMenu(){
  $("tplMenu").innerHTML=TPLS.length?TPLS.map((t,i)=>`<button role="menuitem" data-tpl="${i}"><b>${esc(t.title)}</b><small>${esc(t.text.split("\n").find(l=>l.trim())||"")}</small></button>`).join(""):'<div class="empty">Шаблонів немає. Адміністрація додає їх у templates.json.</div>';
}
const closeTpl=()=>{$("tplMenu").classList.add("hide");$("ntplBtn").setAttribute("aria-expanded","false")};
$("ntplBtn").onclick=()=>{const o=$("tplMenu").classList.toggle("hide");$("ntplBtn").setAttribute("aria-expanded",String(!o))};
$("tplMenu").addEventListener("click",e=>{const b=e.target.closest("[data-tpl]");if(!b)return;const t=TPLS[+b.dataset.tpl];if(t){closeTpl();newNote(fillTpl(t.text),t.tags)}});
document.addEventListener("click",e=>{if(!e.target.closest("#nsplit"))closeTpl()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeTpl()});
async function refreshTpl(){
  if(!MAN||!MAN.templates_url||!navigator.onLine)return;
  try{
    const u=MAN.templates_url+(MAN.templates_url.includes("?")?"&":"?")+"t="+Math.floor(Date.now()/30000);
    const r=await fetch(u,{cache:"no-store"});if(!r.ok)return;
    const d=await r.json();if(!validTpl(d)||JSON.stringify(d.templates)===tplSig)return;
    store.set("templates.cache",JSON.stringify(d));applyTemplates(d);
  }catch(e){}
}

// ---- вкладки, режими, оверлей ----
const TABS=["hub","laws","db","faq","notes","set"];
function stagger(sec){
  const el=$(sec);if(!el)return;el.classList.remove("stg");void el.offsetWidth;
  [...el.children].forEach((c,i)=>c.style.setProperty("--i",Math.min(i,9)));el.classList.add("stg");
}
function moveInd(){ // ковзна акцентна смуга активного пункту меню
  const a=document.querySelector(".menu .nv.on"),ind=$("navInd");if(!a||!ind||!a.offsetHeight)return;
  ind.style.setProperty("--y",a.offsetTop+"px");ind.style.height=a.offsetHeight+"px";
  if(!ind.classList.contains("ready"))requestAnimationFrame(()=>ind.classList.add("ready"));
}
function reveal(){ // плавна поява інтерфейсу після екрана завантаження
  document.body.classList.remove("pre");
  if(OVERLAY)return;
  [...document.querySelectorAll("nav>*:not(.nav-ind)")].forEach((el,i)=>el.style.setProperty("--n",i));
  document.body.classList.add("intro");moveInd();
  stagger(TABS.find(x=>!$(x).classList.contains("hide"))||"hub");
  setTimeout(()=>document.body.classList.remove("intro"),1800);
}
function tab(t){
  TABS.forEach(x=>$(x).classList.toggle("hide",x!==t));
  document.querySelectorAll("[data-t]").forEach(b=>b.classList.toggle("on",b.dataset.t===t));
  if(!document.body.classList.contains("ov")){moveInd();stagger(t)}
  if(t==="laws")setTimeout(()=>$("q").focus(),0);if(t==="faq")setTimeout(()=>$("fq").focus(),0);if(t==="notes"){loadNotes();refreshTpl()}document.querySelector("main").classList.toggle("fill",t==="db");if(t==="hub")refreshNews();
}
document.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>tab(b.dataset.t));

function overlay(){if(TAURI)invoke("toggle_overlay")} // сховати / показати Spotlight Bar
function launch(){ // оверлей запускається одразу як Spotlight Bar, без вибору режиму
  if(TAURI){invoke("show_overlay");return}
  toast("Оверлей доступний у застосунку Olymp Helper");
}
$("runOv").onclick=()=>{if(G.ov&&TAURI){invoke("stop_overlay");return}launch()};

// ---- налаштування ----
// ---- менеджер гарячих клавіш ----
const KEYS_DEF=[
  {id:"toggle",n:"Показати / сховати оверлей",h:"Глобальна: працює в грі",d:"F5",g:true},
  {id:"click",n:"Наскрізний режим оверлею",h:"Глобальна: кліки проходять у гру",d:"Shift + F5",g:true},
  {id:"lock",n:"Замок позиції оверлею",h:"Глобальна: заблокувати / розблокувати",d:"",g:true},
  {id:"stop",n:"Вимкнути оверлей",h:"Глобальна",d:"",g:true},
  {id:"search",n:"Пошук по законах",h:"Лише у вікні застосунку",d:"Ctrl + K",g:false}];
const KEYS={};KEYS_DEF.forEach(k=>KEYS[k.id]=k.d);
let listening=null;
const keyLabel=k=>k||"не призначено";
const CODEKEY={Space:"Space",Enter:"Enter",Tab:"Tab",Home:"Home",End:"End",PageUp:"PageUp",PageDown:"PageDown",Insert:"Insert",Delete:"Delete",Backspace:"Backspace",ArrowUp:"Up",ArrowDown:"Down",ArrowLeft:"Left",ArrowRight:"Right",Minus:"Minus",Equal:"Equal",Comma:"Comma",Period:"Period",Slash:"Slash",Semicolon:"Semicolon",Quote:"Quote",BracketLeft:"BracketLeft",BracketRight:"BracketRight",Backslash:"Backslash",Backquote:"Backquote"};
function keyName(e){const c=e.code||"";if(/^Key[A-Z]$/.test(c))return c.slice(3);if(/^Digit\d$/.test(c))return c.slice(5);if(/^F([1-9]|1[0-2])$/.test(c))return c;return CODEKEY[c]||""}
const combo=e=>{const k=keyName(e);return k?[e.ctrlKey&&"Ctrl",e.shiftKey&&"Shift",e.altKey&&"Alt",k].filter(Boolean).join(" + "):""};
function validKey(id,c){
  if(!c)return"";
  const def=KEYS_DEF.find(k=>k.id===id),parts=c.split(" + "),key=parts[parts.length-1],fkey=/^F\d+$/.test(key);
  if(def.g&&parts.length===1&&!fkey&&!["Home","End","PageUp","PageDown","Insert"].includes(key))return"Для глобальної клавіші потрібен Ctrl, Alt або Shift (або F-клавіша)";
  if(!def.g&&!parts.includes("Ctrl")&&!parts.includes("Alt")&&!fkey)return"Для цієї дії потрібен Ctrl або Alt";
  const dup=KEYS_DEF.find(k=>k.id!==id&&KEYS[k.id]===c);if(dup)return"Вже використовується: «"+dup.n+"»";
  return"";
}
function pushKeys(){
  if(!TAURI||OVERLAY)return;
  const keys={};KEYS_DEF.filter(d=>d.g).forEach(d=>keys[d.id]=acc(KEYS[d.id]||""));
  invoke("set_keybinds",{keys}).then(bad=>{if(bad&&bad.length)toast("Не вдалося призначити: "+bad.map(i=>(KEYS_DEF.find(d=>d.id===i)||{n:i}).n).join(", "))}).catch(()=>{});
}
function renderKeys(){
  $("keys").innerHTML=KEYS_DEF.map(d=>`<div class="krow"><div class="kn">${esc(d.n)}<small>${esc(d.h)}</small></div><span class="kc ${listening===d.id?"listen":KEYS[d.id]?"":"empty"}">${listening===d.id?"Натисніть клавішу…":esc(keyLabel(KEYS[d.id]))}</span><div class="kb"><button data-kb="${d.id}">${listening===d.id?"Скасувати":"Змінити"}</button><button data-kc="${d.id}" ${KEYS[d.id]?"":"disabled"}>Очистити</button><button data-kr="${d.id}" ${KEYS[d.id]===d.d?"disabled":""}>Скинути</button></div></div>`).join("");
  $("clickKey").textContent=keyLabel(KEYS.click);
}
function saveKeys(){store.set("gov.keys",JSON.stringify(KEYS));renderKeys();pushKeys();renderOvTools()}
function loadKeys(){
  const k=parse(store.get("gov.keys"));
  if(k&&typeof k==="object"){KEYS_DEF.forEach(d=>{if(typeof k[d.id]==="string")KEYS[d.id]=k[d.id]})}
  else{const old=store.get("gov.hk");if(old)KEYS.toggle=old} // міграція зі старих версій
  renderKeys();
}
function setKey(id,c){const err=validKey(id,c);if(err){toast(err);return}KEYS[id]=c;listening=null;saveKeys()}
$("keys").addEventListener("click",e=>{
  const b=e.target.closest("[data-kb]"),c=e.target.closest("[data-kc]"),r=e.target.closest("[data-kr]");
  if(b){listening=listening===b.dataset.kb?null:b.dataset.kb;renderKeys()}
  if(c){KEYS[c.dataset.kc]="";saveKeys()}
  if(r){const d=KEYS_DEF.find(k=>k.id===r.dataset.kr),err=validKey(d.id,d.d);if(err&&d.d){toast(err);return}KEYS[d.id]=d.d;saveKeys()}
});
$("keysReset").onclick=()=>{KEYS_DEF.forEach(d=>KEYS[d.id]=d.d);listening=null;saveKeys();toast("Бінди скинуто до стандартних")};
document.addEventListener("keydown",e=>{
  if(listening){ // режим «Натисніть клавішу…»
    e.preventDefault();
    if(e.key==="Escape"){listening=null;renderKeys();return}
    if((e.key==="Backspace"||e.key==="Delete")&&!e.ctrlKey&&!e.altKey&&!e.shiftKey){const id=listening;listening=null;KEYS[id]="";saveKeys();return}
    if(["Control","Shift","Alt","Meta"].includes(e.key))return;
    const c=combo(e);if(!c){toast("Ця клавіша не підтримується");return}
    setKey(listening,c);return;
  }
  if(KEYS.search&&combo(e)===KEYS.search){e.preventDefault();if(document.body.classList.contains("ov")){$("sq").focus();$("sq").select()}else{tab("laws");$("q").focus();$("q").select()}return}
  if(e.key==="Escape"){
    const m=[...document.querySelectorAll(".modal:not(.hide)")].pop();
    if(m){m.classList.add("hide");if(m.id==="themeModal")pickTheme();return}
    if(document.body.classList.contains("ov")){if(spotEsc())return;overlay()}
  }
});
$("op").oninput=e=>{$("opv").textContent=e.target.value;document.documentElement.style.setProperty("--ov",e.target.value/100);setLater("gov.op",e.target.value)};
$("fz").oninput=e=>{$("fzv").textContent=e.target.value;document.documentElement.style.setProperty("--fs",(15*e.target.value/100)+"px");setLater("gov.fz",e.target.value);requestAnimationFrame(moveInd)};
$("auto").onchange=e=>{store.set("gov.auto",e.target.checked?"1":"0");if(TAURI)invoke("set_autostart",{enabled:e.target.checked}).catch(()=>toast("Не вдалося змінити автозапуск"))};

// ---- гра: єдине джерело стану для нижньої панелі ----
const G={exe:"",running:false,ov:false};
function renderGs(){
  let s,t;
  if(!G.exe){s="none";t="Гра не вибрана"}
  else if(!G.running){s="wait";t="Очікування запуску гри"}
  else{s="run";t=G.ov?"Гру запущено · Оверлей активний":"Гру запущено"}
  $("gs").textContent=t;$("gdot").dataset.s=s;renderOvBtn();
}
function renderOvBtn(){
  const b=$("runOv"),on=G.ov&&TAURI;
  b.textContent=on?"Вимкнути оверлей":"Запустити оверлей";
  b.classList.toggle("pri",!on);b.classList.toggle("stop",on);
}
function syncExeUi(){
  const on=$("autoov").checked;$("exe").disabled=!on;$("pick").disabled=!on;
  $("exeHint").textContent=on?"Назва .exe або повний шлях. За ним визначається, чи запущена гра.":"Увімкніть автоматичний запуск оверлею, щоб вказати гру.";
}
function setExe(v){G.exe=String(v||"").trim();store.set("gov.exe",G.exe);if(TAURI)invoke("set_game_exe",{name:G.exe});renderGs()}
$("exe").onchange=()=>setExe($("exe").value);
$("pick").onclick=async()=>{if(!TAURI){toast("Вибір файлу доступний у застосунку");return}const p=await invoke("pick_exe");if(p){$("exe").value=p;setExe(p)}};
$("autoov").onchange=e=>{store.set("gov.autoov",e.target.checked?"1":"0");syncExeUi();if(TAURI)invoke("set_auto_overlay",{enabled:e.target.checked})};

// ---- вікно: рамка, закриття, власні кнопки ----
function applyFrame(custom){document.body.classList.toggle("sysframe",!custom);if(TAURI&&!OVERLAY)invoke("set_frame",{custom})}
$("frame").onchange=()=>{store.set("gov.frame",$("frame").value);applyFrame($("frame").value==="custom")};
$("closeb").onchange=()=>{store.set("gov.close",$("closeb").value);if(TAURI)invoke("set_close_mode",{tray:$("closeb").value==="tray"})};
const wc=a=>{if(!TAURI)return;invoke("win_ctl",{action:a}).then(m=>document.body.classList.toggle("maxd",!!m)).catch(()=>{})};
$("wMin").onclick=()=>wc("min");$("wMax").onclick=()=>wc("max");$("wClose").onclick=()=>wc("close");
document.querySelectorAll(".rz").forEach(el=>el.addEventListener("pointerdown",ev=>{
  if(!TAURI||ev.button!==0)return;ev.preventDefault();
  try{window.__TAURI__.window.getCurrentWindow().startResizeDragging(el.dataset.d)}catch(e){}
}));

// ---- теми ----
const PRESETS=[
  {id:"p-tac",name:"Tactical Night",ac:"#8fa56b",p:"#141a16",r:6},
  {id:"p-state",name:"State Dark",ac:"#6a8fb8",p:"#151a23",r:8},
  {id:"p-em",name:"Emerald Ops",ac:"#4fa383",p:"#121a19",r:12},
  {id:"p-olymp",name:"Olymp Default",ac:"#c4a05a",p:"#151a21",r:10}];
const HEX=/^#[0-9a-f]{6}$/i;
const hex2=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const mix=(h,t,a)=>{const x=hex2(h),y=hex2(t);return "#"+x.map((v,i)=>Math.round(v+(y[i]-v)*a).toString(16).padStart(2,"0")).join("")};
const lum=h=>{const[r,g,b]=hex2(h);return(.299*r+.587*g+.114*b)/255};
function applyTheme(t){
  const s=document.documentElement.style,bg=mix(t.p,"#000000",.45);
  s.setProperty("--ac",t.ac);s.setProperty("--acx",lum(t.ac)>.6?"#14110a":"#f4f1ea");
  s.setProperty("--l2",t.p);s.setProperty("--l1",mix(t.p,"#000000",.25));s.setProperty("--l3",mix(t.p,"#ffffff",.05));
  s.setProperty("--bg",bg);s.setProperty("--bgrgb",hex2(bg).join(","));s.setProperty("--r",t.r+"px");
}
let THEMES=[],THEME="p-olymp";
const allThemes=()=>[...PRESETS,...THEMES];
function loadThemes(){
  const a=parse(store.get("gov.themes"));
  THEMES=(Array.isArray(a)?a:[]).filter(t=>t&&HEX.test(t.ac)&&HEX.test(t.p)).slice(0,5);
  THEME=store.get("gov.theme")||"p-olymp";
}
function pickTheme(){
  const t=allThemes().find(x=>x.id===THEME)||PRESETS[3];
  // колір акценту з manifest.json діє лише доки гравець сам не обрав тему
  const acc2=!store.get("gov.theme")&&MAN&&MAN.theme&&HEX.test(MAN.theme.accent||"")?MAN.theme.accent:t.ac;
  applyTheme({...t,ac:acc2});renderThemes();
}
function renderThemes(){
  const b=t=>`<button class="theme ${t.id===THEME?"on":""}" data-id="${esc(t.id)}" style="--c:${t.ac};--p:${t.p}"><i></i>${esc(t.name)}</button>`;
  $("themes").innerHTML=PRESETS.map(b).join("");
  $("cthemes").innerHTML=THEMES.map(t=>b(t)+`<button class="del" data-del="${esc(t.id)}" aria-label="Видалити тему ${esc(t.name)}">×</button>`).join("")||'<span class="note">Власних тем ще немає</span>';
  $("newTheme").disabled=THEMES.length>=5;$("themeCnt").textContent=`(${THEMES.length} з 5)`;
}
$("themes").onclick=$("cthemes").onclick=e=>{
  const d=e.target.closest("[data-del]");
  if(d){THEMES=THEMES.filter(t=>t.id!==d.dataset.del);store.set("gov.themes",JSON.stringify(THEMES));if(THEME===d.dataset.del){THEME="p-olymp";store.set("gov.theme","p-olymp")}pickTheme();return}
  const b=e.target.closest("[data-id]");if(b){THEME=b.dataset.id;store.set("gov.theme",THEME);pickTheme()}
};
const tm=$("themeModal");
const prevTheme=()=>{const r=+$("tr").value;$("trv").textContent=r;applyTheme({ac:$("ta").value,p:$("tp").value,r})};
["ta","tp","tr"].forEach(i=>$(i).addEventListener("input",prevTheme));
$("newTheme").onclick=()=>{
  if(THEMES.length>=5)return;
  const t=allThemes().find(x=>x.id===THEME)||PRESETS[3];
  $("tn").value="";$("ta").value=t.ac;$("tp").value=t.p;$("tr").value=t.r;$("trv").textContent=t.r;
  tm.classList.remove("hide");$("tn").focus();
};
$("tcancel").onclick=()=>{tm.classList.add("hide");pickTheme()};
tm.addEventListener("click",e=>{if(e.target===tm){tm.classList.add("hide");pickTheme()}});
$("tsave").onclick=()=>{
  const t={id:"c"+Date.now().toString(36),name:($("tn").value.trim()||`Тема ${THEMES.length+1}`).slice(0,24),ac:$("ta").value,p:$("tp").value,r:+$("tr").value};
  THEMES.push(t);store.set("gov.themes",JSON.stringify(THEMES));THEME=t.id;store.set("gov.theme",t.id);
  tm.classList.add("hide");pickTheme();
};

// ---- новини, ресурси, зображення, маніфест ----
let NEWS=[];
const dmy=s=>{const m=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s||"").trim());return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():null};
// формат v1.2.6: id, date, title, tags[], summary (короткий опис), content (детальний текст). Старий формат (tag, text) теж читається.
const nrm=i=>({id:String(i.id??i.title??""),date:String(i.date||""),title:String(i.title||""),tags:(Array.isArray(i.tags)?i.tags:(i.tag?[i.tag]:[])).map(String).slice(0,5),summary:String(i.summary??i.text??""),content:String(i.content??"")});
const tagsHtml=t=>t.length?`<div class="ntags">${t.map(x=>`<span class="ntag">${esc(x)}</span>`).join("")}</div>`:"";
const newsCard=(n,k)=>`<article class="ncard" tabindex="0" role="button" data-n="${k}">${tagsHtml(n.tags)}<time>${esc(n.date)}</time><h3>${esc(n.title)}</h3><p>${esc(n.summary)}</p>${n.content?'<span class="more">Докладніше →</span>':""}</article>`;
const newsItem=(n,k)=>`<article class="item" tabindex="0" role="button" data-n="${k}"><time>${esc(n.date)}</time><div><h3>${esc(n.title)}</h3>${tagsHtml(n.tags)}<p>${esc(n.summary)}</p></div></article>`;
let newsSig="";
function setNews(items,smooth){
  newsSig=JSON.stringify(items||[]);
  NEWS=(items||[]).map(nrm);
  if(NEWS.length&&NEWS.every(i=>dmy(i.date)!==null))NEWS.sort((a,b)=>dmy(b.date)-dmy(a.date));
  const box=$("news");
  if(smooth)box.style.minHeight=box.offsetHeight+"px"; // без стрибка верстки під час оновлення
  box.innerHTML=NEWS.length?NEWS.slice(0,2).map(newsCard).join(""):'<div class="empty">Новини ще не опубліковано. Адміністрація додає їх у news.json.</div>';
  $("newsMore").hidden=NEWS.length<=2;
  $("newsAll").innerHTML=NEWS.map(newsItem).join("");
  if(smooth){box.classList.add("fresh");setTimeout(()=>{box.style.minHeight="";box.classList.remove("fresh")},380)}
}
// «живі» новини: фонова перевірка news.json без перезапуску; інтерфейс змінюється лише коли дані справді змінилися
async function refreshNews(){
  if(!MAN||!MAN.news_url||!navigator.onLine)return;
  try{
    const u=MAN.news_url+(MAN.news_url.includes("?")?"&":"?")+"t="+Math.floor(Date.now()/30000);
    const r=await fetch(u,{cache:"no-store"});if(!r.ok)return;
    const d=await r.json();if(!validNews(d))return;
    if(JSON.stringify(d.items)===newsSig)return;
    store.set("news.cache",JSON.stringify(d));setNews(d.items,true);
  }catch(e){}
}
function openNews(k){
  const n=NEWS[k];if(!n)return;
  $("ndT").textContent=n.title;$("ndDate").textContent=n.date;
  $("ndTags").innerHTML=n.tags.map(x=>`<span class="ntag">${esc(x)}</span>`).join("");
  $("ndBody").textContent=n.content||n.summary;
  $("newsDetail").classList.remove("hide");
}
for(const id of["news","newsAll"]){
  $(id).addEventListener("click",e=>{const a=e.target.closest("[data-n]");if(a)openNews(+a.dataset.n)});
  $(id).addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){const a=e.target.closest("[data-n]");if(a){e.preventDefault();openNews(+a.dataset.n)}}});
}
$("ndClose").onclick=()=>$("newsDetail").classList.add("hide");
$("newsDetail").addEventListener("click",e=>{if(e.target.id==="newsDetail")$("newsDetail").classList.add("hide")});
$("newsMore").onclick=()=>$("newsModal").classList.remove("hide");
$("newsClose").onclick=()=>$("newsModal").classList.add("hide");
$("newsModal").addEventListener("click",e=>{if(e.target.id==="newsModal")$("newsModal").classList.add("hide")});

// ресурси: чотири іконки в зафіксованих слотах; посилання задає manifest.json (links)
const RES=["telegram","forum","site","sheets"];
const ALIAS={telegram:["telegram","телеграм"],forum:["forum","форум"],site:["site","сайт"],sheets:["sheets","таблиц"]};
function applyLinks(links){
  const L=links||{};
  RES.forEach(k=>{
    const key=Object.keys(L).find(n=>ALIAS[k].some(a=>n.toLowerCase().startsWith(a)));
    const b=document.querySelector(`[data-res="${k}"]`);if(!b)return;
    b.dataset.u=key?String(L[key]):(k==="telegram"?TG_URL:k==="sheets"?"#":"");
  });
}

function applyManifest(m){
  if(typeof m.miranda==="string"&&m.miranda.trim())MIR=m.miranda;
  if(m.min_launcher){MINV=String(m.min_launcher);verCheck()}
  applyLinks(m.links);
  const b=m.banner||{};
  if(b.title)$("pTitle").textContent=String(b.title);
  if(b.text)$("pText").textContent=String(b.text);
  if(b.button)$("pBtn").textContent=String(b.button);
  $("pBtn").dataset.u=b.url?String(b.url):"";
  pickTheme();
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-u]");if(!b)return;const u=b.dataset.u;
  if(!/^(https|mtasa):\/\//.test(u)){toast("Посилання ще не налаштоване адміністрацією");return}
  TAURI?invoke("open_url",{url:u}):window.open(u,"_blank","noopener");
});

// ---- кодекси та закони: два незалежні стовпці, кожен зі своєю прокруткою ----
let CODES=[],rart=null;const ropen=new Set(),AMAP=Object.create(null);
const akey=(c,a)=>c.id+"::"+String(a.id??a.number);
function applyCodes(d){
  CODES=(d&&Array.isArray(d.codes)?d.codes:[]).map(c=>({id:String(c.id),title:String(c.title||""),color:c.color||"",abbr:c.abbr||abbrOf(String(c.title||"")),updated:c.updated||"",
    groups:[...(c.articles&&c.articles.length?[{title:"",articles:c.articles}]:[]),...(c.sections||[]).map(s=>({title:s.title||"",articles:s.articles||[]}))]}));
  for(const k in AMAP)delete AMAP[k];
  CODES.forEach(c=>c.groups.forEach(g=>g.articles.forEach(a=>{AMAP[akey(c,a)]={a,c}})));
  if(!AMAP[rart]){const c=CODES.find(x=>x.groups.some(g=>g.articles.length));rart=c?akey(c,c.groups.find(g=>g.articles.length).articles[0]):null;if(c)ropen.add(c.id)}
  renderReader();renderArticle();
}
function renderReader(){
  if(!CODES.length){$("rlist").innerHTML='<div class="empty">Кодекси ще не опубліковано.</div>';$("rbody").innerHTML='<div class="empty">Адміністрація додає їх у файл codes.json.</div>';return}
  const q=norm($("rq").value.trim()).split(/\s+/).filter(Boolean);let h="";
  for(const c of CODES){
    let n=0,inner="";
    for(const g of c.groups){
      let sec="";
      for(const a of g.articles){
        const t=norm([a.number,a.title,a.text,a.description,a.note,...(a.tags||[])].join(" "));
        if(!q.every(w=>t.includes(w)))continue;n++;const k=akey(c,a);
        sec+=`<button class="ra ${k===rart?"on":""}" data-k="${esc(k)}"><b>${esc(a.number)}</b><span>${esc(a.title)}</span></button>`;
      }
      if(sec)inner+=(g.title?`<div class="sec">${esc(g.title)}</div>`:"")+sec;
    }
    if(q.length&&!n)continue;
    const total=c.groups.reduce((s,g)=>s+g.articles.length,0),open=q.length>0||ropen.has(c.id);
    h+=`<section class="rc ${open?"open":""}" data-c="${esc(c.id)}"><button class="rch" aria-expanded="${open}"><span class="badge ${esc(c.color)}">${esc(c.abbr)}</span><span class="ct">${esc(c.title.replace(/\s*\([^)]{1,8}\)\s*$/,""))}</span><span class="cnt">${q.length?n+" з "+total:total}</span><span class="chev">▶</span></button><div class="gb"><div>${inner}</div></div></section>`;
  }
  $("rlist").innerHTML=h||'<div class="empty">Нічого не знайдено.</div>';
}
function renderArticle(){ // правий стовпець: текст вибраної статті; лівий при цьому не перебудовується й не зсувається
  const box=$("rbody"),r=AMAP[rart];
  if(!r){box.innerHTML='<div class="empty">Оберіть статтю зліва.</div>';return}
  const{a,c}=r;
  box.innerHTML=`<div class="rhead"><span class="badge ${esc(c.color)}">${esc(c.abbr)}</span><span class="note">${esc(c.title.replace(/\s*\([^)]{1,8}\)\s*$/,""))}${c.updated?" · редакція від "+esc(c.updated):""}</span></div><h2 class="rtitle"><b>Ст. ${esc(a.number)}</b>${esc(a.title)}</h2><div class="dt">${esc(a.text??a.description??"")}</div>${a.note?`<div class="dn">${esc(a.note)}</div>`:""}${(a.tags||[]).length?`<div class="dtags">${a.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div>`:""}<div class="row" style="margin-top:1em"><button id="rcopy">Копіювати статтю</button></div>`;
  box.scrollTop=0;
}
$("rlist").addEventListener("click",e=>{
  const h=e.target.closest(".rch");
  if(h){const s=h.closest(".rc"),o=s.classList.toggle("open");o?ropen.add(s.dataset.c):ropen.delete(s.dataset.c);h.setAttribute("aria-expanded",o);return}
  const b=e.target.closest(".ra");
  if(b&&b.dataset.k!==rart){
    rart=b.dataset.k;$("rlist").querySelectorAll(".ra.on").forEach(x=>x.classList.remove("on"));b.classList.add("on");
    ropen.add(rart.split("::")[0]);renderArticle();
  }
});
$("rbody").addEventListener("click",e=>{
  const b=e.target.closest("#rcopy"),r=AMAP[rart];
  if(b&&r)copyBtn(b,`Ст. ${r.a.number}. ${r.a.title}\n\n${r.a.text??r.a.description??""}`);
});
$("rq").addEventListener("input",()=>requestAnimationFrame(renderReader));

// ---- оновлення застосунку ----
let APPV="",MINV="";
const cmpPre=(a,b)=>{const x=a.split("."),y=b.split(".");for(let i=0;i<Math.max(x.length,y.length);i++){if(x[i]===undefined)return-1;if(y[i]===undefined)return 1;const nx=/^\d+$/.test(x[i]),ny=/^\d+$/.test(y[i]);if(nx&&ny){const d=x[i]-y[i];if(d)return d<0?-1:1}else if(nx!==ny)return nx?-1:1;else if(x[i]!==y[i])return x[i]<y[i]?-1:1}return 0};
const semver=v=>{const m=/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v));return m?{n:[+m[1],+m[2],+m[3]],p:m[4]||""}:null};
const cmp=(a,b)=>{const x=semver(a),y=semver(b);if(!x||!y)return 0;for(let i=0;i<3;i++){const d=x.n[i]-y.n[i];if(d)return d}if(x.p===y.p)return 0;if(!x.p)return 1;if(!y.p)return -1;return cmpPre(x.p,y.p)}; // 1.2.6-beta.1 < 1.2.6
function verCheck(){if(MINV&&APPV&&cmp(APPV,MINV)<0){$("updbar").classList.add("must");$("updbar").classList.remove("hide");$("updTxt").textContent="Обов’язкове оновлення: ваша версія застаріла і може працювати некоректно."}}
async function checkUpdate(manual){
  if(!TAURI){if(manual)toast("Перевірка оновлень доступна в застосунку");return}
  if(manual)$("updMsg").textContent="Перевірка…";
  try{
    const u=await invoke("check_update");
    if(u){$("updTxt").textContent=`Доступна версія ${u.version}`+(u.notes?` — ${u.notes.split("\n")[0]}`:"");$("updbar").classList.remove("hide");$("updMsg").textContent="Доступна версія "+u.version}
    else{$("updMsg").textContent="Встановлено останню версію";if(!$("updbar").classList.contains("must"))$("updbar").classList.add("hide")}
  }catch(e){$("updMsg").textContent=manual?"Сервер оновлень недоступний":""}
  verCheck();
}
async function installUpdate(){
  $("updBtn").disabled=true;$("updTxt").textContent="Завантаження оновлення…";$("prog").hidden=false;
  try{await invoke("install_update")}catch(e){$("updBtn").disabled=false;$("prog").hidden=true;$("updTxt").textContent="Не вдалося встановити оновлення. Спробуйте пізніше."}
}
$("chk").onclick=()=>checkUpdate(true);$("updBtn").onclick=installUpdate;

async function bootTauri(){
  const ev=window.__TAURI__.event;
  await invoke("set_game_exe",{name:G.exe});
  ev.listen("game-status",e=>{G.running=!!e.payload;renderGs()});
  ev.listen("overlay-active",e=>{G.ov=!!e.payload;renderGs()});
  invoke("game_state").then(s=>{G.running=!!s.running;G.ov=!!s.overlay;renderGs()});
  ev.listen("boot-done",()=>{setTimeout(reveal,450);if(RESTORED)toast("Пошкоджені локальні файли відновлено")});
  ev.listen("overlay-click",e=>{CLICK=!!e.payload;renderOvTools()});
  ev.listen("win-flush",e=>document.body.classList.toggle("maxd",!!e.payload));
  ev.listen("overlay-lock",e=>setLockUi(!!e.payload));
  ev.listen("update-progress",e=>{const{got,total}=e.payload,pc=total?got/total*100:0;$("prog").value=pc;bp(22+pc*.7)});
  let rl=0;ev.listen("vault-changed",e=>{
    const{key,value,src}=e.payload;if(src===(OVERLAY?"overlay":"main"))return;
    if(value===null)delete MEM[key];else MEM[key]=value;
    if(OVERLAY&&(key.startsWith("gov.")||key==="laws.cache"||key==="faq.cache"||key==="manifest.cache")){clearTimeout(rl);rl=setTimeout(()=>location.reload(),300)}
    else if(key==="notes.cache"&&!dirty)loadNotes();
  });
  invoke("app_version").then(v=>{APPV=v;$("appv").textContent="v"+v;$("setv").textContent="v"+v;verCheck()});
  pushState();
}

// ---- оверлей: міні-панель (замок, наскрізний режим, прозорість), розумна прозорість ----
let ovLocked=false,CLICK=false;
function renderOvTools(){
  for(const el of[$("spotBar"),$("spotBy"),document.querySelector(".spbrand")])if(el)el.toggleAttribute("data-tauri-drag-region",!ovLocked); // заблоковано: перетягування вимкнено
  document.body.classList.toggle("ct",CLICK);
  if(SP&&SP.menu)spotRender();
}
function setLockUi(v){ovLocked=v;MEM["gov.ovlock"]=v?"1":"0";renderOvTools()}
function toggleLock(){
  const v=!ovLocked;setLockUi(v);
  if(TAURI)invoke("set_overlay_lock",{locked:v}); // Rust зберігає стан і повідомляє всі вікна
  toast(v?"Позицію заблоковано":"Позицію розблоковано");
}
function toggleClick(){
  if(!TAURI)return;
  invoke("set_click_through",{on:!CLICK});
  if(!CLICK)toast(KEYS.click?"Наскрізний режим: вимкнути можна клавішею "+KEYS.click:"Наскрізний режим увімкнено. Вимкнути можна в треї");
}
function setOverlayOpacity(v){$("op").value=v;$("op").oninput({target:$("op")})}
if(OVERLAY){
  addEventListener("blur",()=>document.body.classList.add("inactive"));
  addEventListener("focus",()=>document.body.classList.remove("inactive"));
}
// невидиме вікно й фонові анімації не навантажують процесор
document.addEventListener("visibilitychange",()=>document.body.classList.toggle("idle",document.hidden));
$("fabHelp").onclick=()=>tab("faq");
$("ontop").onchange=e=>{store.set("gov.ontop",e.target.checked?"1":"0");if(TAURI)invoke("set_overlay_ontop",{on:e.target.checked})};
$("smart").onchange=e=>store.set("gov.smart",e.target.checked?"1":"0");
$("bgop").oninput=e=>{$("bgopv").textContent=e.target.value;setLater("gov.bgop",e.target.value)};

// ---- профілі налаштувань: експорт / імпорт текстовим кодом ----
const P_KEYS=["theme","themes","op","bgop","smart","ontop","ovpos","ovlock","keys","fz","frame","close"];
const b64e=u8=>{let s="";u8.forEach(b=>s+=String.fromCharCode(b));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")};
const b64d=s=>{s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return Uint8Array.from(atob(s),c=>c.charCodeAt(0))};
const pipeBytes=async(u8,S)=>new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new S("deflate-raw"))).arrayBuffer());
async function exportPreset(){
  const o={};for(const k of P_KEYS){const v=store.get("gov."+k);if(v!==null&&v!==undefined)o[k]=v}
  const raw=new TextEncoder().encode(JSON.stringify(o));
  try{if(typeof CompressionStream!=="undefined")return"OLYP1."+b64e(await pipeBytes(raw,CompressionStream))}catch(e){}
  return"OLYP0."+b64e(raw);
}
async function decodePreset(code){
  const m=/^OLYP([01])\.([A-Za-z0-9_-]+)$/.exec(String(code).trim());
  if(!m||code.length>30000)throw new Error("Невірний формат коду");
  let u8=b64d(m[2]);
  if(m[1]==="1"){if(typeof DecompressionStream==="undefined")throw new Error("Цей код створено новішою системою");u8=await pipeBytes(u8,DecompressionStream)}
  const o=JSON.parse(new TextDecoder().decode(u8));
  if(!o||typeof o!=="object"||Array.isArray(o))throw new Error("Пошкоджений код");
  return o;
}
const isInt=(v,a,b)=>/^-?\d+$/.test(String(v))&&+v>=a&&+v<=b;
const KEYRE=/^[A-Za-z0-9 +\-=.,;'`\[\]\/\\]{0,40}$/;
function sanitize(o){ // код від іншої людини вважається недовіреним: перевіряємо кожне значення
  const r={},bad=m=>{throw new Error(m)};
  if("theme" in o){if(!/^[\w-]{1,24}$/.test(String(o.theme)))bad("Невірна тема");r.theme=String(o.theme)}
  if("themes" in o){
    const a=parse(o.themes);if(!Array.isArray(a)||a.length>5)bad("Невірні власні теми");
    r.themes=JSON.stringify(a.map(t=>{
      if(!t||!/^c\w{1,20}$/.test(String(t.id))||!HEX.test(t.ac)||!HEX.test(t.p)||!isInt(t.r,0,20))bad("Невірна тема у профілі");
      return{id:String(t.id),name:String(t.name||"Тема").slice(0,24),ac:t.ac,p:t.p,r:+t.r};
    }));
  }
  if("op" in o){if(!isInt(o.op,30,100))bad("Невірна прозорість");r.op=String(o.op)}
  if("bgop" in o){if(!isInt(o.bgop,20,100))bad("Невірна прозорість у фоні");r.bgop=String(o.bgop)}
  if("fz" in o){if(!isInt(o.fz,80,150))bad("Невірний розмір шрифту");r.fz=String(o.fz)}
  for(const k of["smart","ontop","ovlock"])if(k in o){if(!["0","1"].includes(String(o[k])))bad("Невірний параметр");r[k]=String(o[k])}
  if("frame" in o){if(!["custom","system"].includes(o.frame))bad("Невірна рамка вікна");r.frame=o.frame}
  if("close" in o){if(!["tray","exit"].includes(o.close))bad("Невірна поведінка закриття");r.close=o.close}
  if("ovpos" in o){const g=parse(o.ovpos);if(!g||!isInt(g.x,-20000,20000)||!isInt(g.y,-20000,20000))bad("Невірне положення оверлею");r.ovpos=JSON.stringify({x:+g.x,y:+g.y})}
  if("keys" in o){
    const k=parse(o.keys);if(!k||typeof k!=="object")bad("Невірні бінди");const out={};
    for(const d of KEYS_DEF)if(d.id in k){if(typeof k[d.id]!=="string"||!KEYRE.test(k[d.id]))bad("Невірний бінд");out[d.id]=k[d.id]}
    const v=Object.values(out).filter(Boolean);if(new Set(v).size!==v.length)bad("У бінді є дублікати");r.keys=JSON.stringify(out);
  }
  if(!Object.keys(r).length)bad("У коді немає налаштувань");
  return r;
}
async function importPreset(code){
  const r=sanitize(await decodePreset(code));
  for(const k in r)store.set("gov."+k,r[k]);
  syncUi();pushState();
  if(TAURI&&("ovpos" in r||"ovlock" in r))setTimeout(()=>{if(TAURI)invoke("apply_overlay_state")},500);
  return Object.keys(r).length;
}
$("presetExport").onclick=async()=>{const c=await exportPreset();$("presetCode").value=c;$("presetMsg").textContent="Код створено й скопійовано";copy(c)};
$("presetImport").onclick=async()=>{
  try{const n=await importPreset($("presetCode").value);$("presetMsg").textContent="Застосовано параметрів: "+n;toast("Профіль імпортовано")}
  catch(e){$("presetMsg").textContent=e.message||"Не вдалося імпортувати"}
};

// ---- Spotlight Bar: оверлей у стилі Dynamic Island ----
let SP=null,HIST=[];
const spChip=x=>`<span class="xchip">${esc(x)}</span>`;
const xBlock=a=>{const xs=xlist(a);return xs.length?`<div class="xline"><b>Додатково</b>${xs.map(spChip).join("")}</div>`:""};
function spotFit(){ // вікно має висоту вмісту: мінімальне перекриття екрана під час гри
  if(!TAURI||!OVERLAY||!SP)return;
  const h=Math.ceil($("spotWrap").getBoundingClientRect().height);
  if(h<20||Math.abs(h-SP.h)<2)return;
  SP.h=h;invoke("spot_resize",{h}).catch(()=>{});
}
function lawsFound(q){
  const n=norm(q),ts=n.split(/\s+/).filter(Boolean);if(!ts.length)return[];
  const map=new Map(all().map(a=>[a.id,a])),rank=a=>{const num=norm(a.number);return num===n||num.startsWith(n)?0:norm(a.title).includes(n)?1:2};
  return IDX.filter(x=>ts.every(t=>x.h.includes(t))).map(x=>map.get(x.id)).filter(Boolean).sort((a,b)=>rank(a)-rank(b)).slice(0,30);
}
function faqFound(q){const ts=norm(q).split(/\s+/).filter(Boolean);return ts.length?FIDX.filter(x=>ts.every(t=>x.h.includes(t))).map(x=>FAQ.find(i=>i.id===x.id)).filter(Boolean).slice(0,20):[]}
function notesFound(q){const ts=norm(q).split(/\s+/).filter(Boolean);return nsort().filter(n=>ts.every(t=>norm(n.text).includes(t))).slice(0,20)}
function lawSummary(a){
  const xs=xlist(a),p=[`Штраф: ${a.fine?fmt(a.fine):"—"}`,`КПЗ: ${a.jail_minutes?a.jail_minutes+" хв":"—"}`,`Розшук: ${"★".repeat(a.wanted_level)||"—"}`];
  if(a.jail_minutes>0)p.push("Застава: "+(a.bail?fmt(a.bail):"немає"));
  return`${a.code} — Ст. ${a.number}. ${a.title}\n`+p.join("; ")+(xs.length?"\nДодатково: "+xs.join("; "):"");
}
const kv=(k,v)=>`<div class="kv"><span>${k}:</span><b>${v}</b></div>`;
const lawCard=(a,i)=>`<div class="rcard ${i===SP.act?"act":""}" data-i="${i}"><div class="rt"><b>${esc(a.code)} — Стаття ${esc(a.number)}</b><span>${esc(a.title)}</span></div>${kv("Штраф",a.fine?fmt(a.fine):"—")}${kv("КПЗ",a.jail_minutes?a.jail_minutes+" хв":"—")}${kv("Розшук","★".repeat(a.wanted_level)||"—")}${a.jail_minutes>0?kv("Застава",a.bail?fmt(a.bail):"немає"):""}${xBlock(a)}<div class="ract"><button class="spb" data-act="copy">Скопіювати підсумок</button><span class="okmark">✓ Скопійовано!</span><button class="spb ghost" data-act="add">${sel.has(a.id)?"✓ У калькуляторі":"+ У калькулятор"}</button></div></div>`;
const faqCard=(f,i)=>`<div class="rcard ${i===SP.act?"act":""}" data-i="${i}"><div class="rt"><b>${esc(f.question)}</b><span>${esc(f.category)}</span></div><div class="spans" data-act="expand">${esc(f.answer)}</div><div class="ract"><button class="spb" data-act="copy">Скопіювати відповідь</button><span class="okmark">✓ Скопійовано!</span></div></div>`;
const noteCard=(n,i)=>`<div class="rcard ${i===SP.act?"act":""}" data-i="${i}"><div class="rt"><b>${esc(ntitle(n))}</b><span>${new Date(n.updated).toLocaleDateString("uk-UA")}</span></div><div class="spans" data-act="expand">${esc(n.text)}</div><div class="ract"><button class="spb" data-act="copy">Скопіювати текст</button><span class="okmark">✓ Скопійовано!</span></div></div>`;
const MODES={laws:"Закони",faq:"FAQ",notes:"Нотатки",calc:"Калькулятор"};
function noRes(q){
  const o=[["laws",lawsFound(q).length],["faq",faqFound(q).length],["notes",notesFound(q).length]].filter(([m,n])=>m!==SP.mode&&n>0);
  return`<div class="sphint">Нічого не знайдено у «${MODES[SP.mode]}».${o.map(([m,n])=>`<button class="spb ghost" data-gt="${m}">${MODES[m]} ${n}</button>`).join("")}</div>`;
}
function calcHtml(q){
  const p=picked();let h="";
  if(p.length){
    calc();
    h+=`<div class="spchips">${p.map(a=>`<span class="spchip">${esc(a.code)} ${esc(a.number)}<button data-rm="${esc(a.id)}" aria-label="Прибрати статтю">×</button></span>`).join("")}</div>`;
    h+=`<div class="sptot"><div><span>Штраф</span><b>${esc($("tf").textContent)}</b></div><div><span>КПЗ</span><b>${esc($("tj").textContent)}</b></div><div><span>Розшук</span><b>${esc($("tw").textContent)}</b></div><div><span>Застава</span><b>${esc($("tb").textContent)}</b></div></div>`;
    if(XS.length)h+=`<div class="xline"><b>Додатково</b>${XS.map(spChip).join("")}</div>`;
    if($("jnote").textContent)h+=`<div class="sphint">${esc($("jnote").textContent)}</div>`;
    h+=`<div class="ract"><button class="spb" data-act="copysum">Скопіювати підсумок</button><span class="okmark">✓ Скопійовано!</span><button class="spb ghost" data-act="clear">Скинути</button></div>`;
  }else if(!q)h+=`<div class="sphint">Додайте статті кнопкою «+ У калькулятор» у вкладці «Закони» або знайдіть їх тут.</div>`;
  if(q){
    SP.items=lawsFound(q).slice(0,8);
    h+=SP.items.map((a,i)=>`<div class="rcard ${i===SP.act?"act":""}" data-i="${i}"><div class="rt"><b>${esc(a.code)} — Стаття ${esc(a.number)}</b><span>${esc(a.title)}</span></div><div class="ract"><button class="spb" data-act="add">${sel.has(a.id)?"✓ Додано":"+ Додати"}</button></div></div>`).join("")||`<div class="sphint">Нічого не знайдено.</div>`;
  }
  return h;
}
const spRow=(l,x)=>`<div class="spm"><span>${l}</span>${x}</div>`;
const spTg=(k,on)=>`<button class="tg ${on?"on":""}" data-m="${k}" role="switch" aria-checked="${on}" aria-label="${k}"></button>`;
function menuHtml(){
  return spRow("Замок позиції",spTg("lock",ovLocked))+spRow("Наскрізний режим",spTg("click",CLICK))+spRow("Завжди поверх",spTg("top",$("ontop").checked))+spRow("Компактний режим",spTg("compact",SP.compact))
    +spRow("Прозорість",`<input type="range" min="30" max="100" value="${esc($("op").value)}" data-m="op" aria-label="Прозорість">`)
    +`<div class="spm2"><button class="spb" data-m="hide">Сховати (${esc(KEYS.toggle||"—")})</button><button class="spb danger" data-m="stop">Вимкнути оверлей</button></div>`;
}
function histHtml(){
  return HIST.length?HIST.map(h=>`<button class="sphist" data-h="${esc(h)}"><span>${esc(h)}</span></button>`).join("")+`<div class="ract"><button class="spb ghost" data-act="hclear">Очистити історію</button></div>`:'<div class="sphint">Історія пошуку порожня.</div>';
}
function spotRender(){
  const q=$("sq").value.trim();let html="";SP.items=[];
  if(SP.menu)html=menuHtml();
  else if(SP.hist)html=histHtml();
  else if(SP.mode==="laws"){if(q){SP.items=lawsFound(q);html=SP.items.length?SP.items.map(lawCard).join(""):noRes(q)}}
  else if(SP.mode==="faq"){if(q){SP.items=faqFound(q);html=SP.items.length?SP.items.map(faqCard).join(""):noRes(q)}}
  else if(SP.mode==="notes"){
    SP.items=q?notesFound(q):nsort().slice(0,5);
    html=SP.items.length?SP.items.map(noteCard).join(""):(q?noRes(q):'<div class="sphint">Нотаток поки немає. Створіть їх у лаунчері.</div>');
  }else html=calcHtml(q);
  $("spBody").innerHTML=html;$("spPanel").classList.toggle("open",!!html);
}
function pushHist(q){
  q=String(q||"").trim();if(q.length<2)return;
  HIST=[q,...HIST.filter(x=>x!==q)].slice(0,8);store.set("gov.shist",JSON.stringify(HIST));
}
async function spotCopy(btn,text){
  try{await navigator.clipboard.writeText(text)}catch(e){toast("Не вдалося скопіювати");return}
  const mark=btn.parentElement&&btn.parentElement.querySelector(".okmark");
  if(mark){mark.classList.add("show");clearTimeout(mark._t);mark._t=setTimeout(()=>mark.classList.remove("show"),1600)}
}
function spotClick(e){
  const m=e.target.closest("[data-m]");
  if(m&&m.tagName==="BUTTON"){
    const k=m.dataset.m;
    if(k==="lock")toggleLock();
    else if(k==="click")toggleClick();
    else if(k==="top"){$("ontop").checked=!$("ontop").checked;$("ontop").dispatchEvent(new Event("change"));spotRender()}
    else if(k==="compact"){SP.compact=!SP.compact;$("spot").classList.toggle("compact",SP.compact);store.set("gov.spotc",SP.compact?"1":"0");spotRender()}
    else if(k==="hide"){SP.menu=false;spotRender();overlay()}
    else if(k==="stop"){if(TAURI)invoke("stop_overlay")}
    return;
  }
  const gt=e.target.closest("[data-gt]");
  if(gt){SP.mode=gt.dataset.gt;$("spTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x.dataset.sp===SP.mode));spotRender();return}
  const hh=e.target.closest("[data-h]");
  if(hh){$("sq").value=hh.dataset.h;SP.hist=false;spotRender();$("sq").focus();return}
  const rm=e.target.closest("[data-rm]");
  if(rm){sel.delete(rm.dataset.rm);calc();spotRender();return}
  const a=e.target.closest("[data-act]");if(!a)return;
  const card=a.closest(".rcard"),it=card?SP.items[+card.dataset.i]:null,act=a.dataset.act;
  if(act==="expand"){a.classList.toggle("full");return}
  if(act==="hclear"){HIST=[];store.set("gov.shist","[]");spotRender();return}
  if(act==="clear"){sel.clear();calc();spotRender();return}
  if(act==="copysum"){spotCopy(a,sumText());return}
  if(act==="add"&&it){sel.has(it.id)?sel.delete(it.id):sel.add(it.id);calc();spotRender();return}
  if(act==="copy"&&it){
    spotCopy(a,SP.mode==="laws"?lawSummary(it):SP.mode==="faq"?it.answer:it.text);
    pushHist($("sq").value);
  }
}
function spotKey(e){
  const n=SP.items.length;
  if((e.key==="ArrowDown"||e.key==="ArrowUp")&&n&&!SP.menu&&!SP.hist){
    e.preventDefault();SP.act=(SP.act+(e.key==="ArrowDown"?1:-1)+n)%n;
    $("spBody").querySelectorAll(".rcard").forEach((c,i)=>c.classList.toggle("act",i===SP.act));
    const c=$("spBody").querySelectorAll(".rcard")[SP.act];if(c&&c.scrollIntoView)c.scrollIntoView({block:"nearest"});
  }else if(e.key==="Enter"){
    e.preventDefault();pushHist($("sq").value);
    const c=$("spBody").querySelectorAll(".rcard")[SP.act];
    const b=c&&c.querySelector('[data-act="copy"],[data-act="add"]');if(b)b.click();
  }
}
function spotEsc(){ // Esc: спершу закриває меню/історію, потім очищає пошук, потім ховає оверлей
  if(!SP)return false;
  if(SP.menu||SP.hist){SP.menu=SP.hist=false;spotRender();return true}
  if($("sq").value){$("sq").value="";SP.act=0;spotRender();return true}
  return false;
}
function spotInit(){
  HIST=(()=>{const h=parse(store.get("gov.shist"));return Array.isArray(h)?h.map(String).slice(0,8):[]})();
  SP={mode:"laws",hist:false,menu:false,act:0,items:[],h:0,r:0,t:0,compact:store.get("gov.spotc")==="1"};
  $("spot").classList.toggle("compact",SP.compact);
  $("sq").addEventListener("input",()=>{SP.hist=SP.menu=false;SP.act=0;spotRender();clearTimeout(SP.t);SP.t=setTimeout(()=>pushHist($("sq").value),1500)});
  $("sq").addEventListener("keydown",spotKey);
  $("spTabs").addEventListener("click",e=>{
    const b=e.target.closest("[data-sp]");if(!b)return;
    SP.mode=b.dataset.sp;SP.hist=SP.menu=false;SP.act=0;
    $("spTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));spotRender();$("sq").focus();
  });
  $("spHist").onclick=()=>{SP.hist=!SP.hist;SP.menu=false;spotRender()};
  $("spGear").onclick=()=>{SP.menu=!SP.menu;SP.hist=false;spotRender()};
  $("spBody").addEventListener("click",spotClick);
  $("spBody").addEventListener("input",e=>{const r=e.target.closest('[data-m="op"]');if(r)setOverlayOpacity(r.value)});
  addEventListener("focus",()=>$("sq").focus());
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(()=>{cancelAnimationFrame(SP.r);SP.r=requestAnimationFrame(spotFit)}).observe($("spotWrap"));
  spotRender();renderOvTools();spotFit();
}

// ---- завантажувач (bootstrapper): прогрес показує окреме вікно splash ----
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const withTimeout=(p,ms)=>Promise.race([p,new Promise((_,rj)=>setTimeout(()=>rj(new Error("timeout")),ms))]);
const bp=(v,t)=>{if(TAURI&&!OVERLAY)window.__TAURI__.event.emit("boot-progress",{v,t}).catch(()=>{})};
async function finish(){
  bp(100,"Готово");
  if(TAURI)invoke("boot_ready").catch(reveal);
  else{reveal();if(RESTORED)toast("Пошкоджені локальні файли відновлено")}
}
async function preload(){
  if(!TAURI)return[];
  for(let i=0;i<15;i++){try{const r=await invoke("vault_dump");Object.assign(MEM,r.data);return r.restored||[]}catch(e){await sleep(200)}}
  return[];
}
function syncUi(){
  document.querySelectorAll("[data-tg]").forEach(e=>e.dataset.u=TG_URL);
  if(!TAURI)document.body.classList.add("web");
  loadKeys();
  const o=store.get("gov.op");if(o){$("op").value=o;$("op").oninput({target:$("op")})}
  const f=store.get("gov.fz");if(f){$("fz").value=f;$("fz").oninput({target:$("fz")})}
  loadThemes();pickTheme();
  G.exe=store.get("gov.exe")||"";$("exe").value=G.exe;
  $("autoov").checked=store.get("gov.autoov")==="1";syncExeUi();renderGs();
  const fr=store.get("gov.frame")||"custom";$("frame").value=fr;document.body.classList.toggle("sysframe",fr!=="custom");
  $("closeb").value=store.get("gov.close")||"tray";
  $("auto").checked=store.get("gov.auto")==="1";
  $("autoupd").checked=store.get("gov.autoupd")!=="0";
  $("ontop").checked=store.get("gov.ontop")!=="0";
  $("smart").checked=store.get("gov.smart")!=="0";
  const bo=+(store.get("gov.bgop")||55);$("bgop").value=bo;$("bgopv").textContent=bo;
  document.documentElement.style.setProperty("--bgop",bo/100);
  document.body.classList.toggle("smart",OVERLAY&&$("smart").checked);
  ovLocked=store.get("gov.ovlock")==="1";renderOvTools();
}
function initUi(){
  syncUi();applyLinks(null);
  if(OVERLAY)document.body.classList.add("ov");
  else{addEventListener("online",()=>loadAll(false));addEventListener("resize",moveInd);requestAnimationFrame(moveInd)}
  addEventListener("offline",()=>setNet(false));
}
function pushState(){ // передає налаштування у Rust
  if(!TAURI)return;
  invoke("set_auto_overlay",{enabled:$("autoov").checked});
  invoke("set_overlay_ontop",{on:$("ontop").checked});
  invoke("set_close_mode",{tray:$("closeb").value==="tray"});
  if(!OVERLAY){pushKeys();applyFrame($("frame").value==="custom")}
}
$("autoupd").onchange=e=>store.set("gov.autoupd",e.target.checked?"1":"0");

async function main(){
  if(OVERLAY)document.body.classList.remove("pre");
  bp(6,"Ініціалізація…");
  const restored=await preload();RESTORED=restored.length>0;
  initUi();
  if(TAURI)await bootTauri();
  if(OVERLAY){loadNotes();loadFromStore();spotInit();return}
  loadNotes();
  let slow=0;setInterval(()=>{if(document.hidden)return;if(!$("hub").classList.contains("hide")||++slow%5===0)refreshNews()},60000);addEventListener("focus",()=>refreshNews());
  if(RESTORED)bp(20,"Виявлено пошкоджені локальні файли. Відновлюємо…");
  // 1. Оновлення застосунку (підписане): завантажується з прогресом, після встановлення застосунок перезапускається
  if(TAURI&&store.get("gov.autoupd")!=="0"&&navigator.onLine){
    bp(30,"Перевірка оновлень…");
    const u=await withTimeout(invoke("check_update"),6000).catch(()=>null);
    if(u){bp(40,`Завантаження версії ${u.version}…`);
      try{await invoke("install_update");return}
      catch(e){bp(45,"Не вдалося встановити оновлення. Запускаємо поточну версію…")}}
  }
  // 2. Модулі й дані: маніфест, закони, довідник, кодекси
  bp(52,"Завантаження модулів…");
  await loadAll(false,(v,t)=>bp(55+v*.4,t));
  await finish();
  if(TAURI&&store.get("gov.autoupd")==="0")checkUpdate(false);
}
main();
