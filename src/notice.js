const done = () => { if (window.__TAURI__) window.__TAURI__.core.invoke("notice_ok"); };
document.getElementById("ok").addEventListener("click", done);
document.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === "Escape") done(); });
