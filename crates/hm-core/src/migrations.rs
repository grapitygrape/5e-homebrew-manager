//! Pre-0.4.0 upgrade migrations and portable config path-absolutization.
//!
//! Isolated here so `config.rs` and `data_folder.rs` stay focused on current
//! layout and atomic config I/O. `migrate_config` / `absolutize` are also used
//! by portable copies importing an installed setup (`config::import_installed_setup`).

use crate::config::{app_str, slash_path, write_json_atomic};
use crate::data_folder::SCRIPTS_DIR;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const OLD_SCRIPTS_DIR: &str = "deploy-scripts";

// ── Config & legacy path migrations ─────────────────────────────────────────

/// HBM_CONFIG_PATH, else the app-config file. The first time there's none, an
/// older config found beside the app (`legacy`) is copied there and used.
pub(crate) fn locate_config(env_override: Option<PathBuf>, app_file: &Path, legacy: &[PathBuf]) -> PathBuf {
  if let Some(custom) = env_override {
    return custom;
  }
  if app_file.exists() {
    return app_file.to_path_buf();
  }
  if let Some(old) = legacy.iter().find(|p| p.exists()) {
    match migrate_config(old, app_file) {
      Ok(()) => return app_file.to_path_buf(),
      // Keep working from the old file rather than lose the user's settings.
      Err(err) => {
        eprintln!("Couldn't copy {} to {}: {err}", old.display(), app_file.display());
        return old.clone();
      }
    }
  }
  app_file.to_path_buf()
}

/// `value` against `base`, with `.` and `..` folded away. URLs and absolute paths pass through.
fn absolutize(value: &str, base: &Path) -> String {
  let v = value.trim();
  if v.is_empty() || v.contains("://") || Path::new(v).is_absolute() || is_drive_path(v) {
    return value.to_string();
  }
  let mut out = PathBuf::new();
  for part in base.join(v).components() {
    match part {
      std::path::Component::CurDir => {}
      std::path::Component::ParentDir => {
        out.pop();
      }
      other => out.push(other),
    }
  }
  slash_path(&out)
}

/// `C:/…` or `C:\…`. Linux's `is_absolute` doesn't know drive letters, and a
/// config written on Windows can be migrated inside the Linux container.
fn is_drive_path(v: &str) -> bool {
  let b = v.as_bytes();
  b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'/' || b[2] == b'\\')
}

/// Copy `from` to `to`, making relative paths absolute against `from`'s folder,
/// since they'd otherwise resolve against the app-config folder.
pub(crate) fn migrate_config(from: &Path, to: &Path) -> Result<(), String> {
  let raw = fs::read_to_string(from).map_err(|e| e.to_string())?;
  let mut map: Map<String, Value> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  let base = from.parent().unwrap_or(Path::new("."));
  let fix = |v: &mut Value| {
    if let Some(s) = v.as_str() {
      *v = Value::String(absolutize(s, base));
    }
  };

  for key in ["data", "schema", "guides", "homebrew", "partnered"] {
    if let Some(p) = map.get_mut(key).and_then(|v| v.get_mut("path")) {
      fix(p);
    }
  }
  if let Some(repos) = map.get_mut("sourceRepos").and_then(Value::as_object_mut) {
    for repo in repos.values_mut() {
      if let Some(p) = repo.get_mut("path") {
        fix(p);
      }
    }
  }
  if let Some(app) = map.get_mut("app").and_then(Value::as_object_mut) {
    for key in ["foundryDataPath", "foundryHomebrew", "deployedHomebrew", "deployTarget", "webRoot"] {
      if let Some(v) = app.get_mut(key) {
        fix(v);
      }
    }
    for key in ["siteDeployFolders", "homebrewDeployFolders"] {
      if let Some(list) = app.get_mut(key).and_then(Value::as_array_mut) {
        list.iter_mut().for_each(fix);
      }
    }
  }

  let formatted = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
  write_json_atomic(to, &format!("{formatted}\n"))
}

/// Older configs named one deploy target, or only the deployed homebrew inside it.
pub(crate) fn legacy_site_deploy_folders(
  app: Option<&Map<String, Value>>,
  dotenv: &HashMap<String, String>,
) -> Vec<String> {
  app_str(app, "deployTarget")
    .map(String::from)
    .or_else(|| dotenv.get("DEPLOY_TARGET").cloned())
    .or_else(|| {
      app_str(app, "deployedHomebrew")
        .and_then(|s| Path::new(s).parent())
        .map(|p| p.to_string_lossy().to_string())
    })
    .into_iter()
    .collect()
}

// ── Data folder migrations ──────────────────────────────────────────────────

/// Deploy scripts were kept in `deploy-scripts/`. Moves them to `scripts/`;
/// files already there win. Returns what couldn't be moved.
pub(crate) fn migrate_data_folder(dir: &Path) -> Vec<String> {
  let mut problems = Vec::new();
  let old = dir.join(OLD_SCRIPTS_DIR);
  let Ok(entries) = fs::read_dir(&old) else {
    return problems;
  };
  for entry in entries.flatten() {
    let to = dir.join(SCRIPTS_DIR).join(entry.file_name());
    if to.exists() {
      problems.push(format!("{} is also in {}; kept the one in {SCRIPTS_DIR}/", entry.path().display(), to.display()));
      continue;
    }
    if let Err(err) = fs::rename(entry.path(), &to) {
      problems.push(format!("Couldn't move {} to {}: {err}", entry.path().display(), to.display()));
    }
  }
  // Only goes when empty, so anything left behind above stays put.
  let _ = fs::remove_dir(&old);
  problems
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;

  fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
  }

  #[test]
  fn locate_config_prefers_the_override() {
    let dir = temp_dir("override");
    let app_file = dir.join("app/hbm-config.json");
    let found = locate_config(Some(dir.join("mine.json")), &app_file, &[]);
    assert_eq!(found, dir.join("mine.json"));
  }


  #[test]
  fn locate_config_keeps_an_existing_app_file_over_the_old_one() {
    let dir = temp_dir("existing");
    let app_file = dir.join("app/hbm-config.json");
    fs::create_dir_all(app_file.parent().unwrap()).unwrap();
    fs::write(&app_file, "{\"app\":{\"toolsUrl\":\"new\"}}").unwrap();
    let old = dir.join("repo/hbm-config.json");
    fs::create_dir_all(old.parent().unwrap()).unwrap();
    fs::write(&old, "{\"app\":{\"toolsUrl\":\"old\"}}").unwrap();

    assert_eq!(locate_config(None, &app_file, &[old]), app_file);
    assert!(fs::read_to_string(&app_file).unwrap().contains("new"));
  }

  #[test]
  fn locate_config_copies_the_old_file_and_absolutizes_relative_paths() {
    let dir = temp_dir("migrate");
    let app_file = dir.join("app/hbm-config.json");
    let repo = dir.join("repo");
    fs::create_dir_all(&repo).unwrap();
    let old = repo.join("hbm-config.json");
    fs::write(
      &old,
      r#"{
        "guides": { "path": "./guides" },
        "data": { "path": "C:/repos/5e/data" },
        "schema": { "url": "https://example.com/schema" },
        "app": { "homebrewDeployFolders": ["./out", "W:/5e/homebrew"] },
        "repos": { "5e": { "locked": true } }
      }"#,
    )
    .unwrap();

    assert_eq!(locate_config(None, &app_file, &[repo.join("nope.json"), old.clone()]), app_file);
    let moved: Value = serde_json::from_str(&fs::read_to_string(&app_file).unwrap()).unwrap();
    let base = slash_path(&repo);
    assert_eq!(moved["guides"]["path"], format!("{base}/guides"));
    assert_eq!(moved["data"]["path"], "C:/repos/5e/data");
    assert_eq!(moved["schema"]["url"], "https://example.com/schema");
    assert_eq!(moved["app"]["homebrewDeployFolders"][0], format!("{base}/out"));
    assert_eq!(moved["app"]["homebrewDeployFolders"][1], "W:/5e/homebrew");
    assert_eq!(moved["repos"]["5e"]["locked"], true);
    // The old file is left in place.
    assert!(old.exists());
  }

  #[test]
  fn deploy_scripts_move_to_scripts_without_replacing_one_there() {
    let dir = temp_dir("data-scripts");
    write(&dir.join("deploy-scripts/purge.mjs"), "old purge");
    write(&dir.join("deploy-scripts/both.ps1"), "old both");
    write(&dir.join("scripts/both.ps1"), "new both");
    let problems = migrate_data_folder(&dir);
    assert_eq!(fs::read_to_string(dir.join("scripts/purge.mjs")).unwrap(), "old purge");
    assert_eq!(fs::read_to_string(dir.join("scripts/both.ps1")).unwrap(), "new both");
    // The clash stays where it was, so nothing is lost.
    assert!(dir.join("deploy-scripts/both.ps1").exists());
    assert_eq!(problems.len(), 1);
  }
}
