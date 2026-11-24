//! User deploy scripts (Deploy Site): script text lives under `<data folder>/scripts/`,
//! and the ordered manifest lives in `hbm-config.json` under `deploy.scripts`.

use crate::config::{ensure_object, read_raw_config, slash_path, update_raw_config};
use crate::modules::deploy_section;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

const SCRIPT_KINDS: &[(&str, &str)] = &[("powershell", "ps1"), ("shell", "sh"), ("node", "mjs")];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeployScriptEntry {
  pub id: String,
  pub title: String,
  pub kind: String,
  #[serde(default = "default_true")]
  pub enabled: bool,
}

fn default_true() -> bool {
  true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployScriptView {
  pub id: String,
  pub title: String,
  pub kind: String,
  pub enabled: bool,
  pub content: String,
  pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployScriptInput {
  pub id: Option<String>,
  pub title: String,
  pub kind: String,
  pub content: String,
  pub enabled: bool,
}

pub(crate) fn scripts_dir() -> PathBuf {
  crate::data_folder::data_dir().join(crate::data_folder::SCRIPTS_DIR)
}

fn script_extension(kind: &str) -> Option<&'static str> {
  SCRIPT_KINDS.iter().find(|(k, _)| *k == kind).map(|(_, ext)| *ext)
}

pub(crate) fn script_path(dir: &Path, entry: &DeployScriptEntry) -> PathBuf {
  dir.join(format!("{}.{}", entry.id, script_extension(&entry.kind).unwrap_or("txt")))
}

pub(crate) fn load_scripts(config: &Map<String, Value>) -> Vec<DeployScriptEntry> {
  deploy_section(config)
    .and_then(|d| d.get("scripts"))
    .and_then(|v| serde_json::from_value(v.clone()).ok())
    .unwrap_or_default()
}

fn store_scripts(config: &mut Map<String, Value>, scripts: &[DeployScriptEntry]) {
  ensure_object(config, "deploy").insert("scripts".into(), serde_json::to_value(scripts).unwrap_or_default());
}

/// A file-safe id from the title, unique among `taken`.
fn script_id(title: &str, taken: &[DeployScriptEntry]) -> String {
  let mut base: String = title
    .to_lowercase()
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
    .collect();
  base = base.split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-");
  if base.is_empty() {
    base = "deploy-script".into();
  }
  let mut id = base.clone();
  let mut n = 2;
  while taken.iter().any(|s| s.id == id) {
    id = format!("{base}-{n}");
    n += 1;
  }
  id
}

fn script_view(dir: &Path, entry: &DeployScriptEntry) -> DeployScriptView {
  let path = script_path(dir, entry);
  DeployScriptView {
    id: entry.id.clone(),
    title: entry.title.clone(),
    kind: entry.kind.clone(),
    enabled: entry.enabled,
    content: fs::read_to_string(&path).unwrap_or_default(),
    path: slash_path(&path),
  }
}

pub fn list_deploy_scripts() -> Vec<DeployScriptView> {
  let dir = scripts_dir();
  load_scripts(&read_raw_config()).iter().map(|s| script_view(&dir, s)).collect()
}

fn save_script_in(
  dir: &Path,
  config: &mut Map<String, Value>,
  input: DeployScriptInput,
) -> Result<DeployScriptView, String> {
  let title = input.title.trim();
  if title.is_empty() {
    return Err("Give the script a title.".into());
  }
  if script_extension(&input.kind).is_none() {
    return Err(format!("Unknown script kind: {}", input.kind));
  }
  let mut scripts = load_scripts(config);
  let existing = input.id.as_deref().and_then(|id| scripts.iter().position(|s| s.id == id));
  let entry = DeployScriptEntry {
    id: match existing {
      Some(i) => scripts[i].id.clone(),
      None => script_id(title, &scripts),
    },
    title: title.to_string(),
    kind: input.kind.clone(),
    enabled: input.enabled,
  };

  fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  fs::write(script_path(dir, &entry), &input.content).map_err(|e| e.to_string())?;
  match existing {
    Some(i) => {
      // A changed kind changes the extension; don't leave the old file behind.
      let old = script_path(dir, &scripts[i]);
      if old != script_path(dir, &entry) {
        let _ = fs::remove_file(old);
      }
      scripts[i] = entry.clone();
    }
    None => scripts.push(entry.clone()),
  }
  store_scripts(config, &scripts);
  Ok(script_view(dir, &entry))
}

pub fn save_deploy_script(script: DeployScriptInput) -> Result<DeployScriptView, String> {
  let dir = scripts_dir();
  update_raw_config(|config| save_script_in(&dir, config, script))
}

pub fn delete_deploy_script(script_id: String) -> Result<(), String> {
  let removed = update_raw_config(|config| {
    let mut scripts = load_scripts(config);
    let Some(i) = scripts.iter().position(|s| s.id == script_id) else {
      return Ok(None);
    };
    let removed = scripts.remove(i);
    store_scripts(config, &scripts);
    Ok(Some(removed))
  })?;
  if let Some(removed) = removed {
    let _ = fs::remove_file(script_path(&scripts_dir(), &removed));
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;

  #[test]
  fn saving_a_script_writes_its_file_and_lists_it() {
    let dir = temp_dir("scripts");
    let mut config = Map::new();
    let first = save_script_in(
      &dir,
      &mut config,
      DeployScriptInput {
        id: None,
        title: "Purge Cloudflare!".into(),
        kind: "powershell".into(),
        content: "Write-Output hi".into(),
        enabled: true,
      },
    )
    .unwrap();
    assert_eq!(first.id, "purge-cloudflare");
    assert_eq!(fs::read_to_string(dir.join("purge-cloudflare.ps1")).unwrap(), "Write-Output hi");

    // Same title again gets its own id; changing the kind moves the file.
    let second = save_script_in(
      &dir,
      &mut config,
      DeployScriptInput { id: None, title: "Purge Cloudflare".into(), kind: "shell".into(), content: "".into(), enabled: false },
    )
    .unwrap();
    assert_eq!(second.id, "purge-cloudflare-2");
    save_script_in(
      &dir,
      &mut config,
      DeployScriptInput { id: Some(first.id.clone()), title: "Purge".into(), kind: "node".into(), content: "x".into(), enabled: true },
    )
    .unwrap();
    assert!(!dir.join("purge-cloudflare.ps1").exists());
    assert!(dir.join("purge-cloudflare.mjs").exists());

    let listed = load_scripts(&config);
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].title, "Purge");
    assert!(!listed[1].enabled);
  }

  #[test]
  fn a_script_needs_a_title_and_a_known_kind() {
    let dir = temp_dir("bad-scripts");
    let mut config = Map::new();
    let input = |title: &str, kind: &str| DeployScriptInput {
      id: None,
      title: title.into(),
      kind: kind.into(),
      content: String::new(),
      enabled: true,
    };
    assert!(save_script_in(&dir, &mut config, input("  ", "powershell")).is_err());
    assert!(save_script_in(&dir, &mut config, input("Go", "python")).is_err());
    assert!(load_scripts(&config).is_empty());
  }
}
