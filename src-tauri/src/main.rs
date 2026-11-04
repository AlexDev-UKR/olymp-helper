#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod vault;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::{thread, time::Duration};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

struct Game { exe: Mutex<String>, running: AtomicBool }
struct Mode(Mutex<String>);
struct Hotkey(Mutex<String>);
struct Flags { overlay_active: AtomicBool, auto_overlay: AtomicBool, close_tray: AtomicBool, boot_ready: AtomicBool }
struct TrayToggle(MenuItem<Wry>);
struct VaultState(vault::Vault);

// ---------- вікна ----------
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

// mode: "overlay" (прозоре, поверх гри, без рамки) або "window" (звичайне вікно з рамкою)
fn apply(app: &AppHandle, mode: &str) {
    if let Some(w) = app.get_webview_window("overlay") {
        let framed = mode == "window";
        let _ = w.set_decorations(framed);
        let _ = w.set_always_on_top(!framed);
        let _ = w.set_skip_taskbar(!framed);
        let _ = w.set_title(if framed { "Olymp Helper — База законів" } else { "Olymp Оверлей" });
        let _ = w.emit("overlay-mode", mode);
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// Глобальна клавіша реєструється лише поки оверлей «активний» (запущений вручну або грою),
// тож вона не перехоплює клавішу в інших програмах.
fn sync_hotkey(app: &AppHandle) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    if app.state::<Flags>().overlay_active.load(Ordering::Relaxed) {
        let sc = app.state::<Hotkey>().0.lock().unwrap().clone();
        if !sc.is_empty() { gs.register(sc.as_str()).map_err(|e| e.to_string())?; }
    }
    Ok(())
}

fn set_overlay_active(app: &AppHandle, on: bool) {
    app.state::<Flags>().overlay_active.store(on, Ordering::Relaxed);
    let _ = app.emit("overlay-active", on);
    let _ = sync_hotkey(app);
}

fn toggle(app: &AppHandle) {
    if !app.state::<Flags>().overlay_active.load(Ordering::Relaxed) { show_main(app); return; }
    if let Some(w) = app.get_webview_window("overlay") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let m = app.state::<Mode>().0.lock().unwrap().clone();
            apply(app, &m);
        }
    }
}

// Одноекземплярність: другий запуск показує це вікно в першому екземплярі, після «Добре» головне вікно виходить з трею.
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

// Закриває вікно завантаження (з плавним зникненням) і показує головне вікно. Безпечно викликати повторно.
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

// ---------- керування вікном (власна рамка) ----------
#[tauri::command]
fn win_ctl(w: WebviewWindow, action: String) -> bool {
    match action.as_str() {
        "min" => { let _ = w.minimize(); }
        "max" => {
            if w.is_maximized().unwrap_or(false) { let _ = w.unmaximize(); } else { let _ = w.maximize(); }
        }
        "close" => { let _ = w.close(); }
        _ => {}
    }
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

// ---------- оверлей ----------
#[tauri::command]
fn show_overlay(app: AppHandle, mode: String, state: State<Mode>) {
    *state.0.lock().unwrap() = mode.clone();
    set_overlay_active(&app, true);
    apply(&app, &mode);
    hide_main(&app); // лаунчер згортається в трей і працює у фоні
}

#[tauri::command]
fn set_overlay_mode(mode: String, state: State<Mode>) { *state.0.lock().unwrap() = mode; }

#[tauri::command]
fn toggle_overlay(app: AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        if w.is_visible().unwrap_or(false) { let _ = w.hide(); return; }
    }
    toggle(&app);
}

#[tauri::command]
fn set_auto_overlay(app: AppHandle, enabled: bool) {
    app.state::<Flags>().auto_overlay.store(enabled, Ordering::Relaxed);
    let running = app.state::<Game>().running.load(Ordering::Relaxed);
    if enabled && running && !app.state::<Flags>().overlay_active.load(Ordering::Relaxed) {
        set_overlay_active(&app, true);
        let m = app.state::<Mode>().0.lock().unwrap().clone();
        apply(&app, &m);
    }
}

#[tauri::command]
fn set_hotkey(app: AppHandle, shortcut: String) -> Result<(), String> {
    *app.state::<Hotkey>().0.lock().unwrap() = shortcut.clone();
    sync_hotkey(&app)?;
    if let Some(t) = app.try_state::<TrayToggle>() {
        let _ = t.0.set_text(format!("Показати/сховати оверлей ({})", shortcut.replace("CommandOrControl", "Ctrl")));
    }
    Ok(())
}

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
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::new().with_exe(UpdateKind::OnlyIfNotSet),
    );
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

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") { return Err("Дозволені лише https-посилання".into()); }
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

// ---------- зашифроване сховище ----------
fn vault(app: &AppHandle) -> Result<State<'_, VaultState>, String> {
    app.try_state::<VaultState>().ok_or_else(|| "сховище ще не готове".to_string())
}

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
        .manage(Mode(Mutex::new("overlay".to_string())))
        .manage(Hotkey(Mutex::new("F5".to_string())))
        .manage(Flags { overlay_active: AtomicBool::new(false), auto_overlay: AtomicBool::new(false), close_tray: AtomicBool::new(true), boot_ready: AtomicBool::new(false) })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _sc, ev| {
                    if ev.state() == ShortcutState::Pressed { toggle(app); }
                })
                .build(),
        )
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
                // якщо інтерфейс так і не повідомив про готовність, не лишаємо користувача на екрані завантаження
                if !hb.state::<Flags>().boot_ready.load(Ordering::Relaxed) { finish_boot(&hb); }
            });

            // --- зашифроване сховище (секрет задається під час збірки, ключ прив'язаний до ПК) ---
            let dir = app.path().app_data_dir()?;
            let machine = machine_uid::get().unwrap_or_else(|_| "unknown".into());
            let secret = option_env!("OLYMP_STORE_SECRET").unwrap_or("olymp-dev-secret");
            app.manage(VaultState(vault::Vault::open(dir, secret, &machine)));

            // --- системний трей: клік по іконці розгортає вікно ---
            let open = MenuItem::with_id(app, "open", "Відкрити Olymp Helper", true, None::<&str>)?;
            let tog = MenuItem::with_id(app, "toggle", "Показати/сховати оверлей (F5)", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Вийти", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &tog, &quit])?;
            app.manage(TrayToggle(tog.clone()));
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Olymp Helper")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "open" => show_main(app),
                    "toggle" => toggle(app),
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
                                let m = h.state::<Mode>().0.lock().unwrap().clone();
                                apply(&h, &m);
                            } else {
                                if let Some(w) = h.get_webview_window("overlay") { let _ = w.hide(); }
                                set_overlay_active(&h, false);
                            }
                        }
                    }
                    thread::sleep(Duration::from_secs(2));
                }
            });
            Ok(())
        })
        .on_window_event(|w, e| match e {
            WindowEvent::CloseRequested { api, .. } => match w.label() {
                "main" => {
                    if w.app_handle().state::<Flags>().close_tray.load(Ordering::Relaxed) {
                        api.prevent_close();
                        let _ = w.hide();
                    } else {
                        w.app_handle().exit(0);
                    }
                }
                "overlay" => { api.prevent_close(); let _ = w.hide(); }
                _ => {}
            },
            WindowEvent::Destroyed => {
                if w.label() == "notice" { show_main(w.app_handle()); }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            toggle_overlay, show_overlay, set_overlay_mode, set_auto_overlay, set_close_mode,
            set_game_exe, game_state, set_hotkey, set_autostart, pick_exe, open_url,
            app_version, check_update, install_update, vault_dump, vault_set, vault_del,
            finish_boot_cmd, boot_ready, boot_state, notice_ok, win_ctl, set_frame
        ])
        .run(tauri::generate_context!())
        .expect("помилка запуску Olymp Helper");
}
