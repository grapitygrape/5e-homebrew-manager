//! Persisted Prepare / Publish run history (`deploy.lastPrepare`, `deploy.lastRun`)
//! and deploy image repo discovery.

use crate::config::{read_raw_config, resolve_paths, slash_path};
use crate::modules::{deploy_object, deploy_section, ModuleCheck};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

// ── Image repos ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployImageRepo {
  pub id: String,
  pub title: String,
  /// The folder under the site root that serves these images.
  pub folder: String,
  pub path: String,
  pub downloaded: bool,
}

/// True when the folder has anything in it. Not a `.git` check: a repo extracted
/// from a ZIP has none and is just as downloaded.
fn has_content(path: &Path) -> bool {
  fs::read_dir(path).is_ok_and(|mut entries| entries.next().is_some())
}

pub(crate) fn deploy_image_repos(site_images: &Path, homebrew_images: &Path) -> Vec<DeployImageRepo> {
  [
    ("site", "Site images", "img", site_images),
    ("homebrew", "Homebrew images", "homebrew-img", homebrew_images),
  ]
  .into_iter()
  .map(|(id, title, folder, path)| DeployImageRepo {
    id: id.into(),
    title: title.into(),
    folder: folder.into(),
    path: slash_path(path),
    downloaded: has_content(path),
  })
  .collect()
}

pub fn list_deploy_images() -> Vec<DeployImageRepo> {
  let paths = resolve_paths();
  deploy_image_repos(&paths.repo_img, &paths.repo_images)
}

// ── Last successful run ─────────────────────────────────────────────────────

/// The last Publish: what's live. Its commits are what Review compares the
/// candidate against, what a rollback returns to, and where the purge list's
/// diff starts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastDeployRun {
  /// Unix seconds.
  pub at: u64,
  pub site_version: Option<String>,
  /// Repo id → full commit. Empty for runs recorded before this was kept.
  #[serde(default)]
  pub commits: BTreeMap<String, String>,
  /// How each customization fared in the Prepare that was published.
  #[serde(default)]
  pub modules: Vec<ModuleCheck>,
}

fn load_last_run(config: &Map<String, Value>) -> Option<LastDeployRun> {
  let saved = deploy_section(config)?.get("lastRun")?;
  serde_json::from_value(saved.clone()).ok()
}

pub(crate) fn store_last_run(config: &mut Map<String, Value>, run: &LastDeployRun) {
  store_record(config, "lastRun", run);
}

pub fn get_last_deploy_run() -> Option<LastDeployRun> {
  load_last_run(&read_raw_config())
}

/// The last Prepare: the candidate site sitting in the 5e checkout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastPrepare {
  /// Unix seconds.
  pub at: u64,
  pub ok: bool,
  pub site_version: Option<String>,
  #[serde(default)]
  pub commits: BTreeMap<String, String>,
  #[serde(default)]
  pub warnings: Vec<String>,
  /// Sources this run added to the blocklist.
  #[serde(default)]
  pub blocked_sources: Vec<String>,
  #[serde(default)]
  pub modules: Vec<ModuleCheck>,
}

pub(crate) fn load_last_prepare(config: &Map<String, Value>) -> Option<LastPrepare> {
  let saved = deploy_section(config)?.get("lastPrepare")?;
  serde_json::from_value(saved.clone()).ok()
}

pub(crate) fn store_last_prepare(config: &mut Map<String, Value>, run: &LastPrepare) {
  store_record(config, "lastPrepare", run);
}

pub fn get_last_prepare() -> Option<LastPrepare> {
  load_last_prepare(&read_raw_config())
}

/// Replace `deploy.<key>` with a record, keeping the rest of `deploy`.
fn store_record<T: Serialize>(config: &mut Map<String, Value>, key: &str, record: &T) {
  let section = deploy_object(config, key);
  section.clear();
  if let Ok(Value::Object(map)) = serde_json::to_value(record) {
    section.extend(map);
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;
  use serde_json::json;

  #[test]
  fn an_image_repo_only_counts_as_downloaded_with_content() {
    let full = temp_dir("images-full");
    fs::write(full.join("a.png"), "x").unwrap();
    let empty = temp_dir("images-empty");

    let repos = deploy_image_repos(&full, &empty);
    assert_eq!((repos[0].folder.as_str(), repos[0].downloaded), ("img", true));
    assert_eq!((repos[1].folder.as_str(), repos[1].downloaded), ("homebrew-img", false));
    assert!(!deploy_image_repos(Path::new(""), &empty)[0].downloaded);
  }

  #[test]
  fn the_last_run_round_trips_through_the_config() {
    let mut config = Map::new();
    assert_eq!(load_last_run(&config), None);
    let run = LastDeployRun {
      at: 1_793_500_000,
      site_version: Some("2.39.0".into()),
      commits: BTreeMap::from([("5e".into(), "abc123".into())]),
      modules: vec![ModuleCheck { id: "shops".into(), status: "skipped".into(), details: vec!["x".into()] }],
    };
    store_last_run(&mut config, &run);
    assert_eq!(load_last_run(&config), Some(run));
  }

  #[test]
  fn a_last_run_saved_before_commits_were_kept_still_loads() {
    let config: Map<String, Value> =
      serde_json::from_value(json!({ "deploy": { "lastRun": { "at": 5, "siteVersion": null } } })).unwrap();
    let run = load_last_run(&config).unwrap();
    assert!(run.commits.is_empty() && run.modules.is_empty());
  }

  #[test]
  fn storing_a_prepare_replaces_the_last_one_and_keeps_the_rest_of_deploy() {
    let mut config: Map<String, Value> = serde_json::from_value(json!({
      "deploy": { "modules": { "shops": { "enabled": true } }, "lastPrepare": { "stale": 1 } }
    }))
    .unwrap();
    let prep = LastPrepare {
      at: 9,
      ok: true,
      site_version: None,
      commits: BTreeMap::new(),
      warnings: vec!["w".into()],
      blocked_sources: vec!["NEW".into()],
      modules: Vec::new(),
    };
    store_last_prepare(&mut config, &prep);
    assert_eq!(load_last_prepare(&config), Some(prep));
    assert!(config["deploy"]["lastPrepare"].get("stale").is_none());
    assert_eq!(config["deploy"]["modules"]["shops"]["enabled"], json!(true));
  }
}
