"use strict";
const TAURI=!!window.__TAURI__,OVERLAY=new URLSearchParams(location.search).get("mode")==="overlay";
const invoke=(c,a)=>window.__TAURI__.core.invoke(c,a);
const acc=c=>c.replace(/ \+ /g,"+").replace("Arrow","");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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

// ---- шифрований локальний кеш (AES-GCM) ----
const SEED="gov-launcher/cache/v1";
let _k;const key=async()=>_k||(_k=await crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",new TextEncoder().encode(SEED)),"AES-GCM",false,["encrypt","decrypt"]));
const sealed=async o=>{const iv=crypto.getRandomValues(new Uint8Array(12));const c=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(),new TextEncoder().encode(JSON.stringify(o))));const a=new Uint8Array(12+c.length);a.set(iv);a.set(c,12);let t="";a.forEach(b=>t+=String.fromCharCode(b));return btoa(t)};
const unseal=async s=>{try{const a=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:a.slice(0,12)},await key(),a.slice(12))))}catch(e){return null}};
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

const $=id=>document.getElementById(id);
const toast=t=>{const e=$("toast");e.textContent=t;e.style.display="block";clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display="none",2200)};
const fmt=n=>"$"+Number(n||0).toLocaleString("uk-UA");
const norm=s=>String(s??"").toLowerCase().replace(/[’ʼ'`]/g,"");
async function copy(t){try{await navigator.clipboard.writeText(t);toast("Скопійовано")}catch(e){toast("Не вдалося скопіювати")}}
const abbrOf=t=>{const m=/\(([^)]{1,8})\)/.exec(t);return m?m[1]:(t.split(/\s+/).filter(w=>w.length>2).map(w=>w[0]).join("").slice(0,4).toUpperCase()||"?")};
function setNet(on){$("net").textContent=on?"Онлайн":"Офлайн режим";$("dot").classList.toggle("off",!on)}

// ---- завантаження даних ----
let MAN=null;
async function getManifest(){
  try{const r=await fetch(MANIFEST_URL,{cache:"no-store"});if(r.ok){const m=await r.json();store.set("manifest.cache",await sealed(m));return m}}catch(e){}
  const c=store.get("manifest.cache");return c?await unseal(c):null;
}
async function fetchCached(url,key){
  try{const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw 0;const d=await r.json();store.set(key,await sealed(d));return{d,src:"net"}}catch(e){}
  const c=store.get(key),d=c&&await unseal(c);return d?{d,src:"cache"}:{d:null,src:"none"};
}
async function loadAll(manual){
  MAN=await getManifest();if(MAN)applyManifest(MAN);
  const L=await fetchCached((MAN&&MAN.laws_url)||DEFAULT_LAWS_URL,"laws.cache");
  applyDB(L.d||FALLBACK);setNet(L.src==="net");
  if(manual)toast(L.src==="net"?"Базу оновлено до v"+DB.version:L.src==="cache"?"Немає зв’язку. Використано кеш":"Немає зв’язку. Завантажено вбудовану копію");
  const F=await fetchCached((MAN&&MAN.faq_url)||DEFAULT_FAQ_URL,"faq.cache");applyFaq(F.d);
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
  const d=raw?await unseal(raw):null;NOTES=Array.isArray(d)?d:[];
  if(!NOTES.find(n=>n.id===cur))cur=NOTES.length?nsort()[0].id:null;renderNotes();
}
async function saveNotes(){const raw=await sealed(NOTES);store.set("notes.cache",raw);lastRaw=raw;dirty=false;$("nstat").textContent="Збережено"}
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
const TABS=["hub","laws","faq","notes","set"];
function tab(t){
  TABS.forEach(x=>$(x).classList.toggle("hide",x!==t));
  document.querySelectorAll("[data-t]").forEach(b=>b.classList.toggle("on",b.dataset.t===t));
  if(t==="laws")setTimeout(()=>$("q").focus(),0);if(t==="faq")setTimeout(()=>$("fq").focus(),0);if(t==="notes")loadNotes();
}
document.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>tab(b.dataset.t));
$("goLaws").onclick=()=>tab("laws");$("goSet").onclick=()=>tab("set");
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
$("runOv").onclick=()=>{const p=store.get("gov.lm")||"ask";if(p==="ask"){modal.classList.remove("hide");modal.querySelector("[data-m]").focus()}else launch(p)};
modal.addEventListener("click",e=>{
  if(e.target===modal||e.target.id==="mcancel")return closeModal();
  const b=e.target.closest("[data-m]");if(!b)return;
  if($("rem").checked){store.set("gov.lm",b.dataset.m);$("lm").value=b.dataset.m}
  closeModal();launch(b.dataset.m);
});
$("lm").onchange=()=>{const v=$("lm").value;store.set("gov.lm",v);if(TAURI&&v!=="ask")invoke("set_overlay_mode",{mode:v})};

// ---- налаштування ----
let hotkey="F5",binding=false;
const combo=e=>[e.ctrlKey&&"Ctrl",e.shiftKey&&"Shift",e.altKey&&"Alt",!["Control","Shift","Alt","Meta"].includes(e.key)&&(e.key.length===1?e.key.toUpperCase():e.key===" "?"Space":e.key)].filter(Boolean).join(" + ");
function setHK(c){hotkey=c;$("hk1").textContent=c;$("hk2").textContent=c;store.set("gov.hk",c);if(TAURI&&!OVERLAY)invoke("set_hotkey",{shortcut:acc(c)}).catch(()=>toast("Клавіша недоступна: "+c))}
$("bind").onclick=()=>{binding=true;$("bindHint").textContent="Натисніть нову комбінацію…"};
document.addEventListener("keydown",e=>{
  if(binding){e.preventDefault();if(["Control","Shift","Alt","Meta"].includes(e.key))return;setHK(combo(e));binding=false;$("bindHint").textContent="Збережено";return}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();tab("laws");$("q").focus();$("q").select();return}
  if(!TAURI&&combo(e)===hotkey){e.preventDefault();overlay(!document.body.classList.contains("ov"))}
  if(e.key==="Escape"){if(!modal.classList.contains("hide"))closeModal();else if(document.body.classList.contains("ov"))overlay(false)}
});
$("op").oninput=e=>{$("opv").textContent=e.target.value;document.documentElement.style.setProperty("--ov",e.target.value/100);store.set("gov.op",e.target.value)};
$("fz").oninput=e=>{$("fzv").textContent=e.target.value;document.documentElement.style.setProperty("--fs",(15*e.target.value/100)+"px");store.set("gov.fz",e.target.value)};
$("pick").onclick=async()=>{if(!TAURI){toast("Вибір файлу доступний у застосунку");return}const p=await invoke("pick_exe");if(p){$("exe").value=p;$("exe").onchange()}};
$("exe").onchange=()=>{const n=$("exe").value.trim();store.set("gov.exe",n);if(TAURI)invoke("set_game_exe",{name:n})};
$("auto").onchange=e=>{store.set("gov.auto",e.target.checked?"1":"0");if(TAURI)invoke("set_autostart",{enabled:e.target.checked}).catch(()=>toast("Не вдалося змінити автозапуск"))};
// акцентний колір: вибір гравця має пріоритет над кольором із manifest.json
const SW=["#c4a05a","#6a8fb8","#6aa083","#b9544e","#9a86b8"];
const setAcc=c=>document.documentElement.style.setProperty("--ac",c);
function markSw(c){document.querySelectorAll("#sw .sw").forEach(b=>b.classList.toggle("on",b.dataset.c===c))}
$("sw").innerHTML=SW.map(c=>`<button class="sw" data-c="${c}" style="--c:${c}" aria-label="Колір ${c}"></button>`).join("");
$("sw").addEventListener("click",e=>{const b=e.target.closest(".sw");if(!b)return;setAcc(b.dataset.c);$("acc").value=b.dataset.c;store.set("gov.ac",b.dataset.c);markSw(b.dataset.c)});
$("acc").oninput=e=>{setAcc(e.target.value);store.set("gov.ac",e.target.value);markSw("")};
$("accReset").onclick=()=>{try{localStorage.removeItem("gov.ac")}catch(e){}const t=MAN&&MAN.theme&&MAN.theme.accent;setAcc(/^#[0-9a-f]{6}$/i.test(t||"")?t:SW[0]);$("acc").value=SW[0];markSw(SW[0])};

// ---- маніфест адміністрації ----
function applyManifest(m){
  if(typeof m.miranda==="string"&&m.miranda.trim())MIR=m.miranda;
  if(!store.get("gov.ac")&&m.theme&&/^#[0-9a-f]{6}$/i.test(m.theme.accent||""))setAcc(m.theme.accent);
  if(m.min_launcher){MINV=String(m.min_launcher);verCheck()}
  if(m.links)$("links").innerHTML=Object.entries(m.links).map(([k,u])=>`<button data-u="${esc(u)}">${esc(k)}</button>`).join("");
  if(m.banner){$("banner").textContent=m.banner.text||"";$("banner").dataset.u=m.banner.url||""}
  if(m.news_url)fetch(m.news_url,{cache:"no-store"}).then(r=>r.json()).then(n=>{$("news").innerHTML=n.items.slice(0,10).map(i=>`<article class="item"><time>${esc(i.date)}</time><div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div></article>`).join("")}).catch(()=>{});
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-u]");if(!b)return;const u=b.dataset.u;
  if(!u.startsWith("https://")){toast("Посилання ще не налаштоване адміністрацією");return}
  TAURI?invoke("open_url",{url:u}):window.open(u,"_blank","noopener");
});

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
  await invoke("set_game_exe",{name:$("exe").value.trim()});
  const gs=r=>{$("gs").textContent=r?"Гру знайдено":"Гру не запущено";$("gs").style.color=r?"var(--grn)":""};
  window.__TAURI__.event.listen("game-status",e=>gs(e.payload));invoke("game_status").then(gs);
  window.__TAURI__.event.listen("overlay-mode",e=>document.body.classList.toggle("framed",e.payload==="window"));
  window.__TAURI__.event.listen("update-progress",e=>{const{got,total}=e.payload;$("prog").value=total?got/total*100:0});
  invoke("app_version").then(v=>{APPV=v;$("appv").textContent="v"+v;$("setv").textContent="v"+v;verCheck()});
  const lm=store.get("gov.lm");if(lm&&lm!=="ask")invoke("set_overlay_mode",{mode:lm});
  if(!OVERLAY){setHK(hotkey);$("auto").checked=store.get("gov.auto")==="1";setTimeout(()=>checkUpdate(false),4000)}
}

// ---- старт ----
(function init(){
  document.querySelectorAll("[data-tg]").forEach(e=>e.dataset.u=TG_URL);
  const h=store.get("gov.hk");if(h)setHK(h);
  const o=store.get("gov.op");if(o){$("op").value=o;$("op").oninput({target:$("op")})}
  const f=store.get("gov.fz");if(f){$("fz").value=f;$("fz").oninput({target:$("fz")})}
  const a=store.get("gov.ac");if(a){setAcc(a);$("acc").value=a;markSw(a)}else markSw(SW[0]);
  $("auto").checked=store.get("gov.auto")==="1";
  $("lm").value=store.get("gov.lm")||"ask";
  const ex=store.get("gov.exe");if(ex)$("exe").value=ex;
  if(OVERLAY){document.body.classList.add("ov");tab("laws");addEventListener("storage",e=>{if(e.key&&(e.key.startsWith("gov.")||e.key==="laws.cache"||e.key==="faq.cache"))location.reload()})}
  addEventListener("online",()=>loadAll(false));addEventListener("offline",()=>setNet(false));
  if(TAURI)bootTauri();
  loadNotes();loadAll(false);
})();
