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
{id:"kk-2.1",number:"2.1",title:"Незаконне носіння зброї",description:"Зберігання або носіння вогнепальної зброї без ліцензії.",fine:12000,jail_minutes:25,wanted_level:3,bail:20000,tags:["зброя","ліцензія"]},
{id:"kk-3.1",number:"3.1",title:"Крадіжка транспорту",description:"Таємне або відкрите заволодіння чужим транспортним засобом.",fine:9000,jail_minutes:20,wanted_level:2,bail:12000,tags:["авто","крадіжка"]},
{id:"kk-4.1",number:"4.1",title:"Втеча від правоохоронців",description:"Умисне ухилення від зупинки або затримання.",fine:7000,jail_minutes:15,wanted_level:2,bail:9000,tags:["втеча","погоня"]}]},
{id:"adm",abbr:"АК",title:"Адміністративний Кодекс (АК)",color:"blue",articles:[
{id:"adm-1.1",number:"1.1",title:"Перевищення швидкості",description:"Рух зі швидкістю, що перевищує встановлені обмеження.",fine:1500,jail_minutes:0,wanted_level:0,bail:null,tags:["авто","швидкість","пдр"]},
{id:"adm-1.2",number:"1.2",title:"Проїзд на червоне світло",description:"Порушення сигналу світлофора.",fine:2000,jail_minutes:0,wanted_level:0,bail:null,tags:["авто","світлофор","пдр"]},
{id:"adm-2.1",number:"2.1",title:"Порушення громадського порядку",description:"Нецензурна лайка, хуліганство, створення перешкод у публічному місці.",fine:2500,jail_minutes:5,wanted_level:1,bail:2500,tags:["хуліганство","порядок"]}]},
{id:"tk",abbr:"ТК",title:"Транспортний Кодекс (ТК)",color:"gold",articles:[
{id:"tk-1.1",number:"1.1",title:"Керування без посвідчення",description:"Керування транспортом без чинного водійського посвідчення.",fine:3500,jail_minutes:5,wanted_level:1,bail:3500,tags:["авто","права"]}]}]};

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

const $=id=>document.getElementById(id);
const toast=t=>{const e=$("toast");e.textContent=t;e.style.display="block";clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display="none",2200)};
const fmt=n=>"$"+Number(n||0).toLocaleString("uk-UA");
const norm=s=>String(s??"").toLowerCase().replace(/[’ʼ'`]/g,"");
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
  p(100,"Готово");
}
// Оверлей не робить власних запитів: дані надає головне вікно через спільне зашифроване сховище.
function loadFromStore(){
  const m=parse(store.get("manifest.cache"));if(m){MAN=m;applyManifest(m)}
  const L=parse(store.get("laws.cache"));applyDB(validLaws(L)?L:FALLBACK);
  const F=parse(store.get("faq.cache"));applyFaq(validFaq(F)?F:null);
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
function artHtml(a){
  const on=sel.has(a.id);
  const b=a.jail_minutes>0?(a.bail?`<dd class="ok">${fmt(a.bail)}</dd>`:`<dd class="no">Немає</dd>`):`<dd class="no">—</dd>`;
  return `<div class="art ${on?"sel":""}" data-id="${esc(a.id)}" tabindex="0" role="checkbox" aria-checked="${on}"><input type="checkbox" ${on?"checked":""} tabindex="-1" aria-hidden="true"><div class="num">${esc(a.number)}</div><div class="body"><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p>${(a.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div><dl class="facts"><div><dt>Штраф</dt><dd>${fmt(a.fine)}</dd></div><div><dt>КПЗ</dt><dd>${a.jail_minutes?a.jail_minutes+" хв":"—"}</dd></div><div><dt>Розшук</dt><dd>${"★".repeat(a.wanted_level)||"—"}</dd></div><div><dt>Застава</dt>${b}</div></dl></div>`;
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
  IDX=all().map(a=>({id:a.id,h:norm([a.cat,a.code,a.sec,a.number,a.title,a.description,...(a.tags||[])].join(" "))}));
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
function calc(){
  const p=picked();
  const f=p.reduce((s,a)=>s+a.fine,0),raw=p.reduce((s,a)=>s+a.jail_minutes,0),j=Math.min(raw,LIM),w=Math.min(5,p.reduce((s,a)=>s+a.wanted_level,0));
  const jl=p.filter(a=>a.jail_minutes>0),noBail=jl.some(a=>!a.bail),bail=jl.reduce((s,a)=>s+(a.bail||0),0);
  $("tf").textContent=fmt(f);$("tj").textContent=j+" хв";$("tw").textContent=w?"★".repeat(w):"—";
  const tb=$("tb");tb.className=(!jl.length||noBail)?"no":"";tb.textContent=!jl.length?"—":noBail?"Немає":fmt(bail);
  $("jnote").textContent=raw>LIM?`КПЗ обмежено до ${LIM} хв (сума за статтями: ${raw} хв).`+(noBail?" Заставу не передбачено.":""):(noBail?"Серед обраних є стаття без права на заставу.":"");
  $("picked").textContent=p.length?"Обрано: "+p.map(a=>a.code+" "+a.number).join(", "):"Оберіть статті зі списку";
}
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
$("mcopy").onclick=()=>copy(MIR);

// ---- довідник (faq.json) ----
let FAQ=[],FIDX=[];const ftags=new Set();
function applyFaq(d){FAQ=(d&&Array.isArray(d.items)?d.items:[]).map((i,n)=>({...i,id:String(i.id??n),tags:i.tags||[]}));renderFaq()}
function renderFaq(){
  const tags=[...new Set(FAQ.flatMap(i=>i.tags))].sort((a,b)=>a.localeCompare(b,"uk"));
  for(const t of [...ftags])if(!tags.includes(t))ftags.delete(t);
  $("ftags").innerHTML=tags.map(t=>`<button class="chip ${ftags.has(t)?"on":""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("");
  $("flist").innerHTML=FAQ.map(i=>`<section class="code qa" data-id="${esc(i.id)}"><button class="code-h" aria-expanded="false"><span class="ct">${esc(i.question)}</span><span class="chev">▶</span></button><div class="gb"><div><div class="ans">${esc(i.answer)}</div><div class="qa-foot"><button data-copy="${esc(i.id)}">Копіювати відповідь</button>${i.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div></div></div></section>`).join("")
    +`<div class="empty" id="fempty" hidden>${FAQ.length?"Нічого не знайдено.":"Довідник порожній. Адміністрація додає питання у файл faq.json."}</div>`;
  FIDX=FAQ.map(i=>({id:i.id,h:norm([i.question,i.answer,...i.tags].join(" ")),tags:i.tags}));
  filterFaq();
}
function filterFaq(){
  const ts=norm($("fq").value.trim()).split(/\s+/).filter(Boolean),ok=new Set();
  for(const x of FIDX)if(ts.every(t=>x.h.includes(t))&&[...ftags].every(t=>x.tags.includes(t)))ok.add(x.id);
  let n=0;document.querySelectorAll("#flist .qa").forEach(g=>{const v=ok.has(g.dataset.id);g.hidden=!v;if(v)n++;g.classList.toggle("force",ts.length>0&&v)});
  $("fempty").hidden=n>0;
}
$("fq").addEventListener("input",()=>requestAnimationFrame(filterFaq));
$("ftags").addEventListener("click",e=>{const b=e.target.closest("[data-tag]");if(!b)return;const t=b.dataset.tag;ftags.has(t)?ftags.delete(t):ftags.add(t);renderFaq()});
$("flist").addEventListener("click",e=>{
  const cp=e.target.closest("[data-copy]");if(cp){const it=FAQ.find(i=>i.id===cp.dataset.copy);if(it)copy(it.answer);return}
  const h=e.target.closest(".code-h");if(h){const g=h.closest(".qa"),o=g.classList.toggle("open");h.setAttribute("aria-expanded",o)}
});

// ---- нотатки (зашифровано, автозбереження) ----
let NOTES=[],cur=null,saveT=0,dirty=false,lastRaw=null,delArm=0;
const nsort=()=>NOTES.sort((a,b)=>b.updated-a.updated);
const ntitle=n=>(n.text.split("\n").find(l=>l.trim())||"Без назви").trim().slice(0,60);
async function loadNotes(){
  const raw=store.get("notes.cache");if(raw===lastRaw&&lastRaw!==null)return;lastRaw=raw;
  const d=parse(raw);NOTES=Array.isArray(d)?d:[];
  if(!NOTES.find(n=>n.id===cur))cur=NOTES.length?nsort()[0].id:null;renderNotes();
}
async function saveNotes(){const raw=JSON.stringify(NOTES);store.set("notes.cache",raw);lastRaw=raw;dirty=false;$("nstat").textContent="Збережено"}
function renderNList(){
  $("nlist").innerHTML=nsort().map(n=>`<button class="nitem ${n.id===cur?"on":""}" data-id="${esc(n.id)}"><b>${esc(ntitle(n))}</b><span>${new Date(n.updated).toLocaleString("uk-UA",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span></button>`).join("")||'<div class="empty">Нотаток поки немає.</div>';
}
function renderNotes(){
  renderNList();const n=NOTES.find(x=>x.id===cur),t=$("ntext");
  t.disabled=!n;t.value=n?n.text:"";t.placeholder=n?"Текст нотатки…":"Створіть нотатку кнопкою «Нова нотатка»";
  $("ncopy").disabled=$("ndel").disabled=!n;
}
$("nnew").onclick=()=>{const n={id:Date.now().toString(36),text:"",updated:Date.now()};NOTES.unshift(n);cur=n.id;renderNotes();saveNotes();$("ntext").focus()};
$("nlist").addEventListener("click",e=>{const b=e.target.closest("[data-id]");if(b){cur=b.dataset.id;renderNotes()}});
$("ntext").addEventListener("input",()=>{
  const n=NOTES.find(x=>x.id===cur);if(!n)return;
  n.text=$("ntext").value;n.updated=Date.now();dirty=true;$("nstat").textContent="Збереження…";renderNList();
  clearTimeout(saveT);saveT=setTimeout(saveNotes,400);
});
$("ncopy").onclick=()=>copy($("ntext").value);
$("ndel").onclick=()=>{
  if(!delArm){delArm=setTimeout(()=>{delArm=0;$("ndel").textContent="Видалити"},3000);$("ndel").textContent="Підтвердити видалення";return}
  clearTimeout(delArm);delArm=0;$("ndel").textContent="Видалити";
  NOTES=NOTES.filter(x=>x.id!==cur);cur=NOTES.length?nsort()[0].id:null;renderNotes();saveNotes();
};
addEventListener("focus",()=>{if(!dirty)loadNotes()});

// ---- вкладки, режими, оверлей ----
const TABS=["hub","laws","db","faq","notes","set"];
function tab(t){
  TABS.forEach(x=>$(x).classList.toggle("hide",x!==t));
  document.querySelectorAll("[data-t]").forEach(b=>b.classList.toggle("on",b.dataset.t===t));
  if(t==="laws")setTimeout(()=>$("q").focus(),0);if(t==="faq")setTimeout(()=>$("fq").focus(),0);if(t==="notes")loadNotes();if(t==="hub")refreshNews();
}
document.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>tab(b.dataset.t));

function overlay(on){
  if(TAURI){invoke("toggle_overlay");return}
  document.body.classList.toggle("ov",on);if(on)tab("laws");else tab("hub");
}
$("ovClose").onclick=()=>overlay(false);
function launch(m){
  if(TAURI){invoke("show_overlay",{mode:m});return}
  document.body.classList.toggle("framed",m==="window");overlay(true);toast("Оверлей активний. Виклик: "+hotkey);
}
const modal=$("modal"),closeModal=()=>modal.classList.add("hide");
$("runOv").onclick=()=>{if(G.ov&&TAURI){invoke("stop_overlay");return}const p=store.get("gov.lm")||"ask";if(p==="ask"){modal.classList.remove("hide");modal.querySelector("[data-m]").focus()}else launch(p)};
modal.addEventListener("click",e=>{
  if(e.target===modal||e.target.id==="mcancel")return closeModal();
  const b=e.target.closest("[data-m]");if(!b)return;
  if($("rem").checked){store.set("gov.lm",b.dataset.m);$("lm").value=b.dataset.m}
  closeModal();launch(b.dataset.m);
});
$("lm").onchange=()=>{const v=$("lm").value;store.set("gov.lm",v);if(TAURI&&v!=="ask")invoke("set_overlay_mode",{mode:v})};

// ---- налаштування ----
let hotkey="F5",binding=false;
const clickKey=h=>{const p=h.split(" + "),k=p.pop();return[...p,p.includes("Shift")?"Alt":"Shift",k].join(" + ")};
const combo=e=>[e.ctrlKey&&"Ctrl",e.shiftKey&&"Shift",e.altKey&&"Alt",!["Control","Shift","Alt","Meta"].includes(e.key)&&(e.key.length===1?e.key.toUpperCase():e.key===" "?"Space":e.key)].filter(Boolean).join(" + ");
function setHK(c){hotkey=c;$("hk1").textContent=c;$("hk2").textContent=c;$("clickKey").textContent=clickKey(c);store.set("gov.hk",c);if(TAURI&&!OVERLAY)invoke("set_hotkey",{shortcut:acc(c)}).catch(()=>toast("Клавіша недоступна: "+c))}
$("bind").onclick=()=>{binding=true;$("bindHint").textContent="Натисніть нову комбінацію…"};
document.addEventListener("keydown",e=>{
  if(binding){e.preventDefault();if(["Control","Shift","Alt","Meta"].includes(e.key))return;setHK(combo(e));binding=false;$("bindHint").textContent="Збережено";return}
  if((e.ctrlKey||e.metaKey)&&e.code==="KeyK"){e.preventDefault();tab("laws");$("q").focus();$("q").select();return}
  if(!TAURI&&combo(e)===hotkey){e.preventDefault();overlay(!document.body.classList.contains("ov"))}
  if(e.key==="Escape"){
    const m=document.querySelector(".modal:not(.hide)");
    if(m){m.classList.add("hide");if(m.id==="themeModal")pickTheme();return}
    if(document.body.classList.contains("ov"))overlay(false);
  }
});
$("op").oninput=e=>{$("opv").textContent=e.target.value;document.documentElement.style.setProperty("--ov",e.target.value/100);store.set("gov.op",e.target.value)};
$("fz").oninput=e=>{$("fzv").textContent=e.target.value;document.documentElement.style.setProperty("--fs",(15*e.target.value/100)+"px");store.set("gov.fz",e.target.value)};
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
const newsItem=i=>`<article class="item"><time>${esc(i.date)}</time><div><h3>${esc(i.title)}${i.tag?`<span class="ntag">${esc(i.tag)}</span>`:""}</h3><p>${esc(i.text)}</p></div></article>`;
const newsCard=i=>`<article class="ncard">${i.tag?`<span class="ntag">${esc(i.tag)}</span>`:""}<time>${esc(i.date)}</time><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></article>`;
let newsSig="";
function setNews(items,smooth){
  newsSig=JSON.stringify(items||[]);
  NEWS=[...(items||[])];
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

// ---- кодекси та закони: окремий файл codes.json, лише повний текст ----
let CODES=[],rcur=null,DOCS=[];
function applyCodes(d){
  CODES=(d&&Array.isArray(d.codes)?d.codes:[]).map(c=>({id:String(c.id),title:String(c.title||""),color:c.color||"",abbr:c.abbr||abbrOf(String(c.title||"")),updated:c.updated||"",
    groups:[...(c.articles&&c.articles.length?[{title:"",articles:c.articles}]:[]),...(c.sections||[]).map(s=>({title:s.title||"",articles:s.articles||[]}))]}));
  renderReader();
}
const docHtml=a=>{
  const i=DOCS.push(`Ст. ${a.number}. ${a.title}\n\n${a.text??a.description??""}`)-1;
  return `<article class="doc"><div class="dh"><b>Ст. ${esc(a.number)}</b>${esc(a.title)}<button class="cp" data-cp="${i}">Копіювати</button></div><div class="dt">${esc(a.text??a.description??"")}</div>${a.note?`<div class="dn">${esc(a.note)}</div>`:""}${(a.tags||[]).length?`<div class="dtags">${a.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div>`:""}</article>`;
};
function renderReader(){
  if(!CODES.length){$("rlist").innerHTML="";$("rbody").innerHTML='<div class="empty">Кодекси ще не опубліковано. Адміністрація додає їх у файл codes.json.</div>';return}
  if(!CODES.find(c=>c.id===rcur))rcur=CODES[0].id;
  $("rlist").innerHTML=CODES.map(c=>`<button class="rl ${c.id===rcur?"on":""}" data-c="${esc(c.id)}"><span class="badge ${esc(c.color)}">${esc(c.abbr)}</span><span class="ct">${esc(c.title.replace(/\s*\([^)]{1,8}\)\s*$/,""))}</span><span class="cnt">${c.groups.reduce((s,g)=>s+g.articles.length,0)}</span></button>`).join("");
  const c=CODES.find(x=>x.id===rcur),q=norm($("rq").value.trim()).split(/\s+/).filter(Boolean);
  DOCS=[];let h=c.updated?`<p class="note" style="margin-bottom:.4em">Редакція від ${esc(c.updated)}</p>`:"";
  for(const g of c.groups){
    const arts=g.articles.filter(a=>{const t=norm([a.number,a.title,a.text,a.description,a.note,...(a.tags||[])].join(" "));return q.every(w=>t.includes(w))});
    if(!arts.length)continue;if(g.title)h+=`<div class="sec">${esc(g.title)}</div>`;h+=arts.map(docHtml).join("");
  }
  $("rbody").innerHTML=h||'<div class="empty">Нічого не знайдено.</div>';
}
$("rlist").addEventListener("click",e=>{const b=e.target.closest("[data-c]");if(b){rcur=b.dataset.c;renderReader()}});
$("rbody").addEventListener("click",e=>{const b=e.target.closest("[data-cp]");if(b)copy(DOCS[+b.dataset.cp])});
$("rq").addEventListener("input",()=>requestAnimationFrame(renderReader));

// ---- оновлення застосунку ----
let APPV="",MINV="";
const cmp=(a,b)=>{const x=a.split(".").map(Number),y=b.split(".").map(Number);for(let i=0;i<3;i++){const d=(x[i]||0)-(y[i]||0);if(d)return d}return 0};
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
  ev.listen("boot-done",()=>{setTimeout(()=>document.body.classList.remove("pre"),450);if(RESTORED)toast("Пошкоджені локальні файли відновлено")});
  ev.listen("overlay-click",e=>{CLICK=!!e.payload;renderOvTools()});
  ev.listen("win-flush",e=>document.body.classList.toggle("maxd",!!e.payload));
  ev.listen("overlay-mode",e=>document.body.classList.toggle("framed",e.payload==="window"));
  ev.listen("update-progress",e=>{const{got,total}=e.payload,pc=total?got/total*100:0;$("prog").value=pc;bp(22+pc*.7)});
  let rl=0;ev.listen("vault-changed",e=>{
    const{key,value,src}=e.payload;if(src===(OVERLAY?"overlay":"main"))return;
    if(value===null)delete MEM[key];else MEM[key]=value;
    if(OVERLAY&&(key.startsWith("gov.")||key==="laws.cache"||key==="faq.cache"||key==="manifest.cache")){clearTimeout(rl);rl=setTimeout(()=>location.reload(),300)}
    else if(key==="notes.cache"&&!dirty)loadNotes();
  });
  invoke("app_version").then(v=>{APPV=v;$("appv").textContent="v"+v;$("setv").textContent="v"+v;verCheck()});
  const lm=store.get("gov.lm");if(lm&&lm!=="ask")invoke("set_overlay_mode",{mode:lm});
  invoke("set_auto_overlay",{enabled:$("autoov").checked});
  invoke("set_overlay_ontop",{on:$("ontop").checked});
  invoke("set_close_mode",{tray:$("closeb").value==="tray"});
  if(!OVERLAY){setHK(hotkey);applyFrame($("frame").value==="custom")}
}

// ---- оверлей: замок позиції, наскрізний режим, розумна прозорість ----
let ovLocked=false,CLICK=false;
const IC_LOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const IC_OPEN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.4-2"/></svg>';
const IC_CUR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 7-6 2-2 6z"/></svg>';
function renderOvTools(){
  const l=$("ovLock"),c=$("ovClick");
  l.innerHTML=ovLocked?IC_LOCK:IC_OPEN;l.classList.toggle("on",ovLocked);
  l.title=ovLocked?"Позицію й розмір заблоковано. Натисніть, щоб розблокувати":"Заблокувати позицію й розмір";
  c.innerHTML=IC_CUR;c.classList.toggle("on",CLICK);
  c.title=CLICK?"Наскрізний режим увімкнено ("+clickKey(hotkey)+" вимикає)":"Наскрізний режим: кліки проходять у гру";
  $("ovbar").toggleAttribute("data-tauri-drag-region",!ovLocked); // заблоковано: перетягування вимкнено
}
$("ovLock").onclick=()=>{
  ovLocked=!ovLocked;MEM["gov.ovlock"]=ovLocked?"1":"0";renderOvTools();
  if(TAURI)invoke("set_overlay_lock",{locked:ovLocked}); // Rust вимикає зміну розміру й зберігає стан
  toast(ovLocked?"Позицію заблоковано":"Позицію розблоковано");
};
$("ovClick").onclick=()=>{
  if(!TAURI)return;
  invoke("set_click_through",{on:!CLICK});
  if(!CLICK)toast("Наскрізний режим: вимкнути можна клавішею "+clickKey(hotkey));
};
if(OVERLAY){
  addEventListener("blur",()=>document.body.classList.add("inactive"));
  addEventListener("focus",()=>document.body.classList.remove("inactive"));
}
$("fabHelp").onclick=()=>tab("faq");
$("ontop").onchange=e=>{store.set("gov.ontop",e.target.checked?"1":"0");if(TAURI)invoke("set_overlay_ontop",{on:e.target.checked})};
$("smart").onchange=e=>store.set("gov.smart",e.target.checked?"1":"0");
$("bgop").oninput=e=>{$("bgopv").textContent=e.target.value;store.set("gov.bgop",e.target.value)};

// ---- завантажувач (bootstrapper): прогрес показує окреме вікно splash ----
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const withTimeout=(p,ms)=>Promise.race([p,new Promise((_,rj)=>setTimeout(()=>rj(new Error("timeout")),ms))]);
const bp=(v,t)=>{if(TAURI&&!OVERLAY)window.__TAURI__.event.emit("boot-progress",{v,t}).catch(()=>{})};
async function finish(){
  bp(100,"Готово");
  if(TAURI)invoke("boot_ready").catch(()=>document.body.classList.remove("pre"));
  else{document.body.classList.remove("pre");if(RESTORED)toast("Пошкоджені локальні файли відновлено")}
}
async function preload(){
  if(!TAURI)return[];
  for(let i=0;i<15;i++){try{const r=await invoke("vault_dump");Object.assign(MEM,r.data);return r.restored||[]}catch(e){await sleep(200)}}
  return[];
}
function initUi(){
  document.querySelectorAll("[data-tg]").forEach(e=>e.dataset.u=TG_URL);
  if(!TAURI)document.body.classList.add("web");
  const h=store.get("gov.hk");if(h){hotkey=h;$("hk1").textContent=h;$("hk2").textContent=h;$("clickKey").textContent=clickKey(h)}
  const o=store.get("gov.op");if(o){$("op").value=o;$("op").oninput({target:$("op")})}
  const f=store.get("gov.fz");if(f){$("fz").value=f;$("fz").oninput({target:$("fz")})}
  loadThemes();pickTheme();applyLinks(null);
  G.exe=store.get("gov.exe")||"";$("exe").value=G.exe;
  $("autoov").checked=store.get("gov.autoov")==="1";syncExeUi();renderGs();
  const fr=store.get("gov.frame")||"custom";$("frame").value=fr;document.body.classList.toggle("sysframe",fr!=="custom");
  $("closeb").value=store.get("gov.close")||"tray";
  $("auto").checked=store.get("gov.auto")==="1";
  $("autoupd").checked=store.get("gov.autoupd")!=="0";
  $("lm").value=store.get("gov.lm")||"ask";
  $("ontop").checked=store.get("gov.ontop")!=="0";
  $("smart").checked=store.get("gov.smart")!=="0";
  const bo=+(store.get("gov.bgop")||55);$("bgop").value=bo;$("bgopv").textContent=bo;
  document.documentElement.style.setProperty("--bgop",bo/100);
  document.body.classList.toggle("smart",OVERLAY&&$("smart").checked);
  ovLocked=store.get("gov.ovlock")==="1";renderOvTools();
  if(OVERLAY){document.body.classList.add("ov");tab("laws")}else addEventListener("online",()=>loadAll(false));
  addEventListener("offline",()=>setNet(false));
}
$("autoupd").onchange=e=>store.set("gov.autoupd",e.target.checked?"1":"0");

async function main(){
  if(OVERLAY)document.body.classList.remove("pre");
  bp(6,"Ініціалізація…");
  const restored=await preload();RESTORED=restored.length>0;
  initUi();
  if(TAURI)await bootTauri();
  if(OVERLAY){loadNotes();loadFromStore();return}
  loadNotes();
  setInterval(()=>{if(!document.hidden)refreshNews()},60000);addEventListener("focus",()=>refreshNews());
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
