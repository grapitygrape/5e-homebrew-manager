//! Pipeline orchestration: prepares a candidate 5e site (repo sync, homebrew
//! refresh, source blocking, index rebuild, module patching, service worker
//! build) and coordinates publishing via `publish.rs`.

use crate::config::{
  config_file_path, read_raw_config, resolve_paths, slash_path, RepoLockEntry, ResolvedPaths,
  IGNORED_HOMEBREW,
};
use crate::deploy_scripts::{load_scripts, scripts_dir};
use crate::modules::{load_modules, modules_dir, DeployModule, ModuleCheck};
use crate::new_sources::{self, block_new_sources, KNOWN_SOURCES_FILE};
use crate::patch_runner;
use crate::process;
use crate::publish;
use crate::repos::{
  anchor_homebrew_inner, commit_timestamp_and_date, ensure_full_history, ensure_on_branch,
  git_capture, git_cmd, git_run, sync_utils_to_5e_inner,
};
use crate::run_history::deploy_image_repos;
use crate::runtime::{current_event_sink, emit_with, EventSink};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const NEVER_IMPORT: &[&str] = &["index.json"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineEvent {
  pub step: String,
  /// Which line of the Deploy page's step list this belongs to. Empty outside a full update.
  pub phase: String,
  pub level: String, // "info" | "warn" | "error" | "step" | "done"
  pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineSummary {
  pub action: String,
  pub dry_run: bool,
  pub ok: bool,
  pub patches_applied: usize,
  pub patches_skipped: Vec<String>,
  pub warnings: Vec<String>,
  pub logs: Vec<PipelineEvent>,
  /// Where the candidate can be previewed, after a real Prepare.
  pub preview_url: Option<String>,
}

pub(crate) struct Logger {
  sink: Option<EventSink>,
  current_step: String,
  phase: String,
  pub(crate) logs: Vec<PipelineEvent>,
  pub(crate) warnings: Vec<String>,
}

impl Logger {
  pub(crate) fn new(sink: Option<EventSink>) -> Self {
    Self {
      sink,
      current_step: "Init".to_string(),
      phase: String::new(),
      logs: Vec::new(),
      warnings: Vec::new(),
    }
  }

  fn emit(&mut self, level: &str, msg: impl Into<String>) {
    let ev = PipelineEvent {
      step: self.current_step.clone(),
      phase: self.phase.clone(),
      level: level.to_string(),
      message: msg.into(),
    };
    if self.sink.is_some() {
      emit_with(self.sink.as_ref(), "pipeline-event", &ev);
    }
    self.logs.push(ev);
  }

  pub(crate) fn phase(&mut self, id: &str) {
    self.phase = id.to_string();
  }

  pub(crate) fn step(&mut self, name: &str) {
    self.current_step = name.to_string();
    self.emit("step", format!("=== {name} ==="));
  }

  pub(crate) fn info(&mut self, msg: impl Into<String>) {
    self.emit("info", msg);
  }

  pub(crate) fn warn(&mut self, msg: impl Into<String>) {
    let s = msg.into();
    self.warnings.push(s.clone());
    self.emit("warn", s);
  }

  pub(crate) fn error(&mut self, msg: impl Into<String>) {
    self.emit("error", msg);
  }
}

pub(crate) fn mtime_secs(path: &Path) -> u64 {
  fs::metadata(path)
    .and_then(|m| m.modified())
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| d.as_secs())
    .unwrap_or(0)
}

fn build_source_file_map(source_folder: &Path) -> HashMap<String, PathBuf> {
  let mut map = HashMap::new();
  fn walk(dir: &Path, map: &mut HashMap<String, PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
      return;
    };
    for entry in entries.flatten() {
      let path = entry.path();
      let name = entry.file_name().to_string_lossy().to_string();
      if name.starts_with('.') || name.starts_with('_') || name == "node_modules" {
        continue;
      }
      if path.is_dir() {
        walk(&path, map);
      } else if !map.contains_key(&name) {
        map.insert(name, path);
      }
    }
  }
  walk(source_folder, &mut map);
  map
}

fn rebuild_sw_inner(root_dir: &Path, dry_run: bool, logger: &mut Logger) -> Result<(), String> {
  let sitemap_path = root_dir.join("sitemap.xml");
  if sitemap_path.exists() {
    if dry_run {
      logger.info("[dry-run] Would delete stale sitemap.xml");
    } else {
      let _ = fs::remove_file(&sitemap_path);
      logger.info("Deleted stale sitemap.xml");
    }
  }

  if dry_run {
    logger.info("[dry-run] Would run `node node/build-sw.mjs --prod` in 5e/");
    return Ok(());
  }

  patch_runner::ensure_node_modules(root_dir, logger)?;
  logger.info("Building service worker (sw.js)...");
  let mut cmd = process::cmd("node");
  cmd.current_dir(root_dir).args(["node/build-sw.mjs", "--prod"]);

  let output = cmd
    .output()
    .map_err(|e| format!("Failed to run node/build-sw.mjs: {e}"))?;
  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(format!("Service worker build failed: {stderr}"));
  }
  logger.info("Rebuilt sw.js and sw-injector.js");
  Ok(())
}

/// Step 6's view of homebrew/ against index.json.
#[derive(Debug, PartialEq)]
struct IndexCheck {
  to_import: Vec<String>,
  /// In the folder, not in the index.
  unlisted: Vec<String>,
  /// In the index, not in the folder.
  missing: Vec<String>,
}

/// The index stays as listed: the Files page is where files get added or
/// removed, so Prepare only reports a mismatch. The blocklist is the one file
/// it adds, since nothing on the site is hidden without it.
fn check_index(on_disk: &[String], listed: &HashSet<String>, not_used: &HashSet<String>) -> IndexCheck {
  let mut to_import: Vec<String> = listed
    .iter()
    .filter(|f| !NEVER_IMPORT.contains(&f.as_str()) && !not_used.contains(*f))
    .cloned()
    .collect();
  let blocklist = "content-blocklist.json".to_string();
  if on_disk.contains(&blocklist) && !to_import.contains(&blocklist) {
    to_import.push(blocklist);
  }
  to_import.sort();
  let mut unlisted: Vec<String> = on_disk
    .iter()
    .filter(|f| !IGNORED_HOMEBREW.contains(&f.as_str()) && !listed.contains(*f) && !not_used.contains(*f))
    .cloned()
    .collect();
  unlisted.sort();
  let missing: Vec<String> = to_import.iter().filter(|f| !on_disk.contains(f)).cloned().collect();
  IndexCheck { to_import, unlisted, missing }
}

/// Writes a file's saved contents back when dropped, unless released first.
/// Prepare keeps homebrew/index.json this way: a run that stops after the
/// reset would otherwise leave the site's empty index, and the next run would
/// sweep every brew into unused/.
struct KeepFile {
  path: PathBuf,
  saved: Option<Vec<u8>>,
}

impl KeepFile {
  fn new(path: &Path, active: bool) -> Self {
    let saved = if active { fs::read(path).ok() } else { None };
    Self { path: path.to_path_buf(), saved }
  }

  fn release(&mut self) {
    self.saved = None;
  }
}

impl Drop for KeepFile {
  fn drop(&mut self) {
    if let Some(saved) = &self.saved {
      if fs::read(&self.path).ok().as_ref() != Some(saved) {
        let _ = fs::write(&self.path, saved);
      }
    }
  }
}

/// `git clean` keeps these. An images checkout inside the tools repo is kept
/// too, whatever it's called: one extracted from a ZIP has no .git to save it.
fn clean_excludes(repo_tools: &Path, images: &[&Path]) -> Vec<String> {
  let mut out: Vec<String> = ["homebrew/", "homebrew-img/", "generate/", "img/"]
    .iter()
    .map(|d| format!("--exclude={d}"))
    .collect();
  for folder in images {
    if let Ok(rel) = folder.strip_prefix(repo_tools) {
      let rel = slash_path(rel);
      let arg = format!("--exclude={rel}/");
      if !rel.is_empty() && !out.contains(&arg) {
        out.push(arg);
      }
    }
  }
  out
}

/// Block every source new since the last full update. A failure warns rather
/// than stops the run; the known list isn't updated, so the next run retries.
/// Returns the sources it blocked.
fn block_new_sources_step(
  paths: &ResolvedPaths,
  brew_dir: &Path,
  local_files: &[String],
  dry_run: bool,
  logger: &mut Logger,
) -> Vec<String> {
  let official = match new_sources::official_sources(&paths.repo_5e) {
    Ok(list) => list,
    Err(e) => {
      logger.warn(format!("Couldn't list the official sources, so none were blocked: {e}"));
      return Vec::new();
    }
  };
  let partnered = new_sources::partnered_sources(&paths.repo_homebrew);
  let known = config_file_path().parent().map(Path::to_path_buf).unwrap_or_default().join(KNOWN_SOURCES_FILE);
  let out = match block_new_sources(&known, brew_dir, official, partnered, local_files, dry_run) {
    Ok(out) => out,
    Err(e) => {
      logger.warn(format!("Couldn't block new sources: {e}"));
      return Vec::new();
    }
  };
  for group in &out.first_seen {
    logger.info(format!(
      "{} the {group} sources. Any added after this run will be blocked.",
      if dry_run { "[dry-run] Would record" } else { "Recorded" }
    ));
  }
  if !out.blocked.is_empty() {
    logger.info(format!(
      "{} {} new source(s) in content-blocklist.json: {}. Unblock them in Choose Content.",
      if dry_run { "[dry-run] Would block" } else { "Blocked" },
      out.blocked.len(),
      out.blocked.join(", ")
    ));
  }
  if !out.already_blocked.is_empty() {
    logger.info(format!("New but already blocked: {}", out.already_blocked.join(", ")));
  }
  if !out.kept.is_empty() {
    logger.info(format!("New but left visible, your homebrew uses them: {}", out.kept.join(", ")));
  }
  if out.first_seen.is_empty() && out.blocked.is_empty() && out.already_blocked.is_empty() && out.kept.is_empty() {
    logger.info("No new sources since the last full update.");
  }
  out.blocked
}

/// What Prepare did, filled in as it goes so a failed run still records it.
#[derive(Default)]
pub(crate) struct PrepareOutcome {
  pub(crate) applied: usize,
  pub(crate) skipped: Vec<String>,
  pub(crate) blocked: Vec<String>,
  pub(crate) modules: Vec<ModuleCheck>,
}

/// Snapshot of `homebrew/index.json` taken before the 5e git reset, so Step 5c
/// and Step 6 know what was listed before git restored the upstream empty index.
struct HomebrewSnapshot {
  brew_dir: PathBuf,
  index_path: PathBuf,
  index_val: Value,
  to_import_set: HashSet<String>,
  not_used_set: HashSet<String>,
}

/// The 5e commit Prepare is about to build: the pin when 5e is locked, else
/// its upstream (just fetched), else HEAD.
fn target_5e_rev(repo_5e: &Path, lock_5e: &RepoLockEntry) -> String {
  if lock_5e.locked {
    if let Some(pin) = &lock_5e.pinned_commit {
      return pin.clone();
    }
  }
  if git_capture(repo_5e, &["rev-parse", "--verify", "--quiet", "@{u}"]).is_some() {
    "@{u}".to_string()
  } else {
    "HEAD".to_string()
  }
}

fn preflight_check(
  paths: &ResolvedPaths,
  lock_5e: &RepoLockEntry,
  lock_utils: &RepoLockEntry,
  dry_run: bool,
  logger: &mut Logger,
) {
  logger.phase("repos");
  logger.step("Step 1: Pre-flight Check");

  let fetch_5e = !lock_5e.locked;
  let fetch_utils = lock_utils.follow_5e_package_json && !dry_run && paths.repo_utils.join(".git").exists();
  let (behind_5e, dirty_count, utils_fetch_err) = std::thread::scope(|scope| {
    let h_5e = scope.spawn(|| {
      if fetch_5e {
        let _ = git_run(&paths.repo_5e, &["fetch", "--quiet"]);
        git_capture(&paths.repo_5e, &["rev-list", "--count", "HEAD..@{u}"])
      } else {
        None
      }
    });
    let h_utils = scope.spawn(|| {
      if fetch_utils {
        git_run(&paths.repo_utils, &["fetch", "--tags", "--quiet"]).err()
      } else {
        None
      }
    });
    let dirty = git_capture(&paths.repo_5e, &["status", "--porcelain", "--untracked-files=no"])
      .map(|s| s.lines().filter(|l| !l.trim().is_empty()).count())
      .unwrap_or(0);
    (
      h_5e.join().ok().flatten(),
      dirty,
      h_utils.join().ok().flatten(),
    )
  });

  if lock_5e.locked {
    logger.info(format!(
      "🔒 5e is LOCKED at {} ({}) — upstream git pull will be skipped.",
      lock_5e.pinned_ref.as_deref().unwrap_or("current"),
      lock_5e.pinned_commit.as_deref().unwrap_or("HEAD")
    ));
  } else if let Some(behind) = behind_5e {
    logger.info(format!("5e fast-forwards cleanly ({behind} commit(s) behind upstream)"));
  }
  if dirty_count > 0 {
    logger.info(format!("{dirty_count} modified tracked file(s) in 5e will be reset."));
  }
  if let Some(e) = utils_fetch_err {
    logger.warn(format!("Couldn't fetch 5etools-utils, so only tags already here can match: {e}"));
  }
}

enum SyncLog {
  Info(String),
  Warn(String),
}

fn sync_external_repos(
  paths: &ResolvedPaths,
  lock_5e: &RepoLockEntry,
  lock_brew: &RepoLockEntry,
  lock_img: &RepoLockEntry,
  dry_run: bool,
  logger: &mut Logger,
) -> Result<(), String> {
  logger.step("Step 2: Syncing External Repos (5e-homebrew, 5e/img)");

  let (brew_res, img_logs) = std::thread::scope(|scope| {
    let h_brew = scope.spawn(|| -> Result<Vec<SyncLog>, String> {
      let mut out = Vec::new();
      if lock_brew.follow_5e_date && paths.repo_homebrew.join(".git").exists() {
        let rev = target_5e_rev(&paths.repo_5e, lock_5e);
        let (ts, date) = commit_timestamp_and_date(&paths.repo_5e, &rev)
          .ok_or_else(|| format!("Couldn't read the date of 5e's {rev}"))?;
        if dry_run {
          out.push(SyncLog::Info(format!(
            "[dry-run] Would check out 5e-homebrew at its last commit before 5e's ({date})"
          )));
        } else {
          if let Err(e) = git_run(&paths.repo_homebrew, &["fetch", "--quiet"]) {
            out.push(SyncLog::Warn(format!("Couldn't fetch 5e-homebrew: {e}")));
          }
          out.push(SyncLog::Info(anchor_homebrew_inner(&ts, &date)?));
        }
      } else if lock_brew.locked {
        out.push(SyncLog::Info(format!(
          "🔒 5e-homebrew is LOCKED at {} — skipping git pull.",
          lock_brew.pinned_commit.as_deref().unwrap_or("HEAD")
        )));
      } else if !dry_run && paths.repo_homebrew.join(".git").exists() {
        let pulled = ensure_on_branch(&paths.repo_homebrew)
          .and_then(|_| git_run(&paths.repo_homebrew, &["pull", "--ff-only"]));
        match pulled {
          Ok(msg) => out.push(SyncLog::Info(format!("5e-homebrew: {msg}"))),
          Err(e) => out.push(SyncLog::Warn(format!("5e-homebrew pull warning: {e}"))),
        }
      } else {
        out.push(SyncLog::Info("[dry-run] Would pull 5e-homebrew".to_string()));
      }
      Ok(out)
    });

    let h_img = scope.spawn(|| -> Vec<SyncLog> {
      let mut out = Vec::new();
      if lock_img.locked {
        out.push(SyncLog::Info(format!(
          "🔒 5e/img is LOCKED at {} — skipping git pull.",
          lock_img.pinned_commit.as_deref().unwrap_or("HEAD")
        )));
      } else if !dry_run && paths.repo_img.join(".git").exists() {
        let pulled = ensure_on_branch(&paths.repo_img)
          .and_then(|_| git_run(&paths.repo_img, &["pull", "--ff-only"]));
        match pulled {
          Ok(msg) => out.push(SyncLog::Info(format!("5e/img: {msg}"))),
          Err(e) => out.push(SyncLog::Warn(format!("5e/img pull warning: {e}"))),
        }
      }
      out
    });

    let brew_res = h_brew
      .join()
      .unwrap_or_else(|_| Err("5e-homebrew sync worker panicked".to_string()));
    let img_logs = h_img.join().unwrap_or_default();
    (brew_res, img_logs)
  });

  for entry in brew_res?.into_iter().chain(img_logs) {
    match entry {
      SyncLog::Info(m) => logger.info(m),
      SyncLog::Warn(m) => logger.warn(m),
    }
  }
  Ok(())
}

fn refresh_homebrew_files(paths: &ResolvedPaths, dry_run: bool, logger: &mut Logger) -> HomebrewSnapshot {
  logger.phase("homebrew");
  logger.step("Step 3: Processing Homebrew & Updating toImport");
  let brew_dir = paths.repo_5e.join("homebrew");
  let drafts_dir = brew_dir.join("drafts");
  let unused_dir = brew_dir.join("unused");
  let index_path = brew_dir.join("index.json");
  let backup_index_path = drafts_dir.join("index.json");

  if !dry_run {
    let _ = fs::create_dir_all(&drafts_dir);
    let _ = fs::create_dir_all(&unused_dir);
    if index_path.exists() {
      let _ = fs::copy(&index_path, &backup_index_path);
    }
  }

  let index_val: Value = fs::read_to_string(&index_path)
    .ok()
    .and_then(|s| serde_json::from_str(&s).ok())
    .unwrap_or_else(|| json!({ "readme": [], "toImport": [], "notUsed": [] }));

  let to_import_set: HashSet<String> = index_val
    .get("toImport")
    .and_then(|v| v.as_array())
    .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
    .unwrap_or_default();
  let not_used_set: HashSet<String> = index_val
    .get("notUsed")
    .and_then(|v| v.as_array())
    .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
    .unwrap_or_default();

  let source_map = build_source_file_map(&paths.repo_homebrew);
  let mut updated_brews = 0usize;
  for file_name in &to_import_set {
    let target_path = brew_dir.join(file_name);
    if !target_path.exists() {
      continue;
    }
    if let Some(src_path) = source_map.get(file_name) {
      if mtime_secs(src_path) > mtime_secs(&target_path) {
        if !dry_run {
          let _ = fs::copy(src_path, &target_path);
        }
        updated_brews += 1;
        logger.info(format!(
          "{} homebrew from 5e-homebrew: {file_name}",
          if dry_run { "[dry-run] Would update" } else { "Updated" }
        ));
      }
    }
  }
  logger.info(format!(
    "Checked {} toImport file(s); {} updated.",
    to_import_set.len(),
    updated_brews
  ));

  for file_name in &not_used_set {
    let target_path = brew_dir.join(file_name);
    if target_path.exists() {
      if !dry_run {
        let _ = fs::rename(&target_path, unused_dir.join(file_name));
      }
      logger.info(format!(
        "{} notUsed file to unused/: {file_name}",
        if dry_run { "[dry-run] Would move" } else { "Moved" }
      ));
    }
  }

  HomebrewSnapshot { brew_dir, index_path, index_val, to_import_set, not_used_set }
}

fn reset_and_pull_5e(
  paths: &ResolvedPaths,
  lock_5e: &RepoLockEntry,
  lock_utils: &RepoLockEntry,
  dry_run: bool,
  logger: &mut Logger,
) -> Result<(), String> {
  logger.phase("reset");
  logger.step("Step 4 & 5: Resetting & Updating 5e Checkout");
  if !dry_run {
    git_run(&paths.repo_5e, &["checkout", "--", "."])?;
    let excludes = clean_excludes(&paths.repo_5e, &[&paths.repo_images, &paths.repo_img]);
    let mut clean_args = vec!["clean", "-fd"];
    clean_args.extend(excludes.iter().map(String::as_str));
    let _ = git_run(&paths.repo_5e, &clean_args);
    if lock_5e.locked {
      if let Some(pin) = &lock_5e.pinned_commit {
        let current = git_capture(&paths.repo_5e, &["rev-parse", "--short", "HEAD"]).unwrap_or_default();
        if !current.starts_with(pin) && !pin.starts_with(&current) {
          ensure_full_history(&paths.repo_5e)?;
          git_run(&paths.repo_5e, &["checkout", pin])?;
          logger.info(format!("Checked out locked 5e commit {pin}"));
        } else {
          logger.info(format!("🔒 Kept 5e at locked commit {current}"));
        }
      }
    } else {
      // A rollback or a lock leaves 5e on a bare commit, which can't pull.
      ensure_on_branch(&paths.repo_5e)?;
      let mut pull_cmd = git_cmd(&paths.repo_5e, &["pull", "--ff-only"]);
      pull_cmd.env("HBM_NO_PUBLISH", "1");
      let pulled = pull_cmd.output().map_err(|e| e.to_string())?;
      if !pulled.status.success() {
        return Err(format!(
          "git pull --ff-only failed in 5e: {}",
          String::from_utf8_lossy(&pulled.stderr)
        ));
      }
      logger.info("Pulled latest 5e.");
    }
  } else {
    logger.info(if lock_5e.locked {
      "[dry-run] Would reset 5e working tree and stay at locked commit"
    } else {
      "[dry-run] Would reset 5e working tree and run git pull --ff-only"
    });
  }

  // Sync 5etools-utils if follow_5e_package_json is enabled. Brew schemas
  // that don't match the site make every check after this one wrong, so a
  // failure stops the run.
  if lock_utils.follow_5e_package_json {
    logger.step("Step 5b: Aligning 5etools-utils Schema Version to 5e");
    if dry_run {
      logger.info("[dry-run] Would align 5etools-utils to match 5e/package.json");
    } else {
      let aligned = sync_utils_to_5e_inner().map_err(|e| format!("Couldn't match 5etools-utils to 5e: {e}"))?;
      if aligned.guessed {
        logger.warn(aligned.message);
      } else {
        logger.info(aligned.message);
      }
    }
  } else if !lock_utils.locked && !dry_run && paths.repo_utils.join(".git").exists() {
    let _ = ensure_on_branch(&paths.repo_utils).and_then(|_| git_run(&paths.repo_utils, &["pull", "--ff-only"]));
  }
  Ok(())
}

fn rebuild_homebrew_index(
  snap: HomebrewSnapshot,
  index_guard: &mut KeepFile,
  dry_run: bool,
  logger: &mut Logger,
) -> Result<(), String> {
  logger.phase("index");
  logger.step("Step 6: Rebuilding homebrew/index.json");
  if let Ok(entries) = fs::read_dir(&snap.brew_dir) {
    let all_json: Vec<String> = entries
      .flatten()
      .filter_map(|e| {
        let n = e.file_name().to_string_lossy().to_string();
        if e.path().is_file() && n.ends_with(".json") {
          Some(n)
        } else {
          None
        }
      })
      .collect();
    let check = check_index(&all_json, &snap.to_import_set, &snap.not_used_set);
    if !check.unlisted.is_empty() {
      logger.warn(format!(
        "{} file(s) in homebrew/ aren't in index.json, so the site won't load them. Keep or move them on the Homebrew Files page: {}",
        check.unlisted.len(),
        check.unlisted.join(", ")
      ));
    }
    if !check.missing.is_empty() {
      logger.warn(format!(
        "index.json lists {} file(s) that aren't in homebrew/. Restore or drop them on the Homebrew Files page: {}",
        check.missing.len(),
        check.missing.join(", ")
      ));
    }
    let final_to_import = check.to_import;

    if !final_to_import.contains(&"content-blocklist.json".to_string()) {
      logger.warn("content-blocklist.json is NOT listed in toImport — blocked content will not be hidden!");
    }

    if !dry_run {
      let mut not_used_vec: Vec<String> = snap.not_used_set.into_iter().collect();
      not_used_vec.sort();
      let new_index = json!({
        "readme": snap.index_val.get("readme").cloned().unwrap_or_else(|| json!([])),
        "toImport": final_to_import,
        "notUsed": not_used_vec,
      });
      let formatted = to_json_pretty_tabs(&new_index)?;
      fs::write(&snap.index_path, format!("{formatted}\n")).map_err(|e| e.to_string())?;
      index_guard.release();
    }
    logger.info(format!(
      "homebrew/index.json: {} file(s) in toImport",
      final_to_import.len()
    ));
  }
  Ok(())
}

/// Builds the candidate site in the 5e checkout: the repos at their set
/// versions, the homebrew refreshed, the customizations applied and the
/// service worker rebuilt. Nothing leaves this machine.
fn prepare_inner(
  paths: &ResolvedPaths,
  modules: &[DeployModule],
  dry_run: bool,
  out: &mut PrepareOutcome,
  logger: &mut Logger,
) -> Result<(), String> {
  let lock_5e = paths.repos.get("5e").cloned().unwrap_or_default();
  let lock_brew = paths.repos.get("5e-homebrew").cloned().unwrap_or_default();
  let lock_img = paths.repos.get("5e-img").cloned().unwrap_or_default();
  let lock_utils = paths.repos.get("5etools-utils").cloned().unwrap_or_default();

  preflight_check(paths, &lock_5e, &lock_utils, dry_run, logger);
  sync_external_repos(paths, &lock_5e, &lock_brew, &lock_img, dry_run, logger)?;
  let snap = refresh_homebrew_files(paths, dry_run, logger);

  // The checkout below resets homebrew/index.json to the site's empty one.
  // Until Step 6 writes the new index, this keeps ours safe from a failed run.
  let mut index_guard = KeepFile::new(&snap.index_path, !dry_run);
  reset_and_pull_5e(paths, &lock_5e, &lock_utils, dry_run, logger)?;

  // Step 5c: Hide sources the pulls above added to the site
  logger.phase("block");
  logger.step("Step 5c: Blocking New Sources");
  let mut local_files: Vec<String> = snap
    .to_import_set
    .iter()
    .filter(|f| !snap.not_used_set.contains(*f) && !IGNORED_HOMEBREW.contains(&f.as_str()))
    .cloned()
    .collect();
  local_files.sort();
  out.blocked = block_new_sources_step(paths, &snap.brew_dir, &local_files, dry_run, logger);

  rebuild_homebrew_index(snap, &mut index_guard, dry_run, logger)?;

  // Step 7: Customizations (each enabled module's CSS, files and patches)
  logger.phase("modules");
  logger.step("Step 7: Applying Customizations");
  patch_runner::build_module_packages(&paths.data_dir, modules, dry_run, logger)?;
  let applied = patch_runner::apply_modules(&paths.repo_5e, &paths.data_dir, modules, dry_run, logger)?;
  out.applied = applied.applied;
  out.skipped = applied.skipped;
  out.modules = applied.checks;

  // Step 8: Rebuild Service Worker
  logger.phase("worker");
  logger.step("Step 8: Rebuilding Service Worker (sw.js)");
  rebuild_sw_inner(&paths.repo_5e, dry_run, logger)?;
  Ok(())
}

/// Make sure the local server is up, so the candidate can be previewed.
async fn ensure_preview(logger: &mut Logger) -> Option<String> {
  logger.phase("preview");
  logger.step("Serving the Candidate Locally");
  let mut status = crate::server::get_local_server_status().await.ok()?;
  if !status.running {
    status = crate::server::start_or_restart_local_server(None).await;
  }
  match &status.error {
    Some(e) => {
      logger.warn(format!("Couldn't start the local server: {e}"));
      None
    }
    None => {
      logger.info(format!("Preview the candidate at {}", status.url));
      Some(status.url)
    }
  }
}

/// Pretty-print JSON indented with tabs without mangling double spaces inside string values.
fn to_json_pretty_tabs(value: &Value) -> Result<String, String> {
  let mut buf = Vec::new();
  let formatter = serde_json::ser::PrettyFormatter::with_indent(b"\t");
  let mut ser = serde_json::Serializer::with_formatter(&mut buf, formatter);
  value.serialize(&mut ser).map_err(|e| e.to_string())?;
  String::from_utf8(buf).map_err(|e| e.to_string())
}

pub async fn run_pipeline(
  action: String,
  dry_run: bool,
) -> Result<PipelineSummary, String> {
  let prepares = action == "prepare" || action == "full";
  let action_bg = action.clone();
  let mods_root = modules_dir();
  let sink = current_event_sink();

  let (run_res, paths, prepared, published, prepare_done, mut logger) =
    tokio::task::spawn_blocking(move || {
      let paths = resolve_paths();
      let config = read_raw_config();
      let modules_res = load_modules(&mods_root, &config);
      let scripts = load_scripts(&config);
      let images = deploy_image_repos(&paths.repo_img, &paths.repo_images);
      let mut logger = Logger::new(sink);
      let mut prepared = PrepareOutcome::default();
      let mut published = false;
      // Whether Prepare itself got to the end, apart from a publish after it.
      let mut prepare_done = false;

      let run_res: Result<(), String> = (|| {
        let modules = modules_res?;
        match action_bg.as_str() {
          "local" => {
            logger.step("Applying Customizations");
            patch_runner::build_module_packages(&paths.data_dir, &modules, dry_run, &mut logger)?;
            if !dry_run {
              patch_runner::restore_module_targets(&paths.repo_5e, &paths.data_dir, &modules, &mut logger)?;
            }
            let applied = patch_runner::apply_modules(&paths.repo_5e, &paths.data_dir, &modules, dry_run, &mut logger)?;
            prepared.applied = applied.applied;
            prepared.skipped = applied.skipped;
            logger.step("Building Service Worker (sw.js)");
            rebuild_sw_inner(&paths.repo_5e, dry_run, &mut logger)?;
            if !dry_run {
              logger.step("Not Published Yet");
              logger.info("Customizations are applied to the local site only. Press Publish to release them.");
            }
          }
          "prepare" => {
            prepare_inner(&paths, &modules, dry_run, &mut prepared, &mut logger)?;
            prepare_done = true;
          }
          "publish" => {
            published = publish::publish_inner(&paths, &modules, &images, &scripts, dry_run, &mut logger)?;
          }
          // Both halves back to back. The Deploy page uses it for the dry run.
          "full" => {
            prepare_inner(&paths, &modules, dry_run, &mut prepared, &mut logger)?;
            prepare_done = true;
            published = publish::publish_inner(&paths, &modules, &images, &scripts, dry_run, &mut logger)?;
          }
          one if one.starts_with("images:") => {
            let id = &one["images:".len()..];
            let image = images
              .iter()
              .find(|i| i.id == id)
              .ok_or_else(|| format!("No image repo with id {id}"))?;
            if !image.downloaded {
              return Err(format!("{} isn't downloaded, so there's nothing to copy.", image.title));
            }
            if paths.site_deploy_folders.is_empty() {
              return Err("No site deploy folders are set.".to_string());
            }
            logger.step(&format!("Copying {} to the Deploy Folders", image.title));
            for target in &paths.site_deploy_folders {
              publish::add_images(image, target, dry_run, &mut logger)?;
            }
          }
          one if one.starts_with("script:") => {
            let id = &one["script:".len()..];
            let script = scripts
              .iter()
              .find(|s| s.id == id)
              .ok_or_else(|| format!("No deploy script with id {id}"))?;
            logger.step(&format!("Running {}", script.title));
            let env = publish::script_env(&paths, &modules, &mut logger);
            publish::run_deploy_script(script, &scripts_dir(), &env, dry_run, &mut logger)?;
          }
          other => return Err(format!("Unknown pipeline action: {other}")),
        }
        Ok(())
      })();

      (run_res, paths, prepared, published, prepare_done, logger)
    })
    .await
    .map_err(|e| e.to_string())?;

  let ok = run_res.is_ok();
  let preview_url = if action == "prepare" && ok && !dry_run {
    ensure_preview(&mut logger).await
  } else {
    None
  };
  if let Err(e) = &run_res {
    logger.error(format!("Pipeline failed: {e}"));
  }

  let (prepared, mut logger) = if !dry_run && (prepares || (ok && published)) {
    tokio::task::spawn_blocking(move || {
      if prepares {
        let warnings = logger.warnings.clone();
        publish::record_prepare(&paths, prepare_done, &prepared, &warnings, &mut logger);
      }
      if ok && published {
        publish::record_last_run(&paths, &mut logger);
      }
      (prepared, logger)
    })
    .await
    .map_err(|e| e.to_string())?
  } else {
    (prepared, logger)
  };

  if ok {
    logger.emit("done", "Pipeline finished.");
  }

  Ok(PipelineSummary {
    action,
    dry_run,
    ok,
    patches_applied: prepared.applied,
    patches_skipped: prepared.skipped,
    warnings: logger.warnings,
    logs: logger.logs,
    preview_url,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;

  fn commit_all(root: &Path, msg: &str) {
    git_run(root, &["add", "-A"]).unwrap();
    git_run(root, &["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", msg]).unwrap();
  }

  fn names(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
  }

  #[test]
  fn clean_excludes_protects_an_images_folder_inside_the_tools_repo() {
    let tools = Path::new("C:/h/tools");
    let args = clean_excludes(tools, &[&tools.join("homebrew-images")]);
    assert!(args.contains(&"--exclude=homebrew-images/".to_string()));
    assert!(args.contains(&"--exclude=homebrew/".to_string()));
  }

  #[test]
  fn clean_excludes_protects_a_renamed_site_images_folder() {
    let tools = Path::new("C:/h/tools");
    let args = clean_excludes(tools, &[&tools.join("hb-img"), &tools.join("site-img")]);
    assert!(args.contains(&"--exclude=hb-img/".to_string()));
    assert!(args.contains(&"--exclude=site-img/".to_string()));
  }

  #[test]
  fn clean_excludes_ignores_an_images_folder_elsewhere() {
    let args = clean_excludes(Path::new("C:/h/tools"), &[Path::new("C:/h/images")]);
    assert_eq!(
      args,
      vec!["--exclude=homebrew/", "--exclude=homebrew-img/", "--exclude=generate/", "--exclude=img/"]
    );
  }

  #[test]
  fn a_run_that_stops_after_the_reset_keeps_our_homebrew_index() {
    let root = temp_dir("keep-index");
    let index = root.join("homebrew/index.json");
    fs::create_dir_all(index.parent().unwrap()).unwrap();
    fs::write(&index, "{\"toImport\": []}\n").unwrap();
    git_run(&root, &["init", "--quiet"]).unwrap();
    commit_all(&root, "site");
    let ours = "{\"toImport\": [\"A; B.json\"]}\n";
    fs::write(&index, ours).unwrap();

    let stopped = || -> Result<(), String> {
      let _guard = KeepFile::new(&index, true);
      git_run(&root, &["checkout", "--", "."])?;
      Err("pull failed".into())
    };
    assert!(stopped().is_err());
    assert_eq!(fs::read_to_string(&index).unwrap(), ours);
  }

  #[test]
  fn an_empty_index_lists_nothing_and_reports_every_brew() {
    let on_disk = names(&["A; One.json", "B; Two.json", "content-blocklist.json", "index.json"]);
    let check = check_index(&on_disk, &HashSet::new(), &HashSet::new());
    assert_eq!(check.to_import, names(&["content-blocklist.json"]));
    assert_eq!(check.unlisted, names(&["A; One.json", "B; Two.json"]));
    assert!(check.missing.is_empty());
  }

  #[test]
  fn a_listed_file_that_is_gone_stays_listed_and_is_reported() {
    let on_disk = names(&["A; One.json", "content-blocklist.json"]);
    let listed: HashSet<String> = names(&["A; One.json", "Gone; Brew.json", "content-blocklist.json"]).into_iter().collect();
    let not_used: HashSet<String> = names(&["Old; Brew.json"]).into_iter().collect();
    let check = check_index(&on_disk, &listed, &not_used);
    assert_eq!(check.to_import, names(&["A; One.json", "Gone; Brew.json", "content-blocklist.json"]));
    assert_eq!(check.missing, names(&["Gone; Brew.json"]));
    assert!(check.unlisted.is_empty());
  }

  #[test]
  fn a_released_keep_file_leaves_the_new_contents() {
    let root = temp_dir("keep-released");
    let file = root.join("index.json");
    fs::write(&file, "old").unwrap();
    {
      let mut guard = KeepFile::new(&file, true);
      fs::write(&file, "new").unwrap();
      guard.release();
    }
    assert_eq!(fs::read_to_string(&file).unwrap(), "new");
  }

  #[test]
  fn tab_pretty_json_preserves_double_spaces_in_filenames() {
    let val = json!({
      "readme": ["Line  with  spaces"],
      "toImport": ["Author;  Double Space.json"],
      "notUsed": [],
    });
    let formatted = to_json_pretty_tabs(&val).unwrap();
    assert!(formatted.contains("\n\t\"toImport\": [\n\t\t\"Author;  Double Space.json\""));
    let parsed: Value = serde_json::from_str(&formatted).unwrap();
    assert_eq!(parsed, val);
  }
}
