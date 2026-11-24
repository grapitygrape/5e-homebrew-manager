//! Application configuration (`hbm-config.json`): location resolution,
//! Mutex-guarded atomic reads/writes, and path resolution for the backend.

use crate::migrations::{legacy_site_deploy_folders, locate_config, migrate_config};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::net::{IpAddr, Ipv4Addr};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

/// Bookkeeping JSON files in a homebrew folder that are never brews.
pub(crate) const IGNORED_HOMEBREW: &[&str] = &["index.json", "content-blocklist.json"];

/// The installed copy's data folder, in the OS config folder.
/// lib/server/config-path.ts uses the same names.
pub(crate) const APP_FOLDER: &str = "5e Homebrew Manager";
pub(crate) const CONFIG_FILE: &str = "hbm-config.json";

/// Single-folder app keys retired in favor of `siteDeployFolders` / `homebrewDeployFolders`.
const LEGACY_APP_KEYS: &[&str] = &["deployTarget", "foundryHomebrew", "deployedHomebrew"];

/// Serializes all reads and writes of `hbm-config.json` across Rust commands and JS `save_config`.
static CONFIG_LOCK: Mutex<()> = Mutex::new(());
static ATOMIC_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoLockEntry {
  pub locked: bool,
  pub pinned_ref: Option<String>,
  pub pinned_commit: Option<String>,
  #[serde(default)]
  pub follow_5e_package_json: bool,
  /// 5e-homebrew only: on Prepare, check out the last commit before the 5e
  /// commit being built, so brews can't use what the site doesn't have yet.
  #[serde(default)]
  pub follow_5e_date: bool,
  #[serde(default)]
  pub note: String,
}

#[derive(Debug, Clone)]
pub struct ResolvedPaths {
  pub config_path: PathBuf,
  pub web_root: PathBuf,
  pub repo_5e: PathBuf,
  pub repo_utils: PathBuf,
  pub repo_homebrew: PathBuf,
  pub repo_img: PathBuf,
  /// The homebrew images checkout (`sourceRepos.images`), which may sit inside repo_5e.
  pub repo_images: PathBuf,
  /// The folder holding the config: fonts, scripts and content (data_folder.rs).
  pub data_dir: PathBuf,
  /// Folders that get the whole site on deploy.
  pub site_deploy_folders: Vec<String>,
  /// Bind address for embedded servers (`127.0.0.1` on desktop, `0.0.0.0` in container, or `HBM_BIND_HOST`).
  pub bind_host: IpAddr,
  pub local_server_port: u16,
  /// Where the Foundry bridge listens (`app.bridgePort`, default 5051).
  pub bridge_port: u16,
  /// Where the self-contained live site server listens (`HBM_SITE_PORT` / `app.sitePort`, default 8080).
  pub site_port: u16,
  /// Subpath mount for the live site server (`HBM_SITE_BASE_PATH` / `app.siteBasePath`, default `/`).
  pub site_base_path: String,
  /// Public URL of the live site (`HBM_SITE_URL` / `app.toolsUrl` / `HBM_TOOLS_URL`).
  pub site_url: String,
  pub repos: HashMap<String, RepoLockEntry>,
}

impl ResolvedPaths {
  /// External URL for the candidate preview server on `port`: `HBM_PREVIEW_URL` when set,
  /// otherwise `http://localhost:{port}`. In a container the host may publish the preview
  /// on another port (`HBM_PREVIEW_PUBLIC_PORT`), and the browser swaps in its own hostname.
  pub fn preview_url_for(&self, port: u16) -> String {
    preview_url_with(
      env::var("HBM_PREVIEW_URL").ok().as_deref(),
      env_port("HBM_PREVIEW_PUBLIC_PORT"),
      port,
    )
  }
}

pub(crate) fn preview_url_with(env_url: Option<&str>, public_port: Option<u16>, port: u16) -> String {
  if let Some(u) = env_url.map(str::trim).filter(|s| !s.is_empty()) {
    return u.trim_end_matches('/').to_string();
  }
  format!("http://localhost:{}", public_port.unwrap_or(port))
}

/// Resolve the bind IP address from `HBM_BIND_HOST` and `HBM_CONTAINER`.
pub(crate) fn resolve_bind_host(bind_host: Option<&str>, container: Option<&str>) -> IpAddr {
  if let Some(ip) = bind_host
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .and_then(|s| s.parse::<IpAddr>().ok())
  {
    return ip;
  }
  if container
    .map(str::trim)
    .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
  {
    return IpAddr::V4(Ipv4Addr::UNSPECIFIED);
  }
  IpAddr::V4(Ipv4Addr::LOCALHOST)
}

/// Normalize a site base path so it always starts with `/` and has no trailing `/` (unless `"/"`).
pub(crate) fn normalize_base_path(raw: Option<&str>) -> String {
  let Some(trimmed) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
    return "/".to_string();
  };
  let inner = trimmed.trim_matches('/');
  if inner.is_empty() {
    "/".to_string()
  } else {
    format!("/{inner}")
  }
}

/// `map[key]` as a mutable JSON object, created (or reset) if missing or not an object.
pub(crate) fn ensure_object<'a>(map: &'a mut Map<String, Value>, key: &str) -> &'a mut Map<String, Value> {
  let slot = map.entry(key.to_string()).or_insert_with(|| Value::Object(Map::new()));
  if !slot.is_object() {
    *slot = Value::Object(Map::new());
  }
  slot.as_object_mut().unwrap()
}

pub fn slash_path(p: &Path) -> String {
  p.to_string_lossy().replace('\\', "/")
}

/// `%APPDATA%` on Windows, Application Support on macOS, XDG elsewhere.
fn os_config_dir() -> PathBuf {
  let home = env::var_os("HOME")
    .or_else(|| env::var_os("USERPROFILE"))
    .map(PathBuf::from)
    .unwrap_or_default();
  if cfg!(target_os = "windows") {
    env::var_os("APPDATA")
      .map(PathBuf::from)
      .unwrap_or_else(|| home.join("AppData/Roaming"))
  } else if cfg!(target_os = "macos") {
    home.join("Library/Application Support")
  } else {
    env::var_os("XDG_CONFIG_HOME")
      .filter(|v| !v.is_empty())
      .map(PathBuf::from)
      .unwrap_or_else(|| home.join(".config"))
  }
}

/// The installed copy's config file, where it is now.
fn app_config_file() -> PathBuf {
  os_config_dir().join(APP_FOLDER).join(CONFIG_FILE)
}

/// The installed copy's config file, for a portable copy to import.
fn installed_config_file() -> PathBuf {
  app_config_file()
}

/// Found once per run, so the migration happens at most once. The portable
/// zip's config is in its data folder instead; see `config_target`.
pub fn config_file_path() -> PathBuf {
  static PATH: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
  PATH
    .get_or_init(|| {
      let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
      // `tauri dev` runs from src-tauri/, so check the folder above too.
      let mut legacy = vec![cwd.join(CONFIG_FILE)];
      if let Some(parent) = cwd.parent() {
        legacy.push(parent.join(CONFIG_FILE));
      }
      let portable = portable_data_dir();
      let env_override = env::var_os("HBM_CONFIG_PATH").map(PathBuf::from);
      let app_file = app_config_file();
      resolve_config(env_override, portable.as_deref(), app_file, legacy)
    })
    .clone()
}

/// `locate_config` for this copy.
fn resolve_config(env_override: Option<PathBuf>, portable_dir: Option<&Path>, app_file: PathBuf, legacy: Vec<PathBuf>) -> PathBuf {
  let (target, legacy) = config_target(portable_dir, app_file, legacy);
  locate_config(env_override, &target, &legacy)
}

/// The installed copy's config, when this is a portable copy using its own
/// config and the machine has an installed one to import.
fn installed_to_import(portable_dir: Option<&Path>, current: &Path, app_file: &Path) -> Option<PathBuf> {
  let dir = portable_dir?;
  (current == dir.join(CONFIG_FILE) && app_file.is_file()).then(|| app_file.to_path_buf())
}

/// For the setup page: the installed config a portable copy could import.
pub fn get_installed_setup() -> Option<String> {
  let portable = portable_data_dir();
  installed_to_import(portable.as_deref(), &config_file_path(), &installed_config_file()).map(|p| slash_path(&p))
}

/// Replace this copy's config with the installed one and copy across the
/// installed data folder's files that this one lacks. Returns the files that
/// couldn't be copied.
pub fn import_installed_setup() -> Result<Vec<String>, String> {
  let portable = portable_data_dir();
  let current = config_file_path();
  let installed = installed_to_import(portable.as_deref(), &current, &installed_config_file())
    .ok_or("There's no installed copy's setup to import.")?;
  let _guard = CONFIG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  import_setup(&installed, &current)
}

fn import_setup(installed: &Path, target: &Path) -> Result<Vec<String>, String> {
  migrate_config(installed, target)?;
  match (installed.parent(), target.parent()) {
    (Some(from), Some(to)) => Ok(crate::data_folder::seed_from(from, to)),
    _ => Ok(Vec::new()),
  }
}

/// Ships in the portable zip, beside the exe.
const PORTABLE_MARKER: &str = "portable";
/// A portable copy's own folder, beside the exe. One folder, so a copy run
/// straight from Downloads doesn't scatter files across it.
const PORTABLE_DATA_DIR: &str = "data";

/// `data/` beside the exe when the `portable` file is there.
fn portable_dir_in(exe_dir: Option<&Path>) -> Option<PathBuf> {
  exe_dir
    .filter(|dir| dir.join(PORTABLE_MARKER).is_file())
    .map(|dir| dir.join(PORTABLE_DATA_DIR))
}

/// The portable copy's data folder, or None for an installed or dev copy.
fn portable_data_dir() -> Option<PathBuf> {
  let exe = env::current_exe().ok()?;
  portable_dir_in(exe.parent())
}

/// Where a portable copy's windows keep their browser data (localStorage,
/// cache, the site's IndexedDB). Every window must use the same folder:
/// WebView2 won't mix data folders in one process.
pub fn webview_data_dir() -> Option<PathBuf> {
  portable_data_dir().map(|dir| dir.join("webview"))
}

/// The config file to use and the older ones to seed it from. A portable copy
/// keeps its config in its data folder, so it travels with the app. It starts
/// empty; setup offers to import an installed copy's (`import_installed_setup`).
fn config_target(portable_dir: Option<&Path>, app_file: PathBuf, legacy: Vec<PathBuf>) -> (PathBuf, Vec<PathBuf>) {
  match portable_dir {
    Some(dir) => (dir.join(CONFIG_FILE), Vec::new()),
    None => (app_file, legacy),
  }
}

/// The config file the webview's services read. Absolute, because the webview
/// resolves relative source paths against its folder and has no cwd of its own.
pub fn get_config_path() -> String {
  let path = config_file_path();
  std::path::absolute(&path).unwrap_or(path).to_string_lossy().into_owned()
}

/// Write `text` to a sibling temp file and rename it into `path`, so readers
/// never see a truncated or half-written `hbm-config.json`.
pub(crate) fn write_json_atomic(path: &Path, text: &str) -> Result<(), String> {
  let parent = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or_else(|| Path::new("."));
  fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  let seq = ATOMIC_SEQ.fetch_add(1, Ordering::Relaxed);
  let name = path.file_name().and_then(|n| n.to_str()).unwrap_or(CONFIG_FILE);
  let tmp = parent.join(format!(".{name}.{}.{seq}.tmp", std::process::id()));
  fs::write(&tmp, text).map_err(|e| e.to_string())?;
  if let Err(err) = fs::rename(&tmp, path) {
    let _ = fs::remove_file(&tmp);
    return Err(err.to_string());
  }
  Ok(())
}

fn read_config_unlocked(path: &Path) -> Map<String, Value> {
  let Ok(raw) = fs::read_to_string(path) else {
    return Map::new();
  };
  serde_json::from_str::<Map<String, Value>>(&raw).unwrap_or_default()
}

fn write_config_unlocked(path: &Path, map: &Map<String, Value>) -> Result<(), String> {
  let formatted = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
  write_json_atomic(path, &format!("{formatted}\n"))
}

pub fn read_raw_config() -> Map<String, Value> {
  let _guard = CONFIG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  read_config_unlocked(&config_file_path())
}

/// Read, mutate, and atomically write `hbm-config.json` under `CONFIG_LOCK`.
pub(crate) fn update_raw_config<T>(
  f: impl FnOnce(&mut Map<String, Value>) -> Result<T, String>,
) -> Result<T, String> {
  let _guard = CONFIG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let path = config_file_path();
  let mut map = read_config_unlocked(&path);
  let out = f(&mut map)?;
  write_config_unlocked(&path, &map)?;
  Ok(out)
}

/// Apply a Settings save patch over the current config, matching `mergeStoredConfig`
/// in `src/lib/data/config.ts`: unowned top-level keys (`repos`, `deploy`) and
/// unowned `app` keys survive, and saving `app` drops retired single-folder keys.
fn merge_config_patch(current: &mut Map<String, Value>, patch: Map<String, Value>) {
  for (key, value) in patch {
    if key == "app" {
      if let Value::Object(next_app) = value {
        let app = ensure_object(current, "app");
        for legacy in LEGACY_APP_KEYS {
          app.remove(*legacy);
        }
        for (k, v) in next_app {
          app.insert(k, v);
        }
      }
      continue;
    }
    current.insert(key, value);
  }
}

/// Read the current `hbm-config.json` under `CONFIG_LOCK`.
pub fn read_config() -> Map<String, Value> {
  read_raw_config()
}

/// Merge a Settings/Setup patch into `hbm-config.json` atomically under `CONFIG_LOCK`
/// and return the resulting config object.
pub fn save_config(patch: Map<String, Value>) -> Result<Map<String, Value>, String> {
  update_raw_config(|current| {
    merge_config_patch(current, patch);
    Ok(current.clone())
  })
}

fn extract_source_path(map: &Map<String, Value>, key: &str) -> Option<PathBuf> {
  map
    .get(key)
    .and_then(|v| v.get("path"))
    .and_then(|v| v.as_str())
    .map(|s| s.trim())
    .filter(|s| !s.is_empty())
    .map(PathBuf::from)
}

fn parse_dotenv_file(path: &Path) -> HashMap<String, String> {
  let mut out = HashMap::new();
  let Ok(content) = fs::read_to_string(path) else {
    return out;
  };
  for line in content.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
      continue;
    }
    if let Some((k, v)) = trimmed.split_once('=') {
      let clean_val = v.trim().trim_matches('"').trim_matches('\'').to_string();
      out.insert(k.trim().to_string(), clean_val);
    }
  }
  out
}

/// The `.env` in the data folder, beside the config file.
pub(crate) fn load_dotenv_vars(data_dir: &Path) -> HashMap<String, String> {
  if data_dir.as_os_str().is_empty() {
    return HashMap::new();
  }
  parse_dotenv_file(&data_dir.join(".env"))
}

pub fn resolve_paths() -> ResolvedPaths {
  let config_path = config_file_path();
  paths_from(&read_raw_config(), &config_path)
}

pub(crate) fn app_str<'a>(app: Option<&'a Map<String, Value>>, key: &str) -> Option<&'a str> {
  app
    .and_then(|a| a.get(key))
    .and_then(|v| v.as_str())
    .map(str::trim)
    .filter(|s| !s.is_empty())
}

/// `sourceRepos.<id>.path`, when set.
fn source_repo_path(map: &Map<String, Value>, id: &str) -> Option<PathBuf> {
  map
    .get("sourceRepos")
    .and_then(|v| v.get(id))
    .and_then(|v| v.get("path"))
    .and_then(|v| v.as_str())
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(PathBuf::from)
}

/// `base/name`, or nothing when `base` is unset.
fn child_of(base: &Path, name: &str) -> PathBuf {
  if base.as_os_str().is_empty() {
    PathBuf::new()
  } else {
    base.join(name)
  }
}

fn env_port(var: &str) -> Option<u16> {
  env::var(var)
    .ok()
    .and_then(|s| s.trim().parse::<u16>().ok())
    .filter(|&p| p > 0)
}

/// Resolve every path from a parsed config. An unset repo stays empty: no guesses.
pub(crate) fn paths_from(map: &Map<String, Value>, config_path: &Path) -> ResolvedPaths {
  let app = map.get("app").and_then(|v| v.as_object());

  let repo_5e = source_repo_path(map, "tools")
    .or_else(|| extract_source_path(map, "data").and_then(|p| p.parent().map(Path::to_path_buf)))
    .unwrap_or_default();

  let web_root = app_str(app, "webRoot")
    .map(PathBuf::from)
    .or_else(|| repo_5e.parent().map(Path::to_path_buf))
    .unwrap_or_default();

  let repo_utils = source_repo_path(map, "utils")
    .or_else(|| {
      extract_source_path(map, "schema").and_then(|p| p.parent()?.parent().map(Path::to_path_buf))
    })
    .unwrap_or_default();

  let repo_homebrew = source_repo_path(map, "homebrew")
    .or_else(|| extract_source_path(map, "partnered"))
    .unwrap_or_default();

  let repo_img = source_repo_path(map, "siteImages").unwrap_or_else(|| child_of(&repo_5e, "img"));
  let repo_images = source_repo_path(map, "images").unwrap_or_else(|| child_of(&repo_5e, "homebrew-img"));

  let data_dir = crate::data_folder::data_dir_for(config_path);
  let dotenv = load_dotenv_vars(&data_dir);

  let listed: Option<Vec<String>> = app
    .and_then(|a| a.get("siteDeployFolders"))
    .and_then(|v| v.as_array())
    .map(|list| {
      list
        .iter()
        .filter_map(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
    });
  let site_deploy_folders = listed.unwrap_or_else(|| legacy_site_deploy_folders(app, &dotenv));

  let bind_host = resolve_bind_host(
    env::var("HBM_BIND_HOST").ok().as_deref(),
    env::var("HBM_CONTAINER").ok().as_deref(),
  );

  let local_server_port = env_port("HBM_PREVIEW_PORT")
    .or_else(|| {
      app
        .and_then(|a| a.get("localServerPort"))
        .and_then(|v| v.as_u64())
        .map(|p| p as u16)
    })
    .unwrap_or(5050);

  let bridge_port = env_port("HBM_BRIDGE_PORT")
    .or_else(|| {
      app
        .and_then(|a| a.get("bridgePort"))
        .and_then(|v| v.as_u64())
        .map(|p| p as u16)
    })
    .unwrap_or(5051);

  let site_port = env_port("HBM_SITE_PORT")
    .or_else(|| {
      app
        .and_then(|a| a.get("sitePort"))
        .and_then(|v| v.as_u64())
        .map(|p| p as u16)
    })
    .unwrap_or(8080);

  let env_base = env::var("HBM_SITE_BASE_PATH").ok();
  let site_base_path = normalize_base_path(
    env_base
      .as_deref()
      .filter(|s| !s.trim().is_empty())
      .or_else(|| app_str(app, "siteBasePath")),
  );

  let site_url = env::var("HBM_SITE_URL")
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .or_else(|| app_str(app, "toolsUrl").map(str::to_string))
    .or_else(|| {
      env::var("HBM_TOOLS_URL")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    })
    .unwrap_or_default();

  let mut repos: HashMap<String, RepoLockEntry> = map
    .get("repos")
    .and_then(|v| serde_json::from_value(v.clone()).ok())
    .unwrap_or_default();

  for id in crate::repos::REPO_IDS {
    repos.entry(id.to_string()).or_insert_with(|| RepoLockEntry {
      follow_5e_package_json: id == "5etools-utils",
      ..Default::default()
    });
  }

  ResolvedPaths {
    config_path: config_path.to_path_buf(),
    web_root,
    repo_5e,
    repo_utils,
    repo_homebrew,
    repo_img,
    repo_images,
    data_dir,
    site_deploy_folders,
    bind_host,
    local_server_port,
    bridge_port,
    site_port,
    site_base_path,
    site_url,
    repos,
  }
}

pub(crate) fn save_repo_locks(repos: &HashMap<String, RepoLockEntry>) -> Result<(), String> {
  let val = serde_json::to_value(repos).map_err(|e| e.to_string())?;
  update_raw_config(|map| {
    map.insert("repos".to_string(), val);
    Ok(())
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;
  use serde_json::json;

  #[test]
  fn config_target_uses_the_app_config_folder_without_the_portable_file() {
    let dir = temp_dir("installed");
    let app_file = dir.join("app/hbm-config.json");
    let portable = portable_dir_in(Some(&dir));
    assert_eq!(portable, None);
    let (target, legacy) = config_target(portable.as_deref(), app_file.clone(), vec![dir.join("old.json")]);
    assert_eq!(target, app_file);
    assert_eq!(legacy, vec![dir.join("old.json")]);
  }

  /// An installed copy's config and one of its scripts, under `dir/app`.
  fn installed_copy(dir: &Path) -> PathBuf {
    let app_file = dir.join("app/hbm-config.json");
    fs::create_dir_all(dir.join("app/scripts")).unwrap();
    fs::write(&app_file, "{\"app\":{\"toolsUrl\":\"installed\"}}").unwrap();
    fs::write(dir.join("app/scripts/purge.mjs"), "purge").unwrap();
    app_file
  }

  #[test]
  fn portable_copy_starts_empty_beside_an_installed_one() {
    let dir = temp_dir("portable");
    let exe_dir = dir.join("portable-app");
    fs::create_dir_all(&exe_dir).unwrap();
    fs::write(exe_dir.join(PORTABLE_MARKER), "").unwrap();
    fs::write(exe_dir.join(CONFIG_FILE), "{\"app\":{\"toolsUrl\":\"beside the exe\"}}").unwrap();
    let app_file = installed_copy(&dir);

    let portable = portable_dir_in(Some(&exe_dir));
    assert_eq!(portable, Some(exe_dir.join("data")));
    let target = exe_dir.join("data").join(CONFIG_FILE);
    let legacy = vec![exe_dir.join(CONFIG_FILE)];
    assert_eq!(resolve_config(None, portable.as_deref(), app_file.clone(), legacy), target);
    // Neither the installed config nor an old one beside the exe is copied in.
    assert!(!target.exists());
    assert!(!exe_dir.join("data/scripts/purge.mjs").exists());
  }

  #[test]
  fn only_a_portable_copy_using_its_own_config_offers_the_installed_one() {
    let dir = temp_dir("offer");
    let app_file = installed_copy(&dir);
    let data = dir.join("portable-app/data");
    let own = data.join(CONFIG_FILE);
    assert_eq!(installed_to_import(Some(&data), &own, &app_file), Some(app_file.clone()));
    // Installed copy, HBM_CONFIG_PATH in use, or nothing installed.
    assert_eq!(installed_to_import(None, &app_file, &app_file), None);
    assert_eq!(installed_to_import(Some(&data), &dir.join("mine.json"), &app_file), None);
    assert_eq!(installed_to_import(Some(&data), &own, &dir.join("none/hbm-config.json")), None);
  }

  #[test]
  fn importing_replaces_the_config_and_adds_missing_files() {
    let dir = temp_dir("import");
    let app_file = installed_copy(&dir);
    let target = dir.join("portable-app/data").join(CONFIG_FILE);
    fs::create_dir_all(target.parent().unwrap().join("scripts")).unwrap();
    fs::write(&target, "{\"app\":{\"toolsUrl\":\"portable\"}}").unwrap();
    fs::write(target.parent().unwrap().join("scripts/mine.mjs"), "mine").unwrap();

    assert!(import_setup(&app_file, &target).unwrap().is_empty());
    assert!(fs::read_to_string(&target).unwrap().contains("installed"));
    let scripts = target.parent().unwrap().join("scripts");
    assert_eq!(fs::read_to_string(scripts.join("purge.mjs")).unwrap(), "purge");
    assert_eq!(fs::read_to_string(scripts.join("mine.mjs")).unwrap(), "mine");
  }

  #[test]
  fn write_json_atomic_creates_parents_and_replaces_existing_without_leftover_tmp() {
    let dir = temp_dir("atomic-config");
    let target = dir.join("nested/hbm-config.json");
    write_json_atomic(&target, "{\"v\":1}\n").unwrap();
    assert_eq!(fs::read_to_string(&target).unwrap(), "{\"v\":1}\n");

    write_json_atomic(&target, "{\"v\":2}\n").unwrap();
    assert_eq!(fs::read_to_string(&target).unwrap(), "{\"v\":2}\n");

    let leftovers: Vec<_> = fs::read_dir(target.parent().unwrap())
      .unwrap()
      .flatten()
      .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
      .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
  }

  #[test]
  fn merge_config_patch_preserves_rust_keys_and_drops_legacy_app_keys() {
    let mut current: Map<String, Value> = serde_json::from_value(json!({
      "repos": { "5e": { "locked": true } },
      "deploy": { "lastRun": { "at": 10 } },
      "app": {
        "localServerPort": 5055,
        "deployTarget": "W:/old",
        "deployedHomebrew": "W:/old/homebrew",
        "toolsUrl": "https://old.example"
      }
    }))
    .unwrap();
    let patch: Map<String, Value> = serde_json::from_value(json!({
      "guides": { "path": "./guides" },
      "app": {
        "toolsUrl": "https://new.example",
        "siteDeployFolders": ["W:/new"]
      }
    }))
    .unwrap();

    merge_config_patch(&mut current, patch);

    assert_eq!(current["repos"]["5e"]["locked"], json!(true));
    assert_eq!(current["deploy"]["lastRun"]["at"], json!(10));
    assert_eq!(current["guides"]["path"], json!("./guides"));
    assert_eq!(current["app"]["localServerPort"], json!(5055));
    assert_eq!(current["app"]["toolsUrl"], json!("https://new.example"));
    assert_eq!(current["app"]["siteDeployFolders"], json!(["W:/new"]));
    assert!(current["app"].get("deployTarget").is_none());
    assert!(current["app"].get("deployedHomebrew").is_none());
  }

  #[test]
  fn an_empty_config_resolves_no_repo_paths() {
    let paths = paths_from(&Map::new(), Path::new("C:/cfg/hbm-config.json"));
    assert_eq!(paths.repo_5e, PathBuf::new());
    assert_eq!(paths.repo_utils, PathBuf::new());
    assert_eq!(paths.repo_homebrew, PathBuf::new());
    assert_eq!(paths.repo_images, PathBuf::new());
    assert!(paths.site_deploy_folders.is_empty());
    for id in crate::repos::REPO_IDS {
      assert!(paths.repos.contains_key(id), "missing default lock entry for {id}");
    }
    assert!(paths.repos["5etools-utils"].follow_5e_package_json);
    assert!(!paths.repos["homebrew-img"].follow_5e_package_json);
  }

  #[test]
  fn source_repos_win_over_the_legacy_sources() {
    let map: Map<String, Value> = serde_json::from_str(
      r#"{
        "data": { "path": "C:/repos/5e/data" },
        "schema": { "path": "C:/repos/5etools-utils/schema/brew" },
        "partnered": { "path": "C:/repos/5e-homebrew" },
        "sourceRepos": { "tools": { "url": "", "path": "C:/h/tools" } },
        "app": { "siteDeployFolders": ["W:/5e", " ", "X:/copy"] }
      }"#,
    )
    .unwrap();
    let paths = paths_from(&map, Path::new("C:/cfg/hbm-config.json"));
    assert_eq!(paths.repo_5e, PathBuf::from("C:/h/tools"));
    assert_eq!(paths.repo_images, PathBuf::from("C:/h/tools").join("homebrew-img"));
    assert_eq!(paths.repo_img, PathBuf::from("C:/h/tools").join("img"));
    assert_eq!(paths.repo_utils, PathBuf::from("C:/repos/5etools-utils"));
    assert_eq!(paths.repo_homebrew, PathBuf::from("C:/repos/5e-homebrew"));
    assert_eq!(paths.site_deploy_folders, vec!["W:/5e", "X:/copy"]);
  }

  #[test]
  fn site_images_folder_follows_source_repos() {
    let map: Map<String, Value> = serde_json::from_str(
      r#"{ "sourceRepos": {
        "tools": { "url": "", "path": "C:/h/tools" },
        "siteImages": { "url": "", "path": "D:/imgs" }
      } }"#,
    )
    .unwrap();
    let paths = paths_from(&map, Path::new("C:/cfg/hbm-config.json"));
    assert_eq!(paths.repo_img, PathBuf::from("D:/imgs"));
  }

  #[test]
  fn legacy_deployed_homebrew_implies_the_site_folder() {
    let map: Map<String, Value> =
      serde_json::from_str(r#"{ "app": { "deployedHomebrew": "W:/5e/homebrew" } }"#).unwrap();
    let paths = paths_from(&map, Path::new("C:/cfg/hbm-config.json"));
    assert_eq!(paths.site_deploy_folders, vec!["W:/5e"]);
  }

  #[test]
  fn resolve_bind_host_defaults_to_localhost_and_switches_for_containers_or_explicit_ip() {
    assert_eq!(resolve_bind_host(None, None), IpAddr::V4(Ipv4Addr::LOCALHOST));
    assert_eq!(resolve_bind_host(None, Some("1")), IpAddr::V4(Ipv4Addr::UNSPECIFIED));
    assert_eq!(resolve_bind_host(None, Some("true")), IpAddr::V4(Ipv4Addr::UNSPECIFIED));
    assert_eq!(
      resolve_bind_host(Some("192.168.1.50"), Some("1")),
      "192.168.1.50".parse::<IpAddr>().unwrap()
    );
    assert_eq!(resolve_bind_host(Some("invalid"), None), IpAddr::V4(Ipv4Addr::LOCALHOST));
  }

  #[test]
  fn normalize_base_path_handles_slashes_and_empty_inputs() {
    assert_eq!(normalize_base_path(None), "/");
    assert_eq!(normalize_base_path(Some("")), "/");
    assert_eq!(normalize_base_path(Some("/")), "/");
    assert_eq!(normalize_base_path(Some("5e")), "/5e");
    assert_eq!(normalize_base_path(Some("/5e/")), "/5e");
    assert_eq!(normalize_base_path(Some(" /nested/path/ ")), "/nested/path");
  }

  #[test]
  fn preview_url_with_uses_override_when_set() {
    assert_eq!(preview_url_with(None, None, 5050), "http://localhost:5050");
    assert_eq!(preview_url_with(Some("  "), None, 5050), "http://localhost:5050");
    assert_eq!(
      preview_url_with(Some("https://preview.example.com/"), Some(15050), 5050),
      "https://preview.example.com"
    );
  }

  #[test]
  fn preview_url_with_uses_published_port() {
    assert_eq!(preview_url_with(None, Some(15050), 5050), "http://localhost:15050");
  }
}
