//! First-run setup: is git installed, what's in a chosen folder, and cloning
//! or updating one of the four source repos with live progress.
//!
//! Progress streams as `setup-progress` events, one per git progress line, so
//! the setup screen can show a bar per repo.

use crate::config::{resolve_paths, slash_path};
use crate::repos::{git_capture, git_cmd};
use crate::runtime::emit_event;
use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FolderCheck {
  /// "missing" | "empty" | "match" | "otherRepo" | "noGit"
  pub state: String,
  pub remote: Option<String>,
  pub commit_date: Option<String>,
  pub shallow: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome {
  /// "cloned" | "pulled" | "skippedLocked"
  pub action: String,
  pub commit_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupProgress {
  pub id: String,
  pub phase: String,
  pub percent: Option<u8>,
  pub message: String,
}

/// One form for comparing remotes: no scheme, user, `.git` or trailing slash,
/// and `git@host:owner/repo` read as `host/owner/repo`.
fn normalize_repo_url(url: &str) -> String {
  let mut s = url.trim().to_lowercase();
  for scheme in ["https://", "http://", "ssh://", "git://"] {
    if let Some(rest) = s.strip_prefix(scheme) {
      s = rest.to_string();
    }
  }
  if let Some(at) = s.find('@') {
    s = s[at + 1..].to_string();
  }
  // scp-like `host:owner/repo`, but not `host:port/…`
  if let Some(colon) = s.find(':') {
    let after = &s[colon + 1..];
    if !after.starts_with(|c: char| c.is_ascii_digit()) {
      s = format!("{}/{}", &s[..colon], after);
    }
  }
  let s = s.trim_end_matches('/');
  s.strip_suffix(".git").unwrap_or(s).to_string()
}

fn same_repo_url(a: &str, b: &str) -> bool {
  let (a, b) = (normalize_repo_url(a), normalize_repo_url(b));
  !a.is_empty() && a == b
}

/// `Receiving objects:  38% (123/456)` → ("Receiving objects", 38).
fn parse_git_progress(line: &str) -> Option<(String, u8)> {
  let line = line.trim();
  let line = line.strip_prefix("remote:").map(str::trim).unwrap_or(line);
  let (phase, rest) = line.split_once(':')?;
  let pct = rest.trim().split('%').next()?.trim();
  let percent = pct.parse::<u8>().ok()?;
  Some((phase.trim().to_string(), percent.min(100)))
}

fn classify_folder(dir: &Path, url: &str) -> FolderCheck {
  let blank = |state: &str| FolderCheck {
    state: state.to_string(),
    remote: None,
    commit_date: None,
    shallow: false,
  };
  if !dir.exists() {
    return blank("missing");
  }
  let empty = fs::read_dir(dir).map(|mut it| it.next().is_none()).unwrap_or(false);
  if empty {
    return blank("empty");
  }
  if !dir.join(".git").exists() {
    return blank("noGit");
  }
  let remote = git_capture(dir, &["remote", "get-url", "origin"]);
  // With no URL entered yet there's nothing to contradict.
  let matches = url.trim().is_empty() || remote.as_deref().is_some_and(|r| same_repo_url(r, url));
  FolderCheck {
    state: if matches { "match" } else { "otherRepo" }.to_string(),
    remote,
    commit_date: git_capture(dir, &["log", "-1", "--format=%cs"]),
    shallow: dir.join(".git").join("shallow").exists(),
  }
}

/// "git version 2.47.1.windows.1" → "2.47.1.windows.1"; None when git isn't on PATH.
pub fn git_version() -> Option<String> {
  let out = git_cmd(Path::new("."), &["--version"]).output().ok()?;
  if !out.status.success() {
    return None;
  }
  let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
  Some(text.strip_prefix("git version ").unwrap_or(&text).to_string())
}

pub async fn inspect_setup_folder(path: String, url: String) -> Result<FolderCheck, String> {
  tokio::task::spawn_blocking(move || classify_folder(Path::new(&path), &url))
    .await
    .map_err(|e| e.to_string())
}

/// Run git, sending each progress line as an event. Errors carry git's last words.
fn run_git_streaming(id: &str, cwd: &Path, args: &[&str]) -> Result<(), String> {
  let mut child = git_cmd(cwd, args)
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| format!("Failed to start git: {e}"))?;
  let mut stderr = child.stderr.take().ok_or("No git output")?;

  let mut tail: Vec<String> = Vec::new();
  let mut pending = String::new();
  let mut buf = [0u8; 4096];
  let mut emit_line = |line: &str| {
    let line = line.trim();
    if line.is_empty() {
      return;
    }
    let parsed = parse_git_progress(line);
    emit_event(
      "setup-progress",
      &SetupProgress {
        id: id.to_string(),
        phase: parsed.as_ref().map(|(p, _)| p.clone()).unwrap_or_default(),
        percent: parsed.map(|(_, n)| n),
        message: line.to_string(),
      },
    );
    tail.push(line.to_string());
    if tail.len() > 5 {
      tail.remove(0);
    }
  };
  loop {
    let n = stderr.read(&mut buf).map_err(|e| e.to_string())?;
    if n == 0 {
      break;
    }
    pending.push_str(&String::from_utf8_lossy(&buf[..n]));
    // Git redraws progress with \r, so both end a line.
    while let Some(cut) = pending.find(['\r', '\n']) {
      let line: String = pending.drain(..=cut).collect();
      emit_line(&line);
    }
  }
  emit_line(&pending);

  let status = child.wait().map_err(|e| e.to_string())?;
  if status.success() {
    Ok(())
  } else {
    Err(format!("git {} failed: {}", args[0], tail.join(" · ")))
  }
}

/// Clone an empty folder latest-only, or fast-forward one that already holds
/// the repo. A repo locked in Source Data is left alone.
pub async fn sync_setup_repo(
  id: String,
  url: String,
  path: String,
  lock_id: Option<String>,
) -> Result<SyncOutcome, String> {
  tokio::task::spawn_blocking(move || -> Result<SyncOutcome, String> {
    let dir = PathBuf::from(&path);
    let check = classify_folder(&dir, &url);
    let action = match check.state.as_str() {
      "missing" | "empty" => {
        let parent = dir.parent().ok_or("Pick a folder inside another folder")?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let target = slash_path(&dir);
        run_git_streaming(&id, parent, &["clone", "--depth", "1", "--progress", url.trim(), &target])?;
        "cloned"
      }
      "match" => {
        let locked = lock_id
          .and_then(|lid| resolve_paths().repos.get(&lid).map(|l| l.locked))
          .unwrap_or(false);
        if locked {
          "skippedLocked"
        } else {
          run_git_streaming(&id, &dir, &["pull", "--ff-only", "--progress"])?;
          "pulled"
        }
      }
      "otherRepo" => return Err(format!("{path} holds a different repo. Pick another folder.")),
      _ => return Err(format!("{path} has files but no git. Pick an empty folder.")),
    };
    Ok(SyncOutcome {
      action: action.to_string(),
      commit_date: git_capture(&dir, &["log", "-1", "--format=%cs"]),
    })
  })
  .await
  .map_err(|e| e.to_string())?
}

/// The guides shipped with the installer (and copied beside the dev build).
pub fn get_bundled_guides_dir() -> Option<String> {
  crate::runtime::guides_dir().map(|d| slash_path(&d))
}

/// The bridge module shipped with the installer. A debug build uses the repo
/// copy first: `tauri dev` also puts a resource copy in target/debug, but that
/// is a snapshot from the last Rust build and goes stale as the module is edited.
pub fn get_bundled_bridge_dir() -> Option<String> {
  crate::runtime::bridge_dir().map(|d| slash_path(&d))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;

  #[test]
  fn same_repo_url_ignores_form_differences() {
    let canonical = "https://github.com/TheGiddyLimit/homebrew";
    for other in [
      "https://github.com/TheGiddyLimit/homebrew.git",
      "https://github.com/thegiddylimit/homebrew/",
      "http://github.com/TheGiddyLimit/homebrew",
      "git@github.com:TheGiddyLimit/homebrew.git",
      "ssh://git@github.com/TheGiddyLimit/homebrew",
    ] {
      assert!(same_repo_url(canonical, other), "{other}");
    }
    assert!(!same_repo_url(canonical, "https://github.com/TheGiddyLimit/homebrew-img"));
    assert!(!same_repo_url("", ""));
  }

  #[test]
  fn parse_git_progress_reads_phase_and_percent() {
    assert_eq!(
      parse_git_progress("Receiving objects:  38% (123/456), 1.2 MiB | 3 MiB/s"),
      Some(("Receiving objects".to_string(), 38))
    );
    assert_eq!(
      parse_git_progress("remote: Counting objects: 100% (8/8), done."),
      Some(("Counting objects".to_string(), 100))
    );
    assert_eq!(parse_git_progress("Cloning into 'tools'..."), None);
  }

  #[test]
  fn classify_folder_without_git_metadata() {
    let dir = temp_dir("classify");
    assert_eq!(classify_folder(&dir.join("nope"), "").state, "missing");
    let empty = dir.join("empty");
    fs::create_dir_all(&empty).unwrap();
    assert_eq!(classify_folder(&empty, "").state, "empty");
    let zip = dir.join("zip");
    fs::create_dir_all(&zip).unwrap();
    fs::write(zip.join("README.md"), "x").unwrap();
    assert_eq!(classify_folder(&zip, "").state, "noGit");
  }

  #[test]
  fn classify_folder_compares_the_origin_remote() {
    if git_version().is_none() {
      return; // needs git on PATH
    }
    let dir = temp_dir("remote");
    let repo = dir.join("repo");
    fs::create_dir_all(&repo).unwrap();
    git_capture(&repo, &["init", "-q"]).unwrap();
    git_capture(&repo, &["remote", "add", "origin", "https://github.com/a/tools.git"]).unwrap();
    assert_eq!(classify_folder(&repo, "https://github.com/a/tools").state, "match");
    assert_eq!(classify_folder(&repo, "https://github.com/a/other").state, "otherRepo");
  }
}
