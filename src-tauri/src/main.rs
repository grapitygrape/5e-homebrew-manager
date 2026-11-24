#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod fs_cmds;
mod site_browser;

use hm_core::{
  config, data_folder, deploy_scripts, foundry, modules, patch_runner, pipeline, repos,
  run_history, runtime, script_names, server, setup, site_icons, upstream,
};
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[tauri::command]
fn get_config_path() -> String {
  config::get_config_path()
}

#[tauri::command]
fn read_config() -> Map<String, Value> {
  config::read_config()
}

#[tauri::command]
fn save_config(patch: Map<String, Value>) -> Result<Map<String, Value>, String> {
  config::save_config(patch)
}

#[tauri::command]
fn get_installed_setup() -> Option<String> {
  config::get_installed_setup()
}

#[tauri::command]
fn import_installed_setup() -> Result<Vec<String>, String> {
  config::import_installed_setup()
}

#[tauri::command]
fn read_data_font(name: String) -> Result<tauri::ipc::Response, String> {
  data_folder::read_data_font_bytes(&name).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn read_site_icon_file(file: String) -> Result<tauri::ipc::Response, String> {
  site_icons::read_site_icon_file(&file).map(tauri::ipc::Response::new)
}

#[tauri::command]
async fn foundry_status() -> Result<Value, String> {
  foundry::foundry_status().await
}

#[tauri::command]
async fn foundry_ask(client_id: String, query: Value) -> Result<Value, String> {
  foundry::foundry_ask(client_id, query).await
}

#[tauri::command]
async fn foundry_command(client_id: String, command: Value) -> Result<Value, String> {
  foundry::foundry_command(client_id, command).await
}

#[tauri::command]
async fn get_repos_overview() -> Result<repos::ReposOverview, String> {
  repos::get_repos_overview().await
}

#[tauri::command]
async fn fetch_all_repos() -> Result<repos::ReposOverview, String> {
  repos::fetch_all_repos().await
}

#[tauri::command]
async fn set_repo_lock(
  repo_id: String,
  locked: bool,
  pin_current: bool,
  follow_5e_package_json: Option<bool>,
  follow_5e_date: Option<bool>,
  note: Option<String>,
) -> Result<repos::ReposOverview, String> {
  repos::set_repo_lock(
    repo_id,
    locked,
    pin_current,
    follow_5e_package_json,
    follow_5e_date,
    note,
  )
  .await
}

#[tauri::command]
async fn lock_all_at_current(note: Option<String>) -> Result<repos::ReposOverview, String> {
  repos::lock_all_at_current(note).await
}

#[tauri::command]
async fn unlock_all_repos() -> Result<repos::ReposOverview, String> {
  repos::unlock_all_repos().await
}

#[tauri::command]
async fn checkout_repo_ref(
  repo_id: String,
  target_ref: String,
  lock_after: bool,
) -> Result<repos::ReposOverview, String> {
  repos::checkout_repo_ref(repo_id, target_ref, lock_after).await
}

#[tauri::command]
async fn sync_utils_to_5e() -> Result<repos::ReposOverview, String> {
  repos::sync_utils_to_5e().await
}

#[tauri::command]
async fn sync_homebrew_to_5e_date() -> Result<repos::ReposOverview, String> {
  repos::sync_homebrew_to_5e_date().await
}

#[tauri::command]
async fn roll_back_to_published() -> Result<repos::ReposOverview, String> {
  repos::roll_back_to_published().await
}

#[tauri::command]
async fn check_upstream_updates(fetch: Option<bool>) -> Result<upstream::UpstreamCheckReport, String> {
  upstream::check_upstream_updates(fetch).await
}

#[tauri::command]
async fn check_deploy_modules() -> Result<Vec<modules::ModuleCheck>, String> {
  patch_runner::check_deploy_modules().await
}

#[tauri::command]
async fn check_script_names() -> Result<script_names::ScriptNameCheck, String> {
  script_names::check_script_names().await
}

#[tauri::command]
fn list_deploy_modules() -> Result<Vec<modules::DeployModuleView>, String> {
  modules::list_deploy_modules()
}

#[tauri::command]
fn set_deploy_module(
  module_id: String,
  enabled: bool,
  options: Option<Map<String, Value>>,
) -> Result<(), String> {
  modules::set_deploy_module(module_id, enabled, options)
}

#[tauri::command]
fn list_deploy_images() -> Vec<run_history::DeployImageRepo> {
  run_history::list_deploy_images()
}

#[tauri::command]
fn get_last_deploy_run() -> Option<run_history::LastDeployRun> {
  run_history::get_last_deploy_run()
}

#[tauri::command]
fn get_last_prepare() -> Option<run_history::LastPrepare> {
  run_history::get_last_prepare()
}

#[tauri::command]
fn list_deploy_scripts() -> Vec<deploy_scripts::DeployScriptView> {
  deploy_scripts::list_deploy_scripts()
}

#[tauri::command]
fn save_deploy_script(
  script: deploy_scripts::DeployScriptInput,
) -> Result<deploy_scripts::DeployScriptView, String> {
  deploy_scripts::save_deploy_script(script)
}

#[tauri::command]
fn delete_deploy_script(script_id: String) -> Result<(), String> {
  deploy_scripts::delete_deploy_script(script_id)
}

#[tauri::command]
async fn run_pipeline(action: String, dry_run: bool) -> Result<pipeline::PipelineSummary, String> {
  pipeline::run_pipeline(action, dry_run).await
}

#[tauri::command]
async fn get_local_server_status() -> Result<server::LocalServerStatus, String> {
  server::get_local_server_status().await
}

#[tauri::command]
async fn restart_local_server(port: Option<u16>) -> Result<server::LocalServerStatus, String> {
  server::restart_local_server(port).await
}

#[tauri::command]
async fn pick_folder_dialog(initial_dir: Option<String>) -> Result<Option<String>, String> {
  tokio::task::spawn_blocking(move || {
    let mut dialog = rfd::FileDialog::new();
    if let Some(dir) = initial_dir {
      let p = PathBuf::from(dir);
      if p.exists() {
        dialog = dialog.set_directory(p);
      }
    }
    Ok(dialog.pick_folder().map(|p| p.to_string_lossy().replace('\\', "/")))
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_external_target(target: String) -> Result<(), String> {
  open::that(&target).map_err(|e| format!("Could not open {target}: {e}"))
}

#[tauri::command]
fn git_version() -> Option<String> {
  setup::git_version()
}

#[tauri::command]
async fn inspect_setup_folder(path: String, url: String) -> Result<setup::FolderCheck, String> {
  setup::inspect_setup_folder(path, url).await
}

#[tauri::command]
async fn sync_setup_repo(
  id: String,
  url: String,
  path: String,
  lock_id: Option<String>,
) -> Result<setup::SyncOutcome, String> {
  setup::sync_setup_repo(id, url, path, lock_id).await
}

#[tauri::command]
fn get_bundled_guides_dir() -> Option<String> {
  setup::get_bundled_guides_dir()
}

#[tauri::command]
fn get_bundled_bridge_dir() -> Option<String> {
  setup::get_bundled_bridge_dir()
}

fn main() {
  tauri::Builder::default()
    .plugin(site_browser::plugin())
    .setup(|app| {
      if let Ok(res_dir) = app.path().resource_dir() {
        runtime::set_bundled_resource_dir(res_dir);
      }
      let handle = app.handle().clone();
      runtime::set_event_sink(Arc::new(move |event, payload| {
        if event == hm_core::site_browser::BLOCKLIST_EVENT
          || event == hm_core::site_browser::SHOPS_EVENT
        {
          let _ = handle.emit_to("main", event, payload);
        } else {
          let _ = handle.emit(event, payload);
        }
      }));

      data_folder::prepare();
      // Built here, not by Tauri, so a portable copy can keep its browser
      // data in its own folder. The window's settings stay in tauri.conf.json.
      let window = app.config().app.windows.first().ok_or("tauri.conf.json has no window")?;
      let mut main_window = tauri::WebviewWindowBuilder::from_config(app.handle(), window)?;
      if let Some(dir) = config::webview_data_dir() {
        main_window = main_window.data_directory(dir);
      }
      main_window.build()?;

      server::set_modules_dir(modules::modules_dir());
      tauri::async_runtime::spawn(async {
        server::start_or_restart_local_server(None).await;
      });
      tauri::async_runtime::spawn(foundry::start_bridge_server());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_config_path,
      read_config,
      save_config,
      get_installed_setup,
      import_installed_setup,
      read_data_font,
      read_site_icon_file,
      foundry_status,
      foundry_ask,
      foundry_command,
      get_repos_overview,
      fetch_all_repos,
      set_repo_lock,
      lock_all_at_current,
      unlock_all_repos,
      checkout_repo_ref,
      sync_utils_to_5e,
      sync_homebrew_to_5e_date,
      roll_back_to_published,
      check_upstream_updates,
      check_deploy_modules,
      check_script_names,
      list_deploy_modules,
      set_deploy_module,
      list_deploy_images,
      get_last_deploy_run,
      get_last_prepare,
      list_deploy_scripts,
      save_deploy_script,
      delete_deploy_script,
      run_pipeline,
      get_local_server_status,
      restart_local_server,
      pick_folder_dialog,
      open_external_target,
      site_browser::open_site_browser,
      site_browser::take_site_blocklist_rules,
      git_version,
      inspect_setup_folder,
      sync_setup_repo,
      get_bundled_guides_dir,
      get_bundled_bridge_dir,
      fs_cmds::fs_read_text,
      fs_cmds::fs_read_many_text,
      fs_cmds::fs_write_text,
      fs_cmds::fs_read_dir,
      fs_cmds::fs_walk_files,
      fs_cmds::fs_stat,
      fs_cmds::fs_exists,
      fs_cmds::fs_mkdir,
      fs_cmds::fs_copy_file,
      fs_cmds::fs_rename,
      fs_cmds::fs_real_path,
    ])
    .run(tauri::generate_context!())
    .expect("error while running the Homebrew Manager");
}
