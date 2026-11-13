const $ = id => document.getElementById(id);
const set = (v, t) => {
  $("bar").style.width = Math.max(0, Math.min(100, v)) + "%";
  if (t && $("st").textContent !== t) { // плавна зміна рядка стану
    $("st").textContent = t;
    $("st").classList.remove("swap"); void $("st").offsetWidth; $("st").classList.add("swap");
  }
};
let ready = false;
function showGo() {
  if (ready) return;
  ready = true; set(100);
  $("loading").classList.add("done");
  $("go").hidden = false; $("go").focus();
}
if (window.__TAURI__) {
  const { listen } = window.__TAURI__.event, invoke = window.__TAURI__.core.invoke;
  listen("boot-progress", e => { if (!ready) set(e.payload.v, e.payload.t); });
  listen("boot-ready", showGo);
  listen("boot-done", () => document.body.classList.add("out"));
  invoke("boot_state").then(r => { if (r) showGo(); }).catch(() => {}); // готовність могла настати до відкриття цього вікна
  $("go").addEventListener("click", () => { $("go").disabled = true; invoke("finish_boot_cmd"); });
} else { // перегляд у браузері
  [[20, "Ініціалізація…"], [50, "Перевірка оновлень…"], [80, "Завантаження модулів…"]].forEach(([v, t], i) => setTimeout(() => set(v, t), 200 + i * 300));
  setTimeout(showGo, 1200);
  $("go").addEventListener("click", () => document.body.classList.add("out"));
}
