
"use strict";
const TAURI=!!window.__TAURI__,OVERLAY=new URLSearchParams(location.search).get("mode")==="overlay";
let LIM=60;
let MIR="Ви маєте право зберігати мовчання. Усе, що ви скажете, може бути використано проти вас у суді.\nВи маєте право на адвоката. Якщо ви не можете його собі дозволити, його буде надано державою.\nЧи зрозумілі вам ваші права?";
const invoke=(c,a)=>window.__TAURI__.core.invoke(c,a);
const acc=c=>c.replace(/ \+ /g,"+").replace("Arrow","");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// ---- вбудована база (резерв, якщо GitHub недоступний) ----
const FALLBACK={version:"1.1.0",limits:{max_jail_minutes:60},updated_at:"2026-11-02",categories:[
{id:"kk",title:"Кримінальний Кодекс (КК)",color:"red",articles:[
{id:"kk-1.1",number:"1.1",title:"Напад на держслужбовця",description:"Замах на життя або здоров’я працівника державних органів під час виконання службових обов’язків.",fine:15000,jail_minutes:30,wanted_level:3,bail:null,tags:["напад","силовики","тяжкий злочин"]},
{id:"kk-1.2",number:"1.2",title:"Погроза держслужбовцю",description:"Словесна або фізична погроза працівнику держоргану при виконанні обов’язків.",fine:6000,jail_minutes:15,wanted_level:2,bail:8000,tags:["погроза","силовики"]},
{id:"kk-2.1",number:"2.1",title:"Незаконне носіння зброї",description:"Зберігання або носіння вогнепальної зброї без ліцензії.",fine:12000,jail_minutes:25,wanted_level:3,bail:20000,tags:["зброя","ліцензія"]},
{id:"kk-3.1",number:"3.1",title:"Крадіжка транспорту",description:"Таємне або відкрите заволодіння чужим транспортним засобом.",fine:9000,jail_minutes:20,wanted_level:2,bail:12000,tags:["авто","крадіжка"]},
{id:"kk-4.1",number:"4.1",title:"Втеча від правоохоронців",description:"Умисне ухилення від зупинки або затримання.",fine:7000,jail_minutes:15,wanted_level:2,bail:9000,tags:["втеча","погоня"]}]},
{id:"adm",title:"Адміністративний Кодекс (АК)",color:"blue",articles:[
{id:"adm-1.1",number:"1.1",title:"Перевищення швидкості",description:"Рух зі швидкістю, що перевищує встановлені обмеження.",fine:1500,jail_minutes:0,wanted_level:0,bail:null,tags:["авто","швидкість","пдр"]},
{id:"adm-1.2",number:"1.2",title:"Проїзд на червоне світло",description:"Порушення сигналу світлофора.",fine:2000,jail_minutes:0,wanted_level:0,bail:null,tags:["авто","світлофор","пдр"]},
{id:"adm-2.1",number:"2.1",title:"Порушення громадського порядку",description:"Нецензурна лайка, хуліганство, створення перешкод у публічному місці.",fine:2500,jail_minutes:5,wanted_level:1,bail:2500,tags:["хуліганство","порядок"]}]},
{id:"tk",title:"Транспортний Кодекс (ТК)",color:"gold",articles:[
{id:"tk-1.1",number:"1.1",title:"Керування без посвідчення",description:"Керування транспортом без чинного водійського посвідчення.",fine:3500,jail_minutes:5,wanted_level:1,bail:3500,tags:["авто","права"]}]}]};

// ---- керування адміністрацією ----
// У збірку вшито лише адресу маніфесту (один раз, недоступна користувачу в інтерфейсі).
// Усе інше адміністрація змінює в самому маніфесті на GitHub, без перевипуску лаунчера:
// { "laws_url": "…/laws.json", "news_url": "…/news.json", "links": {…}, "banner": {…}, "min_launcher": "1.0.0" }
const MANIFEST_URL="https://raw.githubusercontent.com/AlexDev-UKR/olymp-laws/refs/heads/main/manifest.json";
const DEFAULT_LAWS_URL="https://raw.githubusercontent.com/AlexDev-UKR/olymp-laws/refs/heads/main/laws.json";
async function resolveLawsUrl(){
  try{const r=await fetch(MANIFEST_URL,{cache:"no-store"});if(r.ok){const m=await r.json();store.set("manifest.cache",await sealed(m));applyManifest(m);if(m.laws_url)return m.laws_url}}catch(e){}
  const c=store.get("manifest.cache"),m=c&&await unseal(c);if(m)applyManifest(m);return (m&&m.laws_url)||DEFAULT_LAWS_URL;
}

// ---- кодоване кешування (XOR + Base64): захист від ручного редагування ----
const SEED="olymp-helper/cache/v1";
let _k;const key=async()=>_k||(_k=await crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",new TextEncoder().encode(SEED)),"AES-GCM",false,["encrypt","decrypt"]));
const sealed=async o=>{const iv=crypto.getRandomValues(new Uint8Array(12));const c=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(),new TextEncoder().encode(JSON.stringify(o))));const a=new Uint8Array(12+c.length);a.set(iv);a.set(c,12);let t="";a.forEach(b=>t+=String.fromCharCode(b));return btoa(t)};
const unseal=async s=>{try{const a=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:a.slice(0,12)},await key(),a.slice(12))))}catch(e){return null}};
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

let DB=null,sel=new Set(),hotkey="F5",binding=false;
const $=id=>document.getElementById(id);
const toast=t=>{const e=$("toast");e.textContent=t;e.style.display="block";clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display="none",2200)};
const fmt=n=>"$"+n.toLocaleString("uk-UA");

function setNet(on){$("net").textContent=on?"Онлайн":"Офлайн режим";$("dot").classList.toggle("off",!on)}
function applyDB(d,src){DB=d;LIM=(d.limits&&+d.limits.max_jail_minutes)||60;$("ver").textContent=d.version;$("upd").textContent=d.updated_at;render();setNet(src!=="cache"&&src!=="builtin")}

async function loadDB(manual){
  try{
    const r=await fetch(await resolveLawsUrl(),{cache:"no-store"});
    if(!r.ok)throw 0;const d=await r.json();
    store.set("laws.cache",await sealed(d));applyDB(d,"net");if(manual)toast("Базу оновлено до v"+d.version);return;
  }catch(e){}
  const c=store.get("laws.cache");const cached=c&&await unseal(c);
  if(cached){applyDB(cached,"cache");setNet(false);if(manual)toast("Немає зв’язку. Використано кеш");return}
  applyDB(FALLBACK,"builtin");setNet(false);if(manual)toast("Немає зв’язку. Завантажено вбудовану копію");
}

const closed=new Set();let IDX=[];
const norm=s=>String(s).toLowerCase().replace(/[’ʼ'`]/g,"");
function buildIdx(){IDX=all().map(a=>({id:a.id,h:norm([a.cat,a.number,a.title,a.description,...(a.tags||[])].join(" "))}))}
function filter(){
  const ts=norm($("q").value.trim()).split(/\s+/).filter(Boolean),ok=new Set();
  for(const x of IDX)if(ts.every(t=>x.h.includes(t)))ok.add(x.id);
  let any=false;
  document.querySelectorAll(".grp").forEach(g=>{let n=0;g.querySelectorAll(".art").forEach(el=>{const v=ok.has(el.dataset.id);el.hidden=!v;if(v)n++});g.hidden=!n;g.classList.toggle("force",ts.length>0);if(n)any=true});
  const em=$("empty");if(em)em.hidden=any;
}
function render(){
  let h="";
  for(const c of DB.categories){
    const op=!closed.has(c.id);
    h+=`<div class="grp ${op?"open":""}" data-c="${esc(c.id)}"><div class="cat ${esc(c.color)}" role="button" tabindex="0" aria-expanded="${op}">${esc(c.title)}</div><div class="gb"><div>`;
    for(const a of c.articles){
      const on=sel.has(a.id);
      const b=a.jail_minutes>0?(a.bail?`<dd class="ok">${fmt(a.bail)}</dd>`:`<dd class="no">Немає</dd>`):`<dd class="no">—</dd>`;
      h+=`<div class="art ${on?"sel":""}" data-id="${esc(a.id)}" tabindex="0" role="checkbox" aria-checked="${on}"><input type="checkbox" ${on?"checked":""} tabindex="-1" aria-hidden="true"><div class="num">${esc(a.number)}</div><div class="body"><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p>${(a.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div><dl class="facts"><div><dt>Штраф</dt><dd>${fmt(a.fine)}</dd></div><div><dt>КПЗ</dt><dd>${a.jail_minutes?a.jail_minutes+" хв":"—"}</dd></div><div><dt>Розшук</dt><dd>${"★".repeat(a.wanted_level)||"—"}</dd></div><div><dt>Застава</dt>${b}</div></dl></div>`;
    }
    h+="</div></div></div>";
  }
  $("list").innerHTML=h+'<div class="empty" id="empty" hidden>Нічого не знайдено. Спробуйте інший запит або тег.</div>';
  buildIdx();filter();calc();
}
const all=()=>DB.categories.flatMap(c=>c.articles.map(a=>({...a,cat:c.title})));
const picked=()=>all().filter(a=>sel.has(a.id));
function calc(){
  const p=picked();
  const f=p.reduce((s,a)=>s+a.fine,0),raw=p.reduce((s,a)=>s+a.jail_minutes,0),j=Math.min(raw,LIM),w=Math.min(5,p.reduce((s,a)=>s+a.wanted_level,0));
  const jl=p.filter(a=>a.jail_minutes>0),noBail=jl.some(a=>!a.bail),bail=jl.reduce((s,a)=>s+(a.bail||0),0);
  $("tf").textContent=fmt(f);$("tj").textContent=j+" хв";$("tw").textContent=w?"★".repeat(w):"—";
  const tb=$("tb");tb.className=(!jl.length||noBail)?"no":"";tb.textContent=!jl.length?"—":noBail?"Немає":fmt(bail);
  $("jnote").textContent=raw>LIM?`КПЗ обмежено до ${LIM} хв (сума за статтями: ${raw} хв).`+(noBail?" Заставу не передбачено.":""):(noBail?"Серед обраних є стаття без права на заставу.":"");
  $("picked").textContent=p.length?"Обрано: "+p.map(a=>a.id.split("-")[0].toUpperCase()+" "+a.number).join(", "):"Оберіть статті зі списку";
}
function toggle(id){
  sel.has(id)?sel.delete(id):sel.add(id);
  const el=document.querySelector(`.art[data-id="${CSS.escape(id)}"]`);
  if(el){const on=sel.has(id);el.classList.toggle("sel",on);el.setAttribute("aria-checked",on);el.querySelector("input").checked=on}
  calc();
}
$("list").addEventListener("click",e=>{
  const c=e.target.closest(".cat");
  if(c){const g=c.parentElement,o=g.classList.toggle("open");o?closed.delete(g.dataset.c):closed.add(g.dataset.c);c.setAttribute("aria-expanded",o);return}
  const a=e.target.closest(".art");if(a)toggle(a.dataset.id);
});
$("list").addEventListener("keydown",e=>{if(e.key===" "||e.key==="Enter"){const t=e.target.closest(".cat,.art");if(t){e.preventDefault();t.click()}}});
let raf=0;$("q").addEventListener("input",()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(filter)});
$("sync").onclick=()=>loadDB(true);
$("clr").onclick=()=>{sel.clear();render()};

// ---- вкладки та режими ----
function tab(t){document.querySelectorAll(".tab").forEach(s=>s.classList.toggle("hide",s.id!==t));document.querySelectorAll("nav [data-t]").forEach(b=>b.classList.toggle("on",b.dataset.t===t));if(t==="laws")setTimeout(()=>$("q").focus(),0)}
document.querySelectorAll("nav [data-t]").forEach(b=>b.onclick=()=>tab(b.dataset.t));
$("goLaws").onclick=()=>tab("laws");$("goSet").onclick=()=>tab("set");
function overlay(on){if(TAURI){invoke("toggle_overlay");return}document.body.classList.toggle("ov",on);if(on)tab("laws");else tab("hub")}
function launch(m){
  if(TAURI){invoke("show_overlay",{mode:m});return}
  document.body.classList.toggle("framed",m==="window");overlay(true);toast("Оверлей активний. Виклик: "+hotkey)
}
const modal=$("modal"),closeModal=()=>modal.classList.add("hide");
$("runOv").onclick=()=>{const p=store.get("gov.lm")||"ask";if(p==="ask"){modal.classList.remove("hide");modal.querySelector("[data-m]").focus()}else launch(p)};
modal.addEventListener("click",e=>{if(e.target===modal||e.target.id==="mcancel")return closeModal();const b=e.target.closest("[data-m]");if(!b)return;
  if($("rem").checked){store.set("gov.lm",b.dataset.m);$("lm").value=b.dataset.m}
  closeModal();launch(b.dataset.m)});
$("lm").onchange=()=>{const v=$("lm").value;store.set("gov.lm",v);if(TAURI&&v!=="ask")invoke("set_overlay_mode",{mode:v})};
$("ovClose").onclick=()=>overlay(false);

// ---- налаштування ----
const combo=e=>[e.ctrlKey&&"Ctrl",e.shiftKey&&"Shift",e.altKey&&"Alt",!["Control","Shift","Alt","Meta"].includes(e.key)&&(e.key.length===1?e.key.toUpperCase():e.key==" "?"Space":e.key)].filter(Boolean).join(" + ");
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

// ---- старт ----
(function init(){
  const h=store.get("gov.hk");if(h)setHK(h);
  const o=store.get("gov.op");if(o){$("op").value=o;$("op").oninput({target:$("op")})}
  const f=store.get("gov.fz");if(f){$("fz").value=f;$("fz").oninput({target:$("fz")})}
  $("auto").checked=store.get("gov.auto")==="1";
  window.addEventListener("online",()=>loadDB(false));window.addEventListener("offline",()=>setNet(false));
  $("lm").value=store.get("gov.lm")||"ask";
  const ex=store.get("gov.exe");if(ex)$("exe").value=ex;
  if(OVERLAY){document.body.classList.add("ov");tab("laws");addEventListener("storage",e=>{if(e.key&&(e.key.startsWith("gov.")||e.key==="laws.cache"))location.reload()})}
  if(TAURI)bootTauri();
  loadDB(false);
})();

function applyManifest(m){
  if(typeof m.miranda==="string"&&m.miranda.trim())MIR=m.miranda;
  if(m.theme&&/^#[0-9a-f]{6}$/i.test(m.theme.accent||""))document.documentElement.style.setProperty("--ac",m.theme.accent);
  if(m.min_launcher){MINV=String(m.min_launcher);verCheck()}
  if(m.links)$("links").innerHTML=Object.entries(m.links).map(([k,u])=>`<button data-u="${esc(u)}">${esc(k)}</button>`).join("");
  if(m.banner){$("banner").textContent=m.banner.text||"";$("banner").dataset.u=m.banner.url||""}
  if(m.news_url)fetch(m.news_url,{cache:"no-store"}).then(r=>r.json()).then(n=>{$("news").innerHTML=n.items.slice(0,10).map(i=>`<article class="item"><time>${esc(i.date)}</time><div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div></article>`).join("")}).catch(()=>{});
}
async function bootTauri(){
  const n=$("exe").value.trim();await invoke("set_game_exe",{name:n});
  const gs=r=>{$("gs").textContent=r?"Гру знайдено":"Гру не запущено";$("gs").style.color=r?"var(--grn)":""};window.__TAURI__.event.listen("game-status",e=>gs(e.payload));invoke("game_status").then(gs);
  window.__TAURI__.event.listen("overlay-mode",e=>document.body.classList.toggle("framed",e.payload==="window"));
  const lm=store.get("gov.lm");if(lm&&lm!=="ask")invoke("set_overlay_mode",{mode:lm});
  window.__TAURI__.event.listen("update-progress",e=>{const{got,total}=e.payload;$("prog").value=total?got/total*100:0});
  invoke("app_version").then(v=>{APPV=v;$("appv").textContent="v"+v;$("setv").textContent="v"+v;verCheck()});
  if(!OVERLAY)setTimeout(()=>checkUpdate(false),4000);
  if(!OVERLAY){setHK(hotkey);$("auto").checked=store.get("gov.auto")==="1"}
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-u]");if(!b)return;const u=b.dataset.u;if(!u.startsWith("https://")){toast("Посилання ще не налаштоване адміністрацією");return}TAURI?invoke("open_url",{url:u}):window.open(u,"_blank","noopener")});

$("mir").onclick=()=>{const t=$("mtext");t.value=MIR;t.rows=6;t.hidden=!t.hidden;$("mcopy").hidden=t.hidden};
$("mcopy").onclick=async()=>{try{await navigator.clipboard.writeText(MIR);toast("Скопійовано")}catch(e){$("mtext").select();toast("Виділено. Натисніть Ctrl + C")}};

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
    else{$("updMsg").textContent="Встановлено останню версію";if(!MINV||!$("updbar").classList.contains("must"))$("updbar").classList.add("hide")}
  }catch(e){$("updMsg").textContent=manual?"Сервер оновлень недоступний":""}
  verCheck();
}
async function installUpdate(){
  $("updBtn").disabled=true;$("updTxt").textContent="Завантаження оновлення…";$("prog").hidden=false;
  try{await invoke("install_update")}catch(e){$("updBtn").disabled=false;$("prog").hidden=true;$("updTxt").textContent="Не вдалося встановити оновлення. Спробуйте пізніше."}
}
$("chk").onclick=()=>checkUpdate(true);$("updBtn").onclick=installUpdate;
