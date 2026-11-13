#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod vault;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::{thread, time::Duration};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewWindow, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::DialogExt;
use std::str::FromStr;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

// Spotlight Bar: фіксована ширина, висота підлаштовується під вміст (мінімальна площа перекриття екрана)
const SPOT_W: f64 = 620.0;

struct Game { exe: Mutex<String>, running: AtomicBool }
#[derive(Clone)]
struct KeysCfg { toggle: String, click: String, lock: String, stop: String }
struct Keys(Mutex<KeysCfg>);
struct VaultState(vault::Vault);
struct Flags {
    overlay_active: AtomicBool, auto_overlay: AtomicBool, close_tray: AtomicBool, boot_ready: AtomicBool,
    on_top: AtomicBool, click_through: AtomicBool, ov_locked: AtomicBool, flush: AtomicBool, spot_h: AtomicU32,
}
impl Flags {
    fn new() -> Self {
        Flags {
            overlay_active: AtomicBool::new(false), auto_overlay: AtomicBool::new(false), close_tray: AtomicBool::new(true),
            boot_ready: AtomicBool::new(false), on_top: AtomicBool::new(true), click_through: AtomicBool::new(false),
            ov_locked: AtomicBool::new(false), flush: AtomicBool::new(false), spot_h: AtomicU32::new(200),
        }
    }
}

// ---------- зашифроване сховище ----------
fn vault(app: &AppHandle) -> Result<State<'_, VaultState>, String> {
    app.try_state::<VaultState>().ok_or_else(|| "сховище ще не готове".to_string())
}

// ---------- головне вікно ----------
fn show_main(app: &AppHandle) {
    if app.get_webview_window("splash").is_some() { return; } // під час запуску головне вікно покаже завантажувач
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_always_on_top(true); // «на передній план»
        let _ = w.set_focus();
        let _ = w.set_always_on_top(false);
    }
}

fn hide_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }
}

// Вікно вважається «притиснутим до країв», якщо воно розгорнуте або прилипло до країв екрана:
// у такому стані закруглені кути треба прибрати, інакше по кутах монітора видно прозорі зрізи.
fn is_flush(w: &WebviewWindow) -> bool {
    if w.is_maximized().unwrap_or(false) || w.is_fullscreen().unwrap_or(false) { return true; }
    let (Ok(p), Ok(s), Ok(Some(m))) = (w.outer_position(), w.outer_size(), w.current_monitor()) else { return false; };
    let (mp, ms) = (m.position(), m.size());
    let t = (12.0 * w.scale_factor().unwrap_or(1.0)) as i32;
    let left = (p.x - mp.x).abs() <= t;
    let right = ((p.x + s.width as i32) - (mp.x + ms.width as i32)).abs() <= t;
    let top = (p.y - mp.y).abs() <= t;
    (left && right) || (top && (left || right))
}

fn emit_flush(w: &WebviewWindow) {
    let f = is_flush(w);
    let app = w.app_handle();
    if app.state::<Flags>().flush.swap(f, Ordering::Relaxed) != f { let _ = app.emit("win-flush", f); }
}

// ---------- трей ----------
fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "open", "Відкрити Olymp Helper", true, None::<&str>)?)?;
    let f = app.state::<Flags>();
    // пункти оверлею показуються лише коли оверлей фактично активний
    if f.overlay_active.load(Ordering::Relaxed) {
        let hk = app.state::<Keys>().0.lock().unwrap().toggle.replace("CommandOrControl", "Ctrl");
        let label = if hk.is_empty() { "Показати / Сховати оверлей".to_string() } else { format!("Показати / Сховати оверлей ({hk})") };
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&MenuItem::with_id(app, "toggle", label, true, None::<&str>)?)?;
        let ct = if f.click_through.load(Ordering::Relaxed) { "Вимкнути наскрізний режим" } else { "Наскрізний режим" };
        menu.append(&MenuItem::with_id(app, "click", ct, true, None::<&str>)?)?;
        menu.append(&MenuItem::with_id(app, "stop", "Вимкнути оверлей", true, None::<&str>)?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Вийти", true, None::<&str>)?)?;
    Ok(menu)
}

fn rebuild_tray(app: &AppHandle) {
    if let (Some(t), Ok(m)) = (app.tray_by_id("main"), build_menu(app)) { let _ = t.set_menu(Some(m)); }
}

// ---------- оверлей ----------
// Позиція Spotlight Bar: збережена або по центру зверху першого монітора. Висоту задає вміст (spot_resize).
fn restore_pos(app: &AppHandle, w: &WebviewWindow) {
    let d = match vault(app) { Ok(v) => v.0.dump(), Err(_) => return };
    let sf = w.scale_factor().unwrap_or(1.0);
    let h = app.state::<Flags>().spot_h.load(Ordering::Relaxed).max(56) as f64;
    let _ = w.set_size(LogicalSize::new(SPOT_W, h));
    if let Some(g) = d.get("gov.ovpos").and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok()) {
        if let (Some(x), Some(y)) = (g["x"].as_i64(), g["y"].as_i64()) {
            if on_screen(app, x as i32, y as i32) { let _ = w.set_position(PhysicalPosition::new(x as i32, y as i32)); return; }
        }
    }
    if let Ok(Some(m)) = app.primary_monitor() {
        let (p, s) = (m.position(), m.size());
        let x = p.x + ((s.width as f64 - SPOT_W * sf) / 2.0) as i32;
        let _ = w.set_position(PhysicalPosition::new(x, p.y + (36.0 * sf) as i32));
    }
}

// Показує Spotlight Bar: прозоре вікно без рамки поверх гри
fn apply(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let on_top = app.state::<Flags>().on_top.load(Ordering::Relaxed);
        let _ = w.set_decorations(false);
        let _ = w.set_shadow(false);       // без системної тіні й рамки навколо прозорого вікна
        let _ = w.set_resizable(false);    // розмір вікна змінюється лише програмно (spot_resize)
        let _ = w.set_maximizable(false);
        let _ = w.set_minimizable(false);
        let _ = w.set_always_on_top(on_top);
        let _ = w.set_skip_taskbar(true);
        let _ = w.set_resizable(false);
        let _ = w.set_title("Olymp Оверлей");
        restore_pos(app, &w);
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn run_action(app: &AppHandle, name: &str) {
    match name {
        "toggle" => toggle(app),
        "click" => toggle_click(app),
        "lock" => toggle_lock(app),
        "stop" => do_stop_overlay(app),
        _ => {}
    }
}

// Глобальні клавіші діють лише поки оверлей «активний», тож не перехоплюють клавішу в інших програмах.
// Повертає назви дій, для яких комбінацію не вдалося призначити (неправильна, повторна або зайнята).
fn sync_hotkey(app: &AppHandle) -> Vec<String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let k = app.state::<Keys>().0.lock().unwrap().clone();
    let active = app.state::<Flags>().overlay_active.load(Ordering::Relaxed);
    let mut bad = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for (name, sc) in [("toggle", k.toggle), ("click", k.click), ("lock", k.lock), ("stop", k.stop)] {
        if sc.is_empty() { continue; }
        if Shortcut::from_str(&sc).is_err() || seen.contains(&sc) { bad.push(name.to_string()); continue; }
        seen.push(sc.clone());
        if !active { continue; }
        let n = name.to_string();
        let r = gs.on_shortcut(sc.as_str(), move |app, _s, ev| {
            if ev.state() == ShortcutState::Pressed { run_action(app, &n); }
        });
        if r.is_err() { bad.push(name.to_string()); }
    }
    bad
}

fn set_click(app: &AppHandle, on: bool) {
    app.state::<Flags>().click_through.store(on, Ordering::Relaxed);
    if let Some(w) = app.get_webview_window("overlay") { let _ = w.set_ignore_cursor_events(on); }
    let _ = app.emit("overlay-click", on);
    rebuild_tray(app);
}

fn toggle_click(app: &AppHandle) {
    let cur = app.state::<Flags>().click_through.load(Ordering::Relaxed);
    set_click(app, !cur);
}

fn set_overlay_active(app: &AppHandle, on: bool) {
    app.state::<Flags>().overlay_active.store(on, Ordering::Relaxed);
    let _ = app.emit("overlay-active", on);
    if !on { set_click(app, false); }
    let _ = sync_hotkey(app);
    rebuild_tray(app);
}

fn do_stop_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") { let _ = w.hide(); }
    set_overlay_active(app, false);
}

fn toggle(app: &AppHandle) {
    if !app.state::<Flags>().overlay_active.load(Ordering::Relaxed) { show_main(app); return; }
    if let Some(w) = app.get_webview_window("overlay") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            apply(app);
        }
    }
}

fn on_screen(app: &AppHandle, x: i32, y: i32) -> bool {
    app.available_monitors().map(|ms| ms.iter().any(|m| {
        let (p, s) = (m.position(), m.size());
        x >= p.x - 20 && x < p.x + s.width as i32 - 60 && y >= p.y - 20 && y < p.y + s.height as i32 - 60
    })).unwrap_or(true)
}

// Відновлює збережений стан замка оверлею.
fn restore_overlay(app: &AppHandle) {
    let Ok(v) = vault(app) else { return };
    let locked = v.0.dump().get("gov.ovlock").map(|s| s == "1").unwrap_or(false);
    app.state::<Flags>().ov_locked.store(locked, Ordering::Relaxed);
}

#[tauri::command]
fn show_overlay(app: AppHandle) {
    set_overlay_active(&app, true);
    apply(&app);
    hide_main(&app); // лаунчер згортається в трей і працює у фоні
}

#[tauri::command]
fn stop_overlay(app: AppHandle) { do_stop_overlay(&app) }

#[tauri::command]
fn toggle_overlay(app: AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        if w.is_visible().unwrap_or(false) { let _ = w.hide(); return; }
    }
    toggle(&app);
}

fn set_lock(app: &AppHandle, locked: bool) {
    app.state::<Flags>().ov_locked.store(locked, Ordering::Relaxed);
    if let Ok(v) = vault(app) { let _ = v.0.set("gov.ovlock", (if locked { "1" } else { "0" }).to_string()); }
    let _ = app.emit("overlay-lock", locked);
}

fn toggle_lock(app: &AppHandle) {
    let cur = app.state::<Flags>().ov_locked.load(Ordering::Relaxed);
    set_lock(app, !cur);
}

#[tauri::command]
fn set_overlay_lock(app: AppHandle, locked: bool) { set_lock(&app, locked) }

// Застосовує збережені (наприклад, імпортовані) позицію, розмір і стан замка оверлею.
#[tauri::command]
fn apply_overlay_state(app: AppHandle) {
    restore_overlay(&app);
    if let Some(w) = app.get_webview_window("overlay") {
        if w.is_visible().unwrap_or(false) { restore_pos(&app, &w); }
    }
}

// Перетягування Spotlight Bar системним механізмом (плавно, без проміжної обробки в JS); не працює, коли позицію заблоковано
#[tauri::command]
fn spot_drag(app: AppHandle) {
    if app.state::<Flags>().ov_locked.load(Ordering::Relaxed) { return; }
    if let Some(w) = app.get_webview_window("overlay") { let _ = w.start_dragging(); }
}

// Spotlight Bar повідомляє потрібну висоту вмісту; вікно підлаштовується, щоб не перекривати зайвого
#[tauri::command]
fn spot_resize(app: AppHandle, h: f64) {
    let h = h.clamp(56.0, 900.0);
    app.state::<Flags>().spot_h.store(h as u32, Ordering::Relaxed);
    if let Some(w) = app.get_webview_window("overlay") { let _ = w.set_size(LogicalSize::new(SPOT_W, h)); }
}

#[tauri::command]
fn set_overlay_ontop(app: AppHandle, on: bool) {
    app.state::<Flags>().on_top.store(on, Ordering::Relaxed);
    if let Some(w) = app.get_webview_window("overlay") {
        if w.is_visible().unwrap_or(false) { let _ = w.set_always_on_top(on); }
    }
}

#[tauri::command]
fn set_click_through(app: AppHandle, on: bool) { set_click(&app, on) }

#[tauri::command]
fn set_auto_overlay(app: AppHandle, enabled: bool) {
    app.state::<Flags>().auto_overlay.store(enabled, Ordering::Relaxed);
    let running = app.state::<Game>().running.load(Ordering::Relaxed);
    if enabled && running && !app.state::<Flags>().overlay_active.load(Ordering::Relaxed) {
        set_overlay_active(&app, true);
        apply(&app);
    }
}

#[tauri::command]
fn set_keybinds(app: AppHandle, keys: serde_json::Value) -> Vec<String> {
    let g = |k: &str| keys.get(k).and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    *app.state::<Keys>().0.lock().unwrap() = KeysCfg { toggle: g("toggle"), click: g("click"), lock: g("lock"), stop: g("stop") };
    let bad = sync_hotkey(&app);
    rebuild_tray(&app);
    bad
}

// ---------- службові вікна ----------
fn show_notice(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("notice") { let _ = w.set_focus(); return; }
    let _ = tauri::WebviewWindowBuilder::new(app, "notice", tauri::WebviewUrl::App("notice.html".into()))
        .title("Olymp Helper")
        .inner_size(420.0, 240.0)
        .center()
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .build();
}

#[tauri::command]
fn notice_ok(app: AppHandle) {
    if let Some(w) = app.get_webview_window("notice") { let _ = w.close(); } // Destroyed → show_main
}

fn finish_boot(app: &AppHandle) {
    if let Some(s) = app.get_webview_window("splash") {
        let _ = s.emit("boot-done", ());
        let a = app.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(450));
            if let Some(m) = a.get_webview_window("main") {
                let _ = m.show();
                let _ = m.set_focus();
            }
            if let Some(s) = a.get_webview_window("splash") { let _ = s.close(); }
        });
    }
}

// Інтерфейс завершив завантаження: вікно splash показує кнопку «Розпочати».
#[tauri::command]
fn boot_ready(app: AppHandle) {
    app.state::<Flags>().boot_ready.store(true, Ordering::Relaxed);
    let _ = app.emit("boot-ready", ());
}

#[tauri::command]
fn boot_state(app: AppHandle) -> bool { app.state::<Flags>().boot_ready.load(Ordering::Relaxed) }

#[tauri::command]
fn finish_boot_cmd(app: AppHandle) { finish_boot(&app) }

// ---------- власна рамка вікна ----------
#[tauri::command]
fn win_ctl(w: WebviewWindow, action: String) -> bool {
    match action.as_str() {
        "min" => { let _ = w.minimize(); }
        "max" => { if w.is_maximized().unwrap_or(false) { let _ = w.unmaximize(); } else { let _ = w.maximize(); } }
        "close" => { let _ = w.close(); }
        _ => {}
    }
    emit_flush(&w);
    w.is_maximized().unwrap_or(false)
}

#[tauri::command]
fn set_frame(app: AppHandle, custom: bool) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_maximized().unwrap_or(false) { return; }
        let _ = w.set_decorations(!custom);
    }
}

#[tauri::command]
fn set_close_mode(app: AppHandle, tray: bool) { app.state::<Flags>().close_tray.store(tray, Ordering::Relaxed); }

// ---------- гра ----------
#[tauri::command]
fn set_game_exe(name: String, state: State<Game>) { *state.exe.lock().unwrap() = name.chars().take(1024).collect(); }

#[tauri::command]
fn game_state(app: AppHandle) -> serde_json::Value {
    serde_json::json!({
        "running": app.state::<Game>().running.load(Ordering::Relaxed),
        "overlay": app.state::<Flags>().overlay_active.load(Ordering::Relaxed)
    })
}

// Приймає ім'я процесу ("GTA5.exe") або повний шлях до .exe. За повного шляху додатково звіряється розташування файлу.
fn is_running(sys: &mut System, raw: &str) -> bool {
    let raw = raw.trim().trim_matches('"').to_lowercase().replace('/', "\\");
    if raw.is_empty() { return false; }
    let name = raw.rsplit('\\').next().unwrap_or("").to_string();
    let full = raw.contains('\\');
    // шлях до exe запитуємо в системи лише коли користувач вказав повний шлях
    let kind = if full { ProcessRefreshKind::new().with_exe(UpdateKind::OnlyIfNotSet) } else { ProcessRefreshKind::new() };
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
    sys.processes().values().any(|p| {
        if p.name().to_string_lossy().to_lowercase() != name { return false; }
        if !full { return true; }
        p.exe().map(|e| e.to_string_lossy().to_lowercase() == raw).unwrap_or(true)
    })
}

// ---------- система ----------
#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let m = app.autolaunch();
    let r = if enabled { m.enable() } else { m.disable() };
    r.map_err(|e| e.to_string())
}

#[tauri::command]
async fn pick_exe(app: AppHandle) -> Option<String> {
    app.dialog().file().add_filter("Програма", &["exe"]).blocking_pick_file().map(|p| p.to_string())
}

// https для сайтів і mtasa:// для кнопки підключення до сервера
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if url.len() > 2048 || !(url.starts_with("https://") || url.starts_with("mtasa://")) {
        return Err("Дозволені лише https:// та mtasa:// посилання".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

// ---------- оновлення ----------
fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder().timeout(Duration::from_secs(5)).build().map_err(|e| e.to_string())
}

#[tauri::command]
fn app_version(app: AppHandle) -> String { app.package_info().version.to_string() }

#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let u = updater(&app)?.check().await.map_err(|e| e.to_string())?;
    Ok(u.map(|u| serde_json::json!({ "version": u.version, "notes": u.body })))
}

// Завантажує підписане оновлення, показує прогрес і перезапускає застосунок.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let u = updater(&app)?.check().await.map_err(|e| e.to_string())?
        .ok_or_else(|| "Оновлень немає".to_string())?;
    let a = app.clone();
    let mut got: u64 = 0;
    u.download_and_install(
        move |chunk, total| {
            got += chunk as u64;
            let _ = a.emit("update-progress", serde_json::json!({ "got": got, "total": total }));
        },
        || {},
    ).await.map_err(|e| e.to_string())?;
    app.restart()
}

// ---------- сховище: команди ----------
#[tauri::command]
fn vault_dump(app: AppHandle) -> Result<serde_json::Value, String> {
    let v = vault(&app)?;
    Ok(serde_json::json!({ "data": v.0.dump(), "restored": v.0.restored }))
}

#[tauri::command]
fn vault_set(app: AppHandle, key: String, value: String, src: String) -> Result<(), String> {
    if key.len() > 128 || value.len() > 6_000_000 { return Err("недопустимий розмір даних".into()); }
    vault(&app)?.0.set(&key, value.clone()).map_err(|e| e.to_string())?;
    let _ = app.emit("vault-changed", serde_json::json!({ "key": key, "value": value, "src": src }));
    Ok(())
}

#[tauri::command]
fn vault_del(app: AppHandle, key: String, src: String) -> Result<(), String> {
    vault(&app)?.0.del(&key).map_err(|e| e.to_string())?;
    let _ = app.emit("vault-changed", serde_json::json!({ "key": key, "value": serde_json::Value::Null, "src": src }));
    Ok(())
}

// Навігація вікон лише всередині застосунку: ніяких переходів на зовнішні сайти чи файли.
fn guard_plugin() -> tauri::plugin::TauriPlugin<Wry> {
    tauri::plugin::Builder::<Wry>::new("guard")
        .on_navigation(|_w, url| match url.scheme() {
            "http" | "https" => { let h = url.host_str().unwrap_or(""); h.ends_with("localhost") || h == "127.0.0.1" }
            "file" | "ftp" => false,
            _ => true,
        })
        .build()
}

fn main() {
    tauri::Builder::default()
        // має реєструватися першим
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_notice(app)))
        .plugin(guard_plugin())
        .manage(Game { exe: Mutex::new(String::new()), running: AtomicBool::new(false) })
        // бінди порожні, доки інтерфейс не передасть актуальні значення з налаштувань користувача
        .manage(Keys(Mutex::new(KeysCfg { toggle: String::new(), click: String::new(), lock: String::new(), stop: String::new() })))
        .manage(Flags::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // --- вікно завантаження (без рамки, заокруглене); головне вікно поки прихове ---
            if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }
            tauri::WebviewWindowBuilder::new(app, "splash", tauri::WebviewUrl::App("splash.html".into()))
                .title("Olymp Helper")
                .inner_size(480.0, 330.0)
                .center()
                .decorations(false)
                .transparent(true)
                .resizable(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .shadow(false)
                .build()?;
            // запобіжник на випадок збою інтерфейсу
            let hb = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(30));
                if !hb.state::<Flags>().boot_ready.load(Ordering::Relaxed) { finish_boot(&hb); }
            });

            // --- зашифроване сховище (секрет задається під час збірки, ключ прив'язаний до ПК) ---
            let dir = app.path().app_data_dir()?;
            let machine = machine_uid::get().unwrap_or_else(|_| "unknown".into());
            let secret = option_env!("OLYMP_STORE_SECRET").unwrap_or("olymp-dev-secret");
            app.manage(VaultState(vault::Vault::open(dir, secret, &machine)));
            restore_overlay(app.handle());

            // --- системний трей: клік по іконці розгортає вікно; меню залежить від стану оверлею ---
            let menu = build_menu(app.handle())?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Olymp Helper")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "open" => show_main(app),
                    "toggle" => toggle(app),
                    "click" => toggle_click(app),
                    "stop" => do_stop_overlay(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // --- моніторинг гри: подія лише при зміні стану; автозапуск і автозакриття оверлею ---
            let h = app.handle().clone();
            thread::spawn(move || {
                let mut sys = System::new();
                loop {
                    let raw = h.state::<Game>().exe.lock().unwrap().clone();
                    let running = is_running(&mut sys, &raw);
                    if h.state::<Game>().running.swap(running, Ordering::Relaxed) != running {
                        let _ = h.emit("game-status", running);
                        if h.state::<Flags>().auto_overlay.load(Ordering::Relaxed) {
                            if running {
                                set_overlay_active(&h, true);
                                apply(&h);
                            } else {
                                do_stop_overlay(&h);
                            }
                        }
                    }
                    // без вибраної гри нічого не перевіряємо й спимо довше: менше навантаження на CPU
                    thread::sleep(Duration::from_secs(if raw.is_empty() { 5 } else { 2 }));
                }
            });

            // --- збереження позиції й розміру оверлею (лише коли змінилися) ---
            let hg = app.handle().clone();
            thread::spawn(move || {
                let mut last = String::new();
                loop {
                    let Some(w) = hg.get_webview_window("overlay") else { thread::sleep(Duration::from_secs(3)); continue };
                    if !w.is_visible().unwrap_or(false) { thread::sleep(Duration::from_secs(3)); continue; }
                    thread::sleep(Duration::from_secs(1));
                    if let Ok(p) = w.outer_position() {
                        let j = serde_json::json!({ "x": p.x, "y": p.y }).to_string();
                        if j != last {
                            if let Ok(v) = vault(&hg) { let _ = v.0.set("gov.ovpos", j.clone()); }
                            last = j;
                        }
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|w, e| match e {
            WindowEvent::CloseRequested { api, .. } => match w.label() {
                "main" => {
                    if w.app_handle().state::<Flags>().close_tray.load(Ordering::Relaxed) {
                        api.prevent_close();
                        // коротке сповіщення «працює в треї», потім вікно ховається
                        let _ = w.emit("tray-hint", ());
                        let ww = w.clone();
                        thread::spawn(move || { thread::sleep(Duration::from_millis(1400)); let _ = ww.hide(); });
                    } else {
                        w.app_handle().exit(0);
                    }
                }
                "overlay" => { api.prevent_close(); let _ = w.hide(); }
                _ => {}
            },
            WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                if w.label() == "main" {
                    if let Some(ww) = w.app_handle().get_webview_window("main") { emit_flush(&ww); }
                }
            }
            WindowEvent::Destroyed => {
                if w.label() == "notice" { show_main(w.app_handle()); }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            toggle_overlay, show_overlay, stop_overlay, set_overlay_lock, set_overlay_ontop,
            set_click_through, set_auto_overlay, set_close_mode, set_game_exe, game_state, set_keybinds, apply_overlay_state, spot_resize, spot_drag,
            set_autostart, pick_exe, open_url, app_version, check_update, install_update,
            vault_dump, vault_set, vault_del, finish_boot_cmd, boot_ready, boot_state, notice_ok, win_ctl, set_frame
        ])
        .run(tauri::generate_context!())
        .expect("помилка запуску Olymp Helper");
}
