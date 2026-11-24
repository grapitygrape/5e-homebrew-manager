use crate::config::{resolve_paths, save_repo_locks, RepoLockEntry, ResolvedPaths};
use crate::process::cmd;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub(crate) fn git_cmd(cwd: &Path, args: &[&str]) -> Command {
  let mut c = cmd("git");
  c.current_dir(cwd).args(args);
  c
}

pub(crate) fn git_capture(cwd: &Path, args: &[&str]) -> Option<String> {
  let output = git_cmd(cwd, args).output().ok()?;
  if !output.status.success() {
    return None;
  }
  Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Setup clones latest-only. Older tags and commits need the full history, so
/// fetch it the first time one is asked for.
pub(crate) fn ensure_full_history(dir: &Path) -> Result<(), String> {
  if dir.join(".git").join("shallow").exists() {
    git_run(dir, &["fetch", "--unshallow", "--tags"])?;
  }
  Ok(())
}

pub(crate) fn git_run(cwd: &Path, args: &[&str]) -> Result<String, String> {
  let output = git_cmd(cwd, args)
    .output()
    .map_err(|e| format!("Failed to spawn git: {e}"))?;
  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  if !output.status.success() {
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    return Err(format!("git {} failed: {}", args.join(" "), detail));
  }
  Ok(if !stdout.is_empty() { stdout } else { stderr })
}

/// Every repo the overview shows, in display order. Lock entries use these ids.
pub(crate) const REPO_IDS: [&str; 5] = ["5e", "5etools-utils", "5e-homebrew", "5e-img", "homebrew-img"];

/// A tag and when it was made, so a version can be matched to a date.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
  pub name: String,
  /// Unix seconds: the tagger date for annotated tags, else the commit date.
  pub timestamp: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
  pub id: String,
  pub label: String,
  pub path: String,
  pub exists: bool,
  pub branch: String,
  pub commit: String,
  pub full_commit: String,
  pub commit_date: String,
  pub commit_timestamp: i64,
  pub commit_subject: String,
  pub exact_tag: Option<String>,
  pub nearest_tag: Option<String>,
  /// The exact tag at HEAD, else the nearest one behind it.
  pub version_tag: Option<TagInfo>,
  pub package_version: Option<String>,
  pub dirty_files: Vec<String>,
  pub ahead_count: u32,
  pub behind_count: u32,
  pub recent_tags: Vec<TagInfo>,
  pub lock: RepoLockEntry,
  pub at_pinned_commit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSyncReport {
  pub site_version: Option<String>,
  pub expected_utils_version: Option<String>,
  pub actual_utils_version: Option<String>,
  pub status: String, // "synced" | "ahead" | "behind" | "unknown"
  pub message: String,
  pub homebrew_commits_after_5e: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReposOverview {
  pub web_root: String,
  pub site_deploy_folders: Vec<String>,
  pub config_path: String,
  pub repos: Vec<RepoStatus>,
  pub schema_sync: SchemaSyncReport,
}

pub(crate) fn read_package_json(repo_dir: &Path) -> Option<Value> {
  let raw = fs::read_to_string(repo_dir.join("package.json")).ok()?;
  serde_json::from_str(&raw).ok()
}

fn package_json_version(pkg: &Value) -> Option<&str> {
  pkg.get("version").and_then(Value::as_str)
}

pub(crate) fn package_version(repo_dir: &Path) -> Option<String> {
  read_package_json(repo_dir).and_then(|v| package_json_version(&v).map(String::from))
}

pub(crate) fn short_sha(sha: &str) -> String {
  sha[..7.min(sha.len())].to_string()
}

/// `(unix_seconds, YYYY-MM-DD)` for `rev` from a single `git log -1` call.
pub(crate) fn commit_timestamp_and_date(dir: &Path, rev: &str) -> Option<(String, String)> {
  let raw = git_capture(dir, &["log", "-1", "--format=%ct%x1f%cs", rev])?;
  let (ts, date) = raw.split_once('\x1f')?;
  Some((ts.to_string(), date.to_string()))
}

#[derive(Debug, Default, PartialEq, Eq)]
struct HeadCommit {
  short: String,
  full: String,
  date: String,
  timestamp: i64,
  subject: String,
}

fn parse_head_commit(raw: &str) -> HeadCommit {
  let mut parts = raw.splitn(5, '\x1f');
  HeadCommit {
    short: parts.next().unwrap_or_default().to_string(),
    full: parts.next().unwrap_or_default().to_string(),
    date: parts.next().unwrap_or_default().to_string(),
    timestamp: parts.next().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0),
    subject: parts.next().unwrap_or_default().to_string(),
  }
}

fn pin_entry_to_head(dir: &Path, entry: &mut RepoLockEntry) {
  let commit = git_capture(dir, &["rev-parse", "--short", "HEAD"]);
  let pinned_ref = git_capture(dir, &["describe", "--tags", "--exact-match", "HEAD"])
    .or_else(|| git_capture(dir, &["symbolic-ref", "--short", "HEAD"]));
  entry.pinned_commit = commit;
  entry.pinned_ref = pinned_ref;
}

fn clean_semver(raw: &str) -> String {
  raw
    .trim()
    .trim_start_matches('^')
    .trim_start_matches('~')
    .trim_start_matches('=')
    .trim_start_matches('v')
    .to_string()
}

fn compare_semver(a: &str, b: &str) -> std::cmp::Ordering {
  let parse = |s: &str| -> Vec<u32> {
    clean_semver(s)
      .split('.')
      .map(|p| p.parse::<u32>().unwrap_or(0))
      .collect()
  };
  let va = parse(a);
  let vb = parse(b);
  va.cmp(&vb)
}

pub(crate) fn repo_dir_for<'a>(paths: &'a ResolvedPaths, id: &str) -> Option<(&'static str, &'a PathBuf)> {
  match id {
    "5e" => Some(("5etools Site (5e)", &paths.repo_5e)),
    "5etools-utils" => Some(("Brew Schemas (5etools-utils)", &paths.repo_utils)),
    "5e-homebrew" => Some(("Partnered Brews (5e-homebrew)", &paths.repo_homebrew)),
    "5e-img" => Some(("Site Images (5e/img)", &paths.repo_img)),
    "homebrew-img" => Some(("Homebrew Images (homebrew-img)", &paths.repo_images)),
    _ => None,
  }
}

fn inspect_repo(id: &str, label: &str, dir: &Path, lock: RepoLockEntry) -> RepoStatus {
  let exists = dir.join(".git").exists();
  if !exists {
    return RepoStatus {
      id: id.to_string(),
      label: label.to_string(),
      path: dir.to_string_lossy().to_string(),
      lock,
      at_pinned_commit: true,
      ..Default::default()
    };
  }

  let branch = git_capture(dir, &["symbolic-ref", "--short", "HEAD"])
    .unwrap_or_else(|| "detached".to_string());
  let head = git_capture(dir, &["log", "-1", "--format=%h%x1f%H%x1f%ci%x1f%ct%x1f%s"])
    .map(|s| parse_head_commit(&s))
    .unwrap_or_default();
  let commit = head.short;
  let full_commit = head.full;
  let commit_date = head.date;
  let commit_timestamp = head.timestamp;
  let commit_subject = head.subject;
  let exact_tag = git_capture(dir, &["describe", "--tags", "--exact-match", "HEAD"]);
  let nearest_tag = git_capture(dir, &["describe", "--tags", "--abbrev=0"]);

  let package_version = package_version(dir);

  let dirty_raw = git_capture(dir, &["status", "--porcelain", "--untracked-files=no"]).unwrap_or_default();
  let dirty_files: Vec<String> = dirty_raw
    .lines()
    .map(str::trim)
    .filter(|l| !l.is_empty())
    .map(String::from)
    .collect();

  // Compare against upstream (@{u}) or origin/master fallback
  let (ahead_count, behind_count) = git_capture(dir, &["rev-list", "--left-right", "--count", "HEAD...@{u}"])
    .or_else(|| git_capture(dir, &["rev-list", "--left-right", "--count", "HEAD...origin/master"]))
    .and_then(|s| {
      let mut parts = s.split_whitespace();
      let a = parts.next()?.parse::<u32>().ok()?;
      let b = parts.next()?.parse::<u32>().ok()?;
      Some((a, b))
    })
    .unwrap_or((0, 0));

  let recent_tags = parse_tag_lines(
    &git_capture(
      dir,
      &[
        "for-each-ref",
        "--sort=-creatordate",
        "--count=25",
        "--format=%(refname:short)%09%(creatordate:unix)",
        "refs/tags",
      ],
    )
    .unwrap_or_default(),
  );
  let version_tag = exact_tag.as_ref().or(nearest_tag.as_ref()).and_then(|tag| {
    recent_tags.iter().find(|t| t.name == *tag).cloned().or_else(|| {
      // The nearest tag can be older than the 25 listed, so look it up directly.
      let line = git_capture(
        dir,
        &["for-each-ref", "--format=%(refname:short)%09%(creatordate:unix)", &format!("refs/tags/{tag}")],
      )?;
      parse_tag_lines(&line).into_iter().next()
    })
  });

  let at_pinned_commit = match &lock.pinned_commit {
    Some(pin) if !pin.is_empty() => {
      full_commit.starts_with(pin) || commit.starts_with(pin) || pin.starts_with(&commit)
    }
    _ => true,
  };

  RepoStatus {
    id: id.to_string(),
    label: label.to_string(),
    path: dir.to_string_lossy().to_string(),
    exists: true,
    branch,
    commit,
    full_commit,
    commit_date,
    commit_timestamp,
    commit_subject,
    exact_tag,
    nearest_tag,
    version_tag,
    package_version,
    dirty_files,
    ahead_count,
    behind_count,
    recent_tags,
    lock,
    at_pinned_commit,
  }
}

/// `name<TAB>unix-seconds` lines from `git for-each-ref`.
fn parse_tag_lines(raw: &str) -> Vec<TagInfo> {
  raw
    .lines()
    .filter_map(|line| {
      let (name, ts) = line.trim().split_once('\t')?;
      Some(TagInfo {
        name: name.to_string(),
        timestamp: ts.trim().parse().unwrap_or(0),
      })
    })
    .filter(|t| !t.name.is_empty())
    .collect()
}

fn build_repos_overview() -> ReposOverview {
  let paths = resolve_paths();
  let specs: Vec<(&str, &str, &Path, RepoLockEntry)> = REPO_IDS
    .iter()
    .filter_map(|&id| {
      let (label, dir) = repo_dir_for(&paths, id)?;
      let lock = paths.repos.get(id).cloned().unwrap_or_default();
      Some((id, label, dir.as_path(), lock))
    })
    .collect();

  // Inspect all configured repos concurrently, preserving REPO_IDS display order.
  let repos: Vec<RepoStatus> = std::thread::scope(|scope| {
    let handles: Vec<_> = specs
      .into_iter()
      .map(|(id, label, dir, lock)| scope.spawn(move || inspect_repo(id, label, dir, lock)))
      .collect();
    handles.into_iter().filter_map(|h| h.join().ok()).collect()
  });

  let pkg_5e = read_package_json(&paths.repo_5e);
  let site_version = pkg_5e.as_ref().and_then(package_json_version).map(String::from);
  let expected_utils_version = pkg_5e
    .as_ref()
    .and_then(|v| v.get("devDependencies")?.get("5etools-utils")?.as_str())
    .map(clean_semver);

  let actual_utils_version = package_version(&paths.repo_utils).map(|v| clean_semver(&v));

  let (status, message) = match (&expected_utils_version, &actual_utils_version) {
    (Some(exp), Some(act)) => match compare_semver(act, exp) {
      std::cmp::Ordering::Equal => (
        "synced".to_string(),
        format!(
          "5etools-utils v{act} matches 5e v{}",
          site_version.as_deref().unwrap_or("?")
        ),
      ),
      std::cmp::Ordering::Greater => (
        "ahead".to_string(),
        format!(
          "5etools-utils (v{act}) is newer than 5e v{} expects (v{exp}). Brew schemas may enforce properties not yet in your site.",
          site_version.as_deref().unwrap_or("?")
        ),
      ),
      std::cmp::Ordering::Less => (
        "behind".to_string(),
        format!(
          "5etools-utils (v{act}) is older than 5e v{} expects (v{exp}).",
          site_version.as_deref().unwrap_or("?")
        ),
      ),
    },
    _ => (
      "unknown".to_string(),
      "Could not read 5etools-utils version from package.json.".to_string(),
    ),
  };

  let ts_5e = repos
    .iter()
    .find(|r| r.id == "5e")
    .map(|r| r.commit_timestamp)
    .unwrap_or(0);
  let homebrew_commits_after_5e = if ts_5e > 0 && paths.repo_homebrew.join(".git").exists() {
    git_capture(
      &paths.repo_homebrew,
      &["rev-list", "--count", &format!("--since={}", ts_5e + 60), "HEAD"],
    )
    .and_then(|s| s.parse::<u32>().ok())
    .unwrap_or(0)
  } else {
    0
  };

  ReposOverview {
    web_root: paths.web_root.to_string_lossy().to_string(),
    site_deploy_folders: paths.site_deploy_folders,
    config_path: paths.config_path.to_string_lossy().to_string(),
    repos,
    schema_sync: SchemaSyncReport {
      site_version,
      expected_utils_version,
      actual_utils_version,
      status,
      message,
      homebrew_commits_after_5e,
    },
  }
}

pub async fn get_repos_overview() -> Result<ReposOverview, String> {
  tokio::task::spawn_blocking(build_repos_overview)
    .await
    .map_err(|e| e.to_string())
}

pub async fn fetch_all_repos() -> Result<ReposOverview, String> {
  tokio::task::spawn_blocking(|| {
    let paths = resolve_paths();
    let dirs: Vec<&Path> = REPO_IDS
      .iter()
      .filter_map(|&id| repo_dir_for(&paths, id).map(|(_, d)| d.as_path()))
      .filter(|dir| dir.join(".git").exists())
      .collect();
    std::thread::scope(|scope| {
      for dir in dirs {
        scope.spawn(move || {
          let _ = git_run(dir, &["fetch", "--tags", "--quiet"]);
        });
      }
    });
    build_repos_overview()
  })
  .await
  .map_err(|e| e.to_string())
}

pub async fn set_repo_lock(
  repo_id: String,
  locked: bool,
  pin_current: bool,
  follow_5e_package_json: Option<bool>,
  follow_5e_date: Option<bool>,
  note: Option<String>,
) -> Result<ReposOverview, String> {
  tokio::task::spawn_blocking(move || -> Result<ReposOverview, String> {
    let mut paths = resolve_paths();
    let (_, dir) = repo_dir_for(&paths, &repo_id)
      .ok_or_else(|| format!("Unknown repository id: {repo_id}"))?;
    let dir_buf = dir.clone();

    let entry = paths.repos.entry(repo_id.clone()).or_default();
    entry.locked = locked;
    if let Some(follow) = follow_5e_package_json {
      entry.follow_5e_package_json = follow;
    }
    if let Some(follow) = follow_5e_date {
      entry.follow_5e_date = follow;
    }
    if let Some(n) = note {
      entry.note = n;
    }

    if locked && pin_current && dir_buf.join(".git").exists() {
      pin_entry_to_head(&dir_buf, entry);
    } else if !locked {
      entry.pinned_commit = None;
      entry.pinned_ref = None;
    }

    save_repo_locks(&paths.repos)?;
    Ok(build_repos_overview())
  })
  .await
  .map_err(|e| e.to_string())?
}

pub async fn lock_all_at_current(note: Option<String>) -> Result<ReposOverview, String> {
  tokio::task::spawn_blocking(move || -> Result<ReposOverview, String> {
    let mut paths = resolve_paths();
    let shared_note = note.unwrap_or_else(|| "Locked snapshot".to_string());

    for id in REPO_IDS {
      if let Some((_, dir)) = repo_dir_for(&paths, id) {
        let dir_buf = dir.clone();
        if dir_buf.join(".git").exists() {
          let entry = paths.repos.entry(id.to_string()).or_default();
          entry.locked = true;
          pin_entry_to_head(&dir_buf, entry);
          if entry.note.is_empty() {
            entry.note = shared_note.clone();
          }
        }
      }
    }
    save_repo_locks(&paths.repos)?;
    Ok(build_repos_overview())
  })
  .await
  .map_err(|e| e.to_string())?
}

pub async fn unlock_all_repos() -> Result<ReposOverview, String> {
  tokio::task::spawn_blocking(|| -> Result<ReposOverview, String> {
    let mut paths = resolve_paths();
    for entry in paths.repos.values_mut() {
      entry.locked = false;
      entry.pinned_commit = None;
      entry.pinned_ref = None;
    }
    save_repo_locks(&paths.repos)?;
    Ok(build_repos_overview())
  })
  .await
  .map_err(|e| e.to_string())?
}

pub async fn checkout_repo_ref(
  repo_id: String,
  target_ref: String,
  lock_after: bool,
) -> Result<ReposOverview, String> {
  tokio::task::spawn_blocking(move || -> Result<ReposOverview, String> {
    let mut paths = resolve_paths();
    let (_, dir) = repo_dir_for(&paths, &repo_id)
      .ok_or_else(|| format!("Unknown repository id: {repo_id}"))?;
    let dir_buf = dir.clone();

    let target = target_ref.trim();
    if target.is_empty() {
      return Err("Target ref/tag/commit cannot be empty.".to_string());
    }

    ensure_full_history(&dir_buf)?;

    // For 5e, discard applied override edits before switching tags/commits
    if repo_id == "5e" {
      let _ = git_run(&dir_buf, &["checkout", "--", "."]);
    }

    git_run(&dir_buf, &["checkout", target])?;

    let commit = git_capture(&dir_buf, &["rev-parse", "--short", "HEAD"]);
    let entry = paths.repos.entry(repo_id).or_default();
    if lock_after {
      entry.locked = true;
      entry.pinned_ref = Some(target.to_string());
      entry.pinned_commit = commit;
    }
    save_repo_locks(&paths.repos)?;
    Ok(build_repos_overview())
  })
  .await
  .map_err(|e| e.to_string())?
}

/// What aligning 5etools-utils did. `guessed` means no tag matched the version
/// 5e asks for, so it took the last commit before 5e's own.
pub(crate) struct UtilsAlignment {
  pub message: String,
  pub guessed: bool,
}

/// Aligns 5etools-utils to the exact version declared in 5e/package.json (or 5e's commit timestamp)
/// and locks 5etools-utils so brew schemas match the site checkout.
pub(crate) fn sync_utils_to_5e_inner() -> Result<UtilsAlignment, String> {
  let mut paths = resolve_paths();
  let pkg_5e = read_package_json(&paths.repo_5e)
    .ok_or_else(|| "Could not read 5e/package.json".to_string())?;
  let site_ver = package_json_version(&pkg_5e).unwrap_or("unknown");
  let exp_utils = pkg_5e
    .get("devDependencies")
    .and_then(|d| d.get("5etools-utils"))
    .and_then(|v| v.as_str())
    .map(clean_semver)
    .ok_or_else(|| "5e/package.json does not list 5etools-utils in devDependencies".to_string())?;

  let utils_dir = paths.repo_utils.clone();
  if !utils_dir.join(".git").exists() {
    return Err(format!("5etools-utils git repo not found at {}", utils_dir.display()));
  }

  // Try tag `v<exp_utils>`, then `<exp_utils>`, then commit before 5e's timestamp
  let candidates = [format!("v{exp_utils}"), exp_utils.clone()];
  let mut chosen_ref: Option<String> = None;
  for cand in &candidates {
    if git_capture(&utils_dir, &["rev-parse", "--verify", &format!("{cand}^{{commit}}")]).is_some() {
      chosen_ref = Some(cand.clone());
      break;
    }
  }

  let guessed = chosen_ref.is_none();
  if chosen_ref.is_none() {
    // Search git log of package.json or commit timestamp matching 5e HEAD
    if let Some((ts_5e, _)) = commit_timestamp_and_date(&paths.repo_5e, "HEAD") {
      if let Some(sha) = git_capture(
        &utils_dir,
        &["rev-list", "-n", "1", &format!("--before={ts_5e}"), "--all"],
      ) {
        if !sha.is_empty() {
          chosen_ref = Some(short_sha(&sha));
        }
      }
    }
  }

  let target = chosen_ref.ok_or_else(|| {
    format!("Could not find tag v{exp_utils} or matching commit in 5etools-utils")
  })?;

  git_run(&utils_dir, &["checkout", &target])?;
  let commit = git_capture(&utils_dir, &["rev-parse", "--short", "HEAD"]);

  let entry = paths.repos.entry("5etools-utils".to_string()).or_default();
  entry.locked = true;
  entry.pinned_ref = Some(target.clone());
  entry.pinned_commit = commit.clone();
  entry.follow_5e_package_json = true;
  entry.note = format!("Matched to 5e v{site_ver} (5etools-utils v{exp_utils})");
  save_repo_locks(&paths.repos)?;

  let message = if guessed {
    format!(
      "No 5etools-utils tag for v{exp_utils}, which 5e v{site_ver} asks for; took {target}, the last commit before 5e's, and locked it"
    )
  } else {
    format!(
      "Checked out and locked 5etools-utils at {target} ({}) for 5e v{site_ver}",
      commit.unwrap_or_default()
    )
  };
  Ok(UtilsAlignment { message, guessed })
}

pub async fn sync_utils_to_5e() -> Result<ReposOverview, String> {
  tokio::task::spawn_blocking(|| -> Result<ReposOverview, String> {
    sync_utils_to_5e_inner()?;
    Ok(build_repos_overview())
  })
  .await
  .map_err(|e| e.to_string())?
}

/// Check 5e-homebrew out at its last commit before `ts_5e` (Unix seconds) and
/// lock it there. The anchor setting is left as it is.
pub(crate) fn anchor_homebrew_inner(ts_5e: &str, date_5e: &str) -> Result<String, String> {
  let mut paths = resolve_paths();
  let brew_dir = paths.repo_homebrew.clone();
  ensure_full_history(&brew_dir)?;
  let sha = git_capture(
    &brew_dir,
    &["rev-list", "-n", "1", &format!("--before={ts_5e}"), "--all"],
  )
  .filter(|s| !s.is_empty())
  .ok_or_else(|| "Could not find a 5e-homebrew commit before 5e's commit date".to_string())?;

  let short = short_sha(&sha);
  git_run(&brew_dir, &["checkout", &short])?;

  let entry = paths.repos.entry("5e-homebrew".to_string()).or_default();
  entry.locked = true;
  entry.pinned_ref = Some(short.clone());
  entry.pinned_commit = Some(short.clone());
  entry.note = format!("Locked to match 5e commit date ({date_5e})");
  save_repo_locks(&paths.repos)?;
  Ok(format!("5e-homebrew is at {short}, its last commit before 5e's ({date_5e}), and locked."))
}

pub async fn sync_homebrew_to_5e_date() -> Result<ReposOverview, String> {
  tokio::task::spawn_blocking(|| -> Result<ReposOverview, String> {
    let paths = resolve_paths();
    let (ts_5e, date_5e) = commit_timestamp_and_date(&paths.repo_5e, "HEAD")
      .ok_or_else(|| "Could not read 5e commit timestamp".to_string())?;
    anchor_homebrew_inner(&ts_5e, &date_5e)?;
    Ok(build_repos_overview())
  })
  .await
  .map_err(|e| e.to_string())?
}

/// A checkout left on a bare commit (by a lock, an anchor or a rollback) can't
/// `pull`. Put it back on the branch its remote's HEAD names first.
pub(crate) fn ensure_on_branch(dir: &Path) -> Result<(), String> {
  if git_capture(dir, &["symbolic-ref", "--quiet", "HEAD"]).is_some() {
    return Ok(());
  }
  let remote_head = git_capture(dir, &["rev-parse", "--abbrev-ref", "origin/HEAD"])
    .ok_or_else(|| format!("{} isn't on a branch and its remote names no default", dir.display()))?;
  let branch = remote_head.strip_prefix("origin/").unwrap_or(&remote_head);
  git_run(dir, &["checkout", branch]).map(|_| ())
}

/// Pin every repo at the commit the last Publish recorded, so the next Prepare
/// rebuilds the live site. 5e is only pinned: Prepare resets it and checks the
/// pin out itself, since the customizations leave its tree edited.
pub async fn roll_back_to_published() -> Result<ReposOverview, String> {
  tokio::task::spawn_blocking(|| -> Result<ReposOverview, String> {
    let run = crate::run_history::get_last_deploy_run()
      .filter(|run| !run.commits.is_empty())
      .ok_or_else(|| "No published release is recorded yet, so there's nothing to roll back to.".to_string())?;
    let mut paths = resolve_paths();
    let note = match &run.site_version {
      Some(v) => format!("Live version (5etools v{v})"),
      None => "Live version".to_string(),
    };
    for (id, sha) in &run.commits {
      let Some((_, dir)) = repo_dir_for(&paths, id) else { continue };
      let dir = dir.clone();
      if !dir.join(".git").exists() {
        continue;
      }
      if id != "5e" {
        ensure_full_history(&dir)?;
        git_run(&dir, &["checkout", sha])?;
      }
      let short = short_sha(sha);
      let entry = paths.repos.entry(id.clone()).or_default();
      entry.locked = true;
      entry.pinned_ref = Some(short.clone());
      entry.pinned_commit = Some(short);
      entry.note = note.clone();
    }
    save_repo_locks(&paths.repos)?;
    Ok(build_repos_overview())
  })
  .await
  .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn tag_lines_keep_name_and_date() {
    let tags = parse_tag_lines("v2.35.0\t1788389891\nrelease/2014\t1700000000\n");
    assert_eq!(tags.len(), 2);
    assert_eq!(tags[0].name, "v2.35.0");
    assert_eq!(tags[0].timestamp, 1788389891);
    assert_eq!(tags[1].name, "release/2014");
  }

  #[test]
  fn tag_lines_skip_blank_and_malformed() {
    assert!(parse_tag_lines("").is_empty());
    assert!(parse_tag_lines("no-tab-here\n\n").is_empty());
  }

  #[test]
  fn parse_head_commit_splits_unit_separated_fields() {
    let raw = "abc1234\x1fabc1234567890def\x1f2026-11-21 12:00:00 -0600\x1f1795284000\x1ffix: keep \x1f subject";
    assert_eq!(
      parse_head_commit(raw),
      HeadCommit {
        short: "abc1234".into(),
        full: "abc1234567890def".into(),
        date: "2026-11-21 12:00:00 -0600".into(),
        timestamp: 1795284000,
        subject: "fix: keep \x1f subject".into(),
      }
    );
    assert_eq!(parse_head_commit(""), HeadCommit::default());
  }

  #[test]
  fn short_sha_truncates_safely() {
    assert_eq!(short_sha("0123456789abcdef"), "0123456");
    assert_eq!(short_sha("abc"), "abc");
    assert_eq!(short_sha(""), "");
  }

  #[test]
  fn homebrew_images_is_a_listed_repo() {
    let paths = crate::config::paths_from(&serde_json::Map::new(), Path::new("hbm-config.json"));
    assert!(REPO_IDS.iter().all(|id| repo_dir_for(&paths, id).is_some()));
  }
}
