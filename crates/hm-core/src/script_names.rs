//! Checks whether any 5etools JS identifiers referenced by our customization
//! scripts or site browser disappeared between the last published commit and HEAD.

use crate::config::resolve_paths;
use crate::modules::modules_dir;
use crate::repos::{git_capture, git_cmd, short_sha};
use crate::run_history::get_last_deploy_run;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

/// What `check_script_names` found: for each script, names 5e's js/ had at the
/// published commit and doesn't at HEAD.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptNameCheck {
  /// The published 5e commit (short), or None when no publish is recorded.
  pub from: Option<String>,
  pub to: String,
  pub missing: Vec<ScriptNames>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptNames {
  pub module: String,
  pub names: Vec<String>,
}

/// Property names (`.foo`) and capitalised names (`Renderer`) a script uses.
/// Comments are prose, and their words would match 5etools comments.
fn names_used(src: &str) -> BTreeSet<String> {
  static BLOCK: OnceLock<Regex> = OnceLock::new();
  static LINE: OnceLock<Regex> = OnceLock::new();
  static PROP: OnceLock<Regex> = OnceLock::new();
  static CAP: OnceLock<Regex> = OnceLock::new();
  let block = BLOCK.get_or_init(|| Regex::new(r"(?s)/\*.*?\*/").unwrap());
  let line = LINE.get_or_init(|| Regex::new(r"(?m)(^|\s)//.*$").unwrap());
  let src = block.replace_all(src, "");
  let src = line.replace_all(&src, "$1");
  let prop = PROP.get_or_init(|| Regex::new(r"\.([A-Za-z_$][A-Za-z0-9_$]{2,})").unwrap());
  let cap = CAP.get_or_init(|| Regex::new(r"\b([A-Z][A-Za-z0-9_]{2,})\b").unwrap());
  prop
    .captures_iter(&src)
    .chain(cap.captures_iter(&src))
    .map(|c| c[1].to_string())
    .collect()
}

/// Every identifier-shaped word in 5e's js/ at `rev`.
pub(crate) fn site_words(site_dir: &Path, rev: &str) -> Result<HashSet<String>, String> {
  let out = git_cmd(site_dir, &["grep", "-h", "-o", "-E", "[A-Za-z_$][A-Za-z0-9_$]*", rev, "--", "js/"])
    .output()
    .map_err(|e| format!("Failed to run git grep: {e}"))?;
  // 1 is "no match", which an empty js/ would give.
  if !out.status.success() && out.status.code() != Some(1) {
    return Err(format!("git grep failed at {rev}: {}", String::from_utf8_lossy(&out.stderr).trim()));
  }
  Ok(String::from_utf8_lossy(&out.stdout)
    .lines()
    .map(|l| l.rsplit(':').next().unwrap_or(l).to_string())
    .collect())
}

/// Names each script uses that 5e defined at `before` and doesn't at `after`.
/// Ours and the browser's never count, since `before` didn't have them either.
pub(crate) fn missing_names(
  scripts: &[(String, String)],
  before: &HashSet<String>,
  after: &HashSet<String>,
) -> Vec<ScriptNames> {
  let mut by_module: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
  for (module, src) in scripts {
    for name in names_used(src) {
      if before.contains(&name) && !after.contains(&name) {
        by_module.entry(module.clone()).or_default().insert(name);
      }
    }
  }
  by_module
    .into_iter()
    .map(|(module, names)| ScriptNames { module, names: names.into_iter().collect() })
    .collect()
}

/// Every module's JS, and the site browser's, as (name, source).
pub(crate) fn our_scripts(modules_root: &Path) -> Vec<(String, String)> {
  let mut out = Vec::new();
  if let Ok(dirs) = fs::read_dir(modules_root) {
    for dir in dirs.flatten().filter(|d| d.path().is_dir()) {
      let module = dir.file_name().to_string_lossy().to_string();
      for file in fs::read_dir(dir.path()).into_iter().flatten().flatten() {
        if file.path().extension().is_some_and(|e| e == "js") {
          if let Ok(src) = fs::read_to_string(file.path()) {
            out.push((module.clone(), src));
          }
        }
      }
    }
  }
  out.push(("site-browser".to_string(), crate::site_browser::SCRIPT.to_string()));
  out
}

/// Compare the candidate's js/ with the published release's, for the names
/// our scripts call. A rename upstream would break a page the site still shows.
pub async fn check_script_names() -> Result<ScriptNameCheck, String> {
  let modules_root = modules_dir();
  tokio::task::spawn_blocking(move || {
    let paths = resolve_paths();
    let to = git_capture(&paths.repo_5e, &["rev-parse", "--short", "HEAD"]).unwrap_or_default();
    let Some(from) = get_last_deploy_run().and_then(|r| r.commits.get("5e").cloned()) else {
      return Ok(ScriptNameCheck { from: None, to, missing: Vec::new() });
    };
    let before = site_words(&paths.repo_5e, &from)?;
    let after = site_words(&paths.repo_5e, "HEAD")?;
    let missing = missing_names(&our_scripts(&modules_root), &before, &after);
    Ok(ScriptNameCheck { from: Some(short_sha(&from)), to, missing })
  })
  .await
  .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_name_5etools_dropped_is_reported_for_the_script_that_uses_it() {
    let before: HashSet<String> = ["Renderer", "getEntryMediaUrl", "toggle"].map(String::from).into();
    let after: HashSet<String> = ["Renderer", "toggle"].map(String::from).into();
    let scripts = vec![
      (
        "shops".to_string(),
        "// getEntryMediaUrl in a comment doesn't count\nRenderer.utils.getEntryMediaUrl(x); el.toggle();".to_string(),
      ),
      ("pinned".to_string(), "Renderer.get(); myOwnHelper();".to_string()),
    ];
    assert_eq!(
      missing_names(&scripts, &before, &after),
      vec![ScriptNames { module: "shops".into(), names: vec!["getEntryMediaUrl".into()] }]
    );
  }

  #[test]
  fn comments_dont_count_as_names_a_script_uses() {
    let used = names_used("/* Renderer.old */\n// Legacy.call()\nconst a = b.current; // tail Note");
    assert_eq!(used.into_iter().collect::<Vec<_>>(), vec!["current".to_string()]);
  }
}
