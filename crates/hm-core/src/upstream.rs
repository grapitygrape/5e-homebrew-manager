//! Read-only upstream readiness check surfaced in the Source Data UI.
//!
//! Reads upstream git refs directly without modifying any working tree:
//!   1. Optionally fetches `5e` and `5etools-utils` in parallel.
//!   2. Compares `HEAD` vs upstream ref (`@{upstream}` / `origin/HEAD`) and
//!      resolves the `5etools-utils` tag requested by upstream `5e/package.json`.
//!   3. Checks every deploy module's patches, copy targets, and git diffs
//!      against the upstream `5e` ref.
//!   4. Checks whether any 5etools JS identifiers used by our scripts vanished.

use crate::config::{read_raw_config, resolve_paths, ResolvedPaths};
use crate::modules::{diff_files, load_modules, modules_dir, option_allows, resolve_source, ModuleEntry};
use crate::patch_ops::apply_patch_specs;
use crate::repos::{git_capture, git_cmd, git_run};
use crate::script_names::{missing_names, our_scripts, site_words};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamRepoDelta {
  pub id: String,
  pub label: String,
  pub current_version: Option<String>,
  pub target_version: Option<String>,
  pub target_ref: String,
  pub target_describe: Option<String>,
  pub behind_commits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamIssue {
  /// "patch" | "copy" | "diff" | "script"
  pub category: String,
  pub module: String,
  pub enabled: bool,
  pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamCheckReport {
  pub checked_at: i64,
  pub fetched: bool,
  pub up_to_date: bool,
  pub ready: bool,
  pub site: UpstreamRepoDelta,
  pub utils: Option<UpstreamRepoDelta>,
  pub wanted_utils: Option<String>,
  pub patches_checked: usize,
  pub diffs_checked: usize,
  pub issues: Vec<UpstreamIssue>,
  pub warnings: Vec<String>,
}

/// Exact file bytes at `<rev>:<path>` (preserves leading/trailing whitespace).
fn git_show_raw(repo: &Path, rev: &str, file: &str) -> Option<String> {
  let spec = format!("{rev}:{file}");
  let out = git_cmd(repo, &["show", &spec]).output().ok()?;
  if !out.status.success() {
    return None;
  }
  Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn has_commit(repo: &Path, rev: &str) -> bool {
  let spec = format!("{rev}^{{commit}}");
  git_capture(repo, &["rev-parse", "--verify", "--quiet", &spec]).is_some()
}

fn behind_count(repo: &Path, target_ref: &str) -> u32 {
  let range = format!("HEAD..{target_ref}");
  git_capture(repo, &["rev-list", "--count", &range])
    .and_then(|s| s.parse().ok())
    .unwrap_or(0)
}

fn package_json_at(repo: &Path, rev: &str) -> Option<Value> {
  let raw = git_show_raw(repo, rev, "package.json")?;
  serde_json::from_str(&raw).ok()
}

fn version_at(repo: &Path, rev: &str) -> Option<String> {
  package_json_at(repo, rev)?
    .get("version")
    .and_then(Value::as_str)
    .map(String::from)
}

fn wanted_utils_at(site_repo: &Path, rev: &str) -> Option<String> {
  let raw = package_json_at(site_repo, rev)?
    .get("devDependencies")?
    .get("5etools-utils")?
    .as_str()?
    .trim_start_matches(['^', '~'])
    .to_string();
  if raw.is_empty() { None } else { Some(raw) }
}

fn pick_utils_ref(utils_repo: &Path, wanted: Option<&str>) -> String {
  if let Some(ver) = wanted {
    for candidate in [format!("v{ver}"), ver.to_string()] {
      if has_commit(utils_repo, &candidate) {
        return candidate;
      }
    }
  }
  if has_commit(utils_repo, "origin/HEAD") {
    return "origin/HEAD".to_string();
  }
  git_capture(utils_repo, &["rev-parse", "--abbrev-ref", "@{upstream}"])
    .filter(|r| has_commit(utils_repo, r))
    .unwrap_or_else(|| "HEAD".to_string())
}

fn git_apply_check_at_ref(site_repo: &Path, target_ref: &str, patch: &str) -> Result<(), Vec<String>> {
  static COUNTER: AtomicU64 = AtomicU64::new(0);
  let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
  let tmp = std::env::temp_dir().join(format!("hbm-upstream-check-{}-{seq}", std::process::id()));
  fs::create_dir_all(&tmp).map_err(|e| vec![format!("Could not create temp dir: {e}")])?;

  let result = (|| {
    let files: BTreeSet<String> = diff_files(patch).into_iter().collect();
    for file in files {
      if let Some(text) = git_show_raw(site_repo, target_ref, &file) {
        let dest = tmp.join(&file);
        if let Some(parent) = dest.parent() {
          let _ = fs::create_dir_all(parent);
        }
        fs::write(&dest, text).map_err(|e| vec![format!("Failed to stage {file}: {e}")])?;
      }
    }
    let patch_file = tmp.join(".reskin.patch");
    fs::write(&patch_file, patch).map_err(|e| vec![format!("Failed to write patch: {e}")])?;

    let out = git_cmd(&tmp, &["apply", "--check", "--whitespace=nowarn", ".reskin.patch"])
      .output()
      .map_err(|e| vec![format!("Failed to run git apply: {e}")])?;
    if out.status.success() {
      Ok(())
    } else {
      let errs: Vec<String> = String::from_utf8_lossy(&out.stderr)
        .lines()
        .map(str::trim)
        .filter(|l| l.starts_with("error:"))
        .map(String::from)
        .collect();
      Err(if errs.is_empty() {
        vec![String::from_utf8_lossy(&out.stderr).trim().to_string()]
      } else {
        errs
      })
    }
  })();

  let _ = fs::remove_dir_all(&tmp);
  result
}

pub(crate) fn check_upstream_updates_in(
  paths: &ResolvedPaths,
  modules_root: &Path,
  config: &Map<String, Value>,
  fetch: bool,
) -> Result<UpstreamCheckReport, String> {
  if !paths.repo_5e.join(".git").exists() {
    return Err(format!("5etools git repo not found at {}", paths.repo_5e.display()));
  }

  let has_utils = paths.repo_utils.join(".git").exists();
  let mut warnings = Vec::new();

  if fetch {
    let (site_res, utils_res) = std::thread::scope(|s| {
      let h_site = s.spawn(|| git_run(&paths.repo_5e, &["fetch", "--tags", "--quiet", "origin"]));
      let h_utils = s.spawn(|| {
        if has_utils {
          Some(git_run(&paths.repo_utils, &["fetch", "--tags", "--quiet", "origin"]))
        } else {
          None
        }
      });
      (h_site.join().unwrap(), h_utils.join().unwrap())
    });
    if let Err(e) = site_res {
      warnings.push(format!("5e fetch failed: {e}"));
    }
    if let Some(Err(e)) = utils_res {
      warnings.push(format!("5etools-utils fetch failed: {e}"));
    }
  }

  let site_ref = git_capture(&paths.repo_5e, &["rev-parse", "--abbrev-ref", "@{upstream}"])
    .filter(|r| !r.is_empty() && has_commit(&paths.repo_5e, r))
    .or_else(|| has_commit(&paths.repo_5e, "origin/HEAD").then(|| "origin/HEAD".to_string()))
    .unwrap_or_else(|| "HEAD".to_string());

  let site_behind = behind_count(&paths.repo_5e, &site_ref);
  let site_describe = git_capture(&paths.repo_5e, &["describe", "--tags", &site_ref]);
  let site_delta = UpstreamRepoDelta {
    id: "5e".to_string(),
    label: "5etools".to_string(),
    current_version: version_at(&paths.repo_5e, "HEAD"),
    target_version: version_at(&paths.repo_5e, &site_ref),
    target_ref: site_ref.clone(),
    target_describe: site_describe,
    behind_commits: site_behind,
  };

  let wanted_utils = wanted_utils_at(&paths.repo_5e, &site_ref);
  let utils_delta = if has_utils {
    let utils_ref = pick_utils_ref(&paths.repo_utils, wanted_utils.as_deref());
    let behind = behind_count(&paths.repo_utils, &utils_ref);
    let desc = git_capture(&paths.repo_utils, &["describe", "--tags", &utils_ref]);
    Some(UpstreamRepoDelta {
      id: "5etools-utils".to_string(),
      label: "5etools-utils".to_string(),
      current_version: version_at(&paths.repo_utils, "HEAD"),
      target_version: version_at(&paths.repo_utils, &utils_ref),
      target_ref: utils_ref,
      target_describe: desc,
      behind_commits: behind,
    })
  } else {
    None
  };

  let up_to_date = site_delta.behind_commits == 0
    && utils_delta.as_ref().is_none_or(|u| u.behind_commits == 0);

  let mut issues = Vec::new();
  let mut patches_checked = 0usize;
  let mut diffs_checked = 0usize;

  let data_dir = &paths.data_dir;
  let modules = load_modules(modules_root, config)?;
  let mut show_cache: HashMap<(String, String), Option<String>> = HashMap::new();
  let mut read_site = |rev: &str, file: &str| -> Option<String> {
    let key = (rev.to_string(), file.to_string());
    if let Some(cached) = show_cache.get(&key) {
      return cached.clone();
    }
    let val = git_show_raw(&paths.repo_5e, rev, file);
    show_cache.insert(key, val.clone());
    val
  };

  for module in &modules {
    for entry in &module.def.entries {
      if entry.is_disabled() || !option_allows(entry.option(), &module.values) {
        continue;
      }
      match entry {
        ModuleEntry::Copy { target, .. } => {
          if let Some(before) = read_site("HEAD", target) {
            if read_site(&site_ref, target).as_deref() != Some(before.as_str()) {
              issues.push(UpstreamIssue {
                category: "copy".to_string(),
                module: module.id.clone(),
                enabled: module.enabled,
                message: format!("Copy replaces {target}, which changed upstream."),
              });
            }
          }
        }
        ModuleEntry::Patch { target, patches, .. } => {
          patches_checked += patches.len();
          let Some(next) = read_site(&site_ref, target) else {
            issues.push(UpstreamIssue {
              category: "patch".to_string(),
              module: module.id.clone(),
              enabled: module.enabled,
              message: format!("{target} no longer exists upstream."),
            });
            continue;
          };
          let read_insert = |name: &str| {
            fs::read_to_string(module.dir.join(name))
              .map_err(|e| format!("Could not read {name}: {e}"))
          };
          let outcome = apply_patch_specs(next, target, patches, &module.values, false, &read_insert)?;
          if let Some(fatal) = outcome.fatal {
            issues.push(UpstreamIssue {
              category: "patch".to_string(),
              module: module.id.clone(),
              enabled: module.enabled,
              message: fatal,
            });
          } else if !outcome.skipped.is_empty() {
            // Only flag skips that did NOT also skip at HEAD (so intentionally optional/already-skipped ones stay quiet).
            let head_skips: BTreeSet<String> = read_site("HEAD", target)
              .and_then(|head| apply_patch_specs(head, target, patches, &module.values, false, &read_insert).ok())
              .map(|h| h.skipped.into_iter().collect())
              .unwrap_or_default();
            for skip in outcome.skipped {
              if !head_skips.contains(&skip) {
                issues.push(UpstreamIssue {
                  category: "patch".to_string(),
                  module: module.id.clone(),
                  enabled: module.enabled,
                  message: format!("{target} — {skip} no longer matches upstream."),
                });
              }
            }
          }
        }
        ModuleEntry::Diff { source, description, .. } => {
          diffs_checked += 1;
          let label = if description.is_empty() { source.as_str() } else { description.as_str() };
          let Some(patch_path) = resolve_source(source, &module.dir, data_dir, &module.values) else {
            if module.enabled {
              issues.push(UpstreamIssue {
                category: "diff".to_string(),
                module: module.id.clone(),
                enabled: true,
                message: format!("{label}: diff path option is unset."),
              });
            }
            continue;
          };
          let Ok(patch_text) = fs::read_to_string(&patch_path) else {
            if module.enabled {
              issues.push(UpstreamIssue {
                category: "diff".to_string(),
                module: module.id.clone(),
                enabled: true,
                message: format!("{label}: no patch file at {}.", patch_path.display()),
              });
            }
            continue;
          };
          if let Err(errs) = git_apply_check_at_ref(&paths.repo_5e, &site_ref, &patch_text) {
            let preview = errs.into_iter().take(3).collect::<Vec<_>>().join(" | ");
            issues.push(UpstreamIssue {
              category: "diff".to_string(),
              module: module.id.clone(),
              enabled: module.enabled,
              message: format!("{label} doesn't apply upstream: {preview}"),
            });
          }
        }
        ModuleEntry::Prices { .. } | ModuleEntry::Npm { .. } => {}
      }
    }
  }

  // Check JS identifier drift only when upstream actually moved ahead.
  if site_delta.behind_commits > 0 {
    let (head_res, next_res) = std::thread::scope(|s| {
      let h1 = s.spawn(|| site_words(&paths.repo_5e, "HEAD"));
      let h2 = s.spawn(|| site_words(&paths.repo_5e, &site_ref));
      (h1.join().unwrap(), h2.join().unwrap())
    });
    match (head_res, next_res) {
      (Ok(before), Ok(after)) => {
        for miss in missing_names(&our_scripts(modules_root), &before, &after) {
          issues.push(UpstreamIssue {
            category: "script".to_string(),
            module: miss.module,
            enabled: true,
            message: format!("No longer in upstream js/: {}", miss.names.join(", ")),
          });
        }
      }
      (Err(e), _) | (_, Err(e)) => warnings.push(format!("Script symbol check skipped: {e}")),
    }
  }

  let blocking = issues.iter().any(|i| i.enabled);
  let checked_at = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);

  Ok(UpstreamCheckReport {
    checked_at,
    fetched: fetch,
    up_to_date,
    ready: !blocking,
    site: site_delta,
    utils: utils_delta,
    wanted_utils,
    patches_checked,
    diffs_checked,
    issues,
    warnings,
  })
}

pub async fn check_upstream_updates(fetch: Option<bool>) -> Result<UpstreamCheckReport, String> {
  let modules_root = modules_dir();
  let do_fetch = fetch.unwrap_or(true);
  tokio::task::spawn_blocking(move || {
    let paths = resolve_paths();
    let config = read_raw_config();
    check_upstream_updates_in(&paths, &modules_root, &config, do_fetch)
  })
  .await
  .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;
  use serde_json::json;
  use std::net::{IpAddr, Ipv4Addr};

  fn write_file(path: &Path, content: &str) {
    if let Some(p) = path.parent() {
      fs::create_dir_all(p).unwrap();
    }
    fs::write(path, content).unwrap();
  }

  fn commit_all(dir: &Path, msg: &str) {
    git_run(dir, &["add", "-A"]).unwrap();
    git_run(dir, &["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", msg]).unwrap();
  }

  fn paths_for(root: &Path, repo_5e: &Path) -> ResolvedPaths {
    ResolvedPaths {
      config_path: root.join("hbm-config.json"),
      web_root: root.to_path_buf(),
      repo_5e: repo_5e.to_path_buf(),
      repo_utils: root.join("missing-utils"),
      repo_homebrew: root.join("missing-hb"),
      repo_img: root.join("missing-img"),
      repo_images: root.join("missing-hb-img"),
      data_dir: root.to_path_buf(),
      site_deploy_folders: Vec::new(),
      bind_host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      local_server_port: 0,
      bridge_port: 0,
      site_port: 0,
      site_base_path: "/".to_string(),
      site_url: String::new(),
      repos: HashMap::new(),
    }
  }

  #[test]
  fn detects_upstream_commits_and_broken_module_anchor() {
    let tmp = temp_dir("upstream-check");
    let remote = tmp.join("remote-5e");
    fs::create_dir_all(&remote).unwrap();
    git_run(&remote, &["init", "--quiet"]).unwrap();
    write_file(&remote.join("package.json"), r#"{"version":"2.40.0","devDependencies":{"5etools-utils":"^0.17.38"}}"#);
    write_file(&remote.join("js/nav.js"), "NavBar.init();\nconst KEEP_ANCHOR = 1;\n");
    commit_all(&remote, "v2.40.0");

    let local = tmp.join("5e");
    git_run(&tmp, &["clone", "--quiet", remote.to_str().unwrap(), local.to_str().unwrap()]).unwrap();

    // Advance remote by one commit that renames the anchor our module patches.
    write_file(&remote.join("package.json"), r#"{"version":"2.41.0","devDependencies":{"5etools-utils":"^0.17.39"}}"#);
    write_file(&remote.join("js/nav.js"), "NavBar.init();\nconst RENAMED_ANCHOR = 2;\n");
    commit_all(&remote, "v2.41.0");

    let modules = tmp.join("deploy-modules");
    write_file(
      &modules.join("sample/module.json"),
      &json!({
        "title": "Sample",
        "defaultEnabled": true,
        "entries": [{
          "type": "patch",
          "target": "js/nav.js",
          "patches": [{ "note": "keep anchor", "find": "KEEP_ANCHOR", "replace": "NEW_ANCHOR" }]
        }]
      })
      .to_string(),
    );

    let report = check_upstream_updates_in(&paths_for(&tmp, &local), &modules, &Map::new(), true).unwrap();
    assert!(!report.up_to_date);
    assert!(!report.ready);
    assert_eq!(report.site.current_version.as_deref(), Some("2.40.0"));
    assert_eq!(report.site.target_version.as_deref(), Some("2.41.0"));
    assert_eq!(report.site.behind_commits, 1);
    assert_eq!(report.wanted_utils.as_deref(), Some("0.17.39"));
    assert_eq!(report.issues.len(), 1);
    assert_eq!(report.issues[0].category, "patch");
    assert_eq!(report.issues[0].module, "sample");
  }
}
