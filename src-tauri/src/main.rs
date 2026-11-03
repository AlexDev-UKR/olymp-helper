#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod vault;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::{thread, time::Duration};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

struct Game { exe: Mutex<String>, running: AtomicBool }
struct Mode(Mutex<String>);
struct VaultState(vault::Vault);
struct TrayToggle(MenuItem<Wry>);

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
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

fn toggle(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let m = app.state::<Mode>().0.lock().unwrap().clone();
            apply(app, &m);
        }
    }
}

#[tauri::command]
fn show_overlay(app: AppHandle, mode: String, state: State<Mode>) {
    *state.0.lock().unwrap() = mode.clone();
    apply(&app, &mode);
    hide_main(&app); // лаунчер згортається в трей і працює у фоні
}

#[tauri::command]
fn set_overlay_mode(mode: String, state: State<Mode>) { *state.0.lock().unwrap() = mode; }

#[tauri::command]
fn toggle_overlay(app: AppHandle) { toggle(&app) }

#[tauri::command]
fn set_game_exe(name: String, state: State<Game>) { *state.exe.lock().unwrap() = name; }

#[tauri::command]
fn game_status(state: State<Game>) -> bool { state.running.load(Ordering::Relaxed) }

#[tauri::command]
fn set_hotkey(app: AppHandle, shortcut: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    gs.register(shortcut.as_str()).map_err(|e| e.to_string())?;
    if let Some(t) = app.try_state::<TrayToggle>() {
        let _ = t.0.set_text(format!("Показати/сховати оверлей ({})", shortcut.replace("CommandOrControl", "Ctrl")));
    }
    Ok(())
}

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

fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder().timeout(Duration::from_secs(8)).build().map_err(|e| e.to_string())
}

fn vault(app: &AppHandle) -> Result<State<'_, VaultState>, String> {
    app.try_state::<VaultState>().ok_or_else(|| "сховище ще не готове".to_string())
}

// Усі локальні дані (налаштування, кеш законів/довідника, нотатки) лежать у зашифрованих файлах в AppData.
#[tauri::command]
fn vault_dump(app: AppHandle) -> Result<serde_json::Value, String> {
    let v = vault(&app)?;
    Ok(serde_json::json!({ "data": v.0.dump(), "restored": v.0.restored }))
}

#[tauri::command]
fn vault_set(app: AppHandle, key: String, value: String, src: String) -> Result<(), String> {
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

// Приймає ім'я процесу ("GTA5.exe") або повний шлях до .exe.
// За повного шляху додатково звіряється розташування файлу.
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

fn main() {
    tauri::Builder::default()
        .manage(Game { exe: Mutex::new(String::new()), running: AtomicBool::new(false) })
        .manage(Mode(Mutex::new("overlay".to_string())))
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
            // --- зашифроване сховище (секрет задається під час збірки, ключ прив'язаний до ПК) ---
            let dir = app.path().app_data_dir()?;
            let machine = machine_uid::get().unwrap_or_else(|_| "unknown".into());
            let secret = option_env!("OLYMP_STORE_SECRET").unwrap_or("olymp-dev-secret");
            app.manage(VaultState(vault::Vault::open(dir, secret, &machine)));

            // --- системний трей ---
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
                    if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } = ev {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // --- моніторинг процесу гри (кожні 2 с, подія лише при зміні стану) ---
            let h = app.handle().clone();
            thread::spawn(move || {
                let mut sys = System::new();
                loop {
                    let raw = h.state::<Game>().exe.lock().unwrap().clone();
                    let running = is_running(&mut sys, &raw);
                    if h.state::<Game>().running.swap(running, Ordering::Relaxed) != running {
                        let _ = h.emit("game-status", running);
                    }
                    thread::sleep(Duration::from_secs(2));
                }
            });
            Ok(())
        })
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                match w.label() {
                    "main" => w.app_handle().exit(0),
                    "overlay" => { api.prevent_close(); let _ = w.hide(); }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            toggle_overlay, show_overlay, set_overlay_mode, set_game_exe, game_status,
            set_hotkey, set_autostart, pick_exe, open_url, app_version, check_update, install_update, vault_dump, vault_set, vault_del
        ])
        .run(tauri::generate_context!())
        .expect("помилка запуску Olymp Helper");
}
