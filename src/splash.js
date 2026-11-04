const $ = id => document.getElementById(id);
const set = (v, t) => { $("bar").style.width = Math.max(0, Math.min(100, v)) + "%"; if (t) $("st").textContent = t; };
if (window.__TAURI__) {
  const { listen } = window.__TAURI__.event;
  listen("boot-progress", e => set(e.payload.v, e.payload.t));
  listen("boot-done", () => document.body.classList.add("out"));
} else { // перегляд у браузері
  [[20, "Ініціалізація…"], [45, "Перевірка оновлень…"], [75, "Завантаження модулів…"], [100, "Готово"]]
    .forEach(([v, t], i) => setTimeout(() => set(v, t), 500 + i * 700));
  setTimeout(() => document.body.classList.add("out"), 3600);
}
