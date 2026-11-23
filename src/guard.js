// Захист інтерфейсу від вбудованих функцій браузера: контекстне меню («Зберегти як…», «Друк», «Переглянути код»),
// гарячі клавіші (F12, Ctrl+U/S/P/R…), масштабування, перетягування файлів і зображень, друк, нові вікна.
// Виділення тексту заборонене всюди, крім полів вводу та контейнерів із класом .sel-ok (текст кодексів і законів).
(function () {
  const stop = e => e.preventDefault();
  const on = (t, f, o) => addEventListener(t, f, o || true);
  on("contextmenu", stop);                               // правий клік, клавіша «меню», Shift+F10
  on("dragstart", stop);                                 // перетягування зображень і виділеного тексту
  on("dragover", stop);                                  // файл, кинутий у вікно, не відкривається як сторінка
  on("drop", stop);
  on("auxclick", e => { if (e.button === 1) e.preventDefault(); }); // середня кнопка миші
  on("wheel", e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false, capture: true }); // масштаб Ctrl+колесо
  const inField = t => !!(t && t.closest && t.closest("input,textarea"));
  const inSel = t => !!(t && t.closest && t.closest(".sel-ok"));
  let lastOk = null; // останній контейнер .sel-ok, у якому користувач клацнув: його обмежує Ctrl+A
  on("selectstart", e => {
    const t = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
    if (!inField(t) && !inSel(t)) e.preventDefault();    // без виділення будь-чого поза полями вводу й текстом кодексів
  });
  on("mousedown", e => {
    lastOk = inSel(e.target) ? e.target.closest(".sel-ok") : null;
    if (e.detail > 1 && !inField(e.target) && !lastOk) e.preventDefault(); // подвійний/потрійний клік виділяє лише в .sel-ok
  });
  const ALLOWED = ["KeyC", "KeyV", "KeyX", "KeyA", "KeyZ", "KeyY", "KeyK"]; // за кодом клавіші: працює в будь-якій розкладці
  on("keydown", e => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.altKey && !e.shiftKey && e.code === "KeyA" && lastOk && document.contains(lastOk) && !inField(e.target)) {
      e.preventDefault(); getSelection().selectAllChildren(lastOk); return; // Ctrl+A виділяє весь текст статті, а не сторінку
    }
    const fkey = /^F([1-9]|1[0-2])$/.test(e.key);       // F12 (DevTools), F7 (режим курсора), F3, F5 (оновити)…
    const okCombo = ctrl && !e.altKey && !e.shiftKey && ALLOWED.includes(e.code) && (e.code !== "KeyA" || inField(e.target));
    const nav = e.altKey && ["ArrowLeft", "ArrowRight", "Home"].includes(e.key); // «назад / вперед / додому»
    if (fkey || (ctrl && !okCombo) || nav || e.key === "ContextMenu") e.preventDefault();
  });
  window.print = () => {};
  if (window.__TAURI__) window.open = () => null;
  const tidy = () => document.querySelectorAll("input,textarea").forEach(el => {
    el.setAttribute("autocomplete", "off"); el.setAttribute("autocapitalize", "off"); el.spellcheck = false;
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tidy); else tidy();
})();
