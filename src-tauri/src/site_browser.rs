//! The site browser: the 5etools site in its own app window, where its "Send to
//! Foundry" buttons reach the open world without the Rivet extension.
//!
//! site-browser.js is injected into each page and plays Rivet's part. It talks to
//! this file over Tauri IPC, so no HTTP or CORS is involved.
//!
//! Pages here are remote, so Tauri denies them every command unless a capability
//! says otherwise. The commands live in an inline plugin because that lets the
//! capability grant just these. Listing them as app commands would mean an app
//! manifest naming all the others too. File and deploy commands stay out of
//! reach, whatever a page runs.

use hm_core::site_browser as core;
use serde_json::Value;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::ipc::CapabilityBuilder;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Wry};
use url::Url;

const LABEL: &str = "site";

// --- permissions ----------------------------------------------------------------

/// Origins already granted, since the capability is added at runtime from the
/// configured URL. A changed Tools URL takes effect the next time the window opens.
static GRANTED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn grant(app: &AppHandle, origins: &HashSet<String>) -> Result<(), String> {
  let mut granted = GRANTED.get_or_init(Default::default).lock().unwrap();
  for origin in origins.difference(&granted.clone()) {
    let capability = CapabilityBuilder::new(format!("site-browser-{}", granted.len()))
      .local(false)
      .remote(format!("{origin}/*"))
      .window(LABEL)
      .permission("site-browser:allow-status")
      .permission("site-browser:allow-targets")
      .permission("site-browser:allow-send")
      .permission("site-browser:allow-blocklist-add")
      .permission("site-browser:allow-shop-list")
      .permission("site-browser:allow-shop-add");
    app.add_capability(capability).map_err(|e| e.to_string())?;
    granted.insert(origin.clone());
  }
  Ok(())
}

// --- the window -----------------------------------------------------------------

/// Open the window, or bring it forward if it's already open.
#[tauri::command]
pub async fn open_site_browser(app: AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window(LABEL) {
    let _ = window.unminimize();
    return window.set_focus().map_err(|e| e.to_string());
  }

  let (tools, local) = (core::tools_url(), core::local_url());
  let start: Url = core::start_url(&tools, &local)
    .parse()
    .map_err(|e| format!("The site's URL is not valid: {e}"))?;
  let origins = core::site_origins(&tools, &local);
  grant(&app, &origins)?;

  let nav_origins = origins.clone();
  let popup_app = app.clone();
  let mut builder = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(start));
  // The same folder as the main window; WebView2 won't mix them.
  if let Some(dir) = hm_core::config::webview_data_dir() {
    builder = builder.data_directory(dir);
  }
  builder
    .title("Site Browser")
    .inner_size(1280.0, 900.0)
    .initialization_script(core::SCRIPT)
    .on_navigation(move |url| {
      if !core::is_foreign(url, &nav_origins) {
        return true;
      }
      let _ = open::that(url.as_str());
      false
    })
    .on_new_window(move |url, _features| {
      if core::is_foreign(&url, &origins) {
        let _ = open::that(url.as_str());
      } else if let Some(window) = popup_app.get_webview_window(LABEL) {
        // One window keeps every page under the send buttons' script.
        let _ = window.navigate(url);
      }
      NewWindowResponse::<Wry>::Deny
    })
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

// --- what the page can call -----------------------------------------------------

#[tauri::command]
async fn status() -> Result<Value, String> {
  Ok(core::status())
}

#[tauri::command]
async fn targets(packets: Value) -> Result<Value, String> {
  core::targets(packets).await
}

#[tauri::command]
async fn send(target_uuid: Option<String>, packets: Value) -> Result<Value, String> {
  core::send(target_uuid, packets).await
}

#[tauri::command]
async fn blocklist_add(entries: Vec<Value>) -> Result<usize, String> {
  core::blocklist_add(entries)
}

/// For the app's own window: hands over the queued rules and empties the queue.
#[tauri::command]
pub fn take_site_blocklist_rules() -> Vec<Value> {
  core::take_site_blocklist_rules()
}

#[tauri::command]
async fn shop_list() -> Result<Value, String> {
  Ok(core::shop_list())
}

#[tauri::command]
async fn shop_add(file: Option<String>, name: Option<String>, entries: Vec<Value>) -> Result<Value, String> {
  core::shop_add(file, name, entries)
}

pub fn plugin() -> TauriPlugin<Wry> {
  Builder::new("site-browser")
    .invoke_handler(tauri::generate_handler![status, targets, send, blocklist_add, shop_list, shop_add])
    .build()
}
