//! Publishing the prepared site to deploy folders (via robocopy on Windows and
//! rsync on Linux/macOS), running user deploy scripts with the purge list,
//! pricing deployed homebrew, and recording prepare/publish releases.

use crate::config::{load_dotenv_vars, slash_path, update_raw_config, ResolvedPaths};
use crate::deploy_scripts::{script_path, scripts_dir, DeployScriptEntry};
use crate::item_prices;
use crate::modules::{changed_files, DeployModule};
use crate::pipeline::{mtime_secs, Logger, PrepareOutcome};
use crate::process;
use crate::repos::{git_capture, package_version, repo_dir_for, REPO_IDS};
use crate::run_history::{
  get_last_deploy_run, load_last_prepare, store_last_prepare, store_last_run, DeployImageRepo,
  LastDeployRun, LastPrepare,
};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;

const EXCLUDE_DIRS: &[&str] = &[
  ".git",
  ".github",
  "node_modules",
  "scss",
  "node",
  "node_",
  "trash",
  "trash_in",
  "scratch",
  ".claude",
  ".cursor",
  ".vscode",
  ".idea",
  "unused",
  "drafts",
  "Logs",
];

const EXCLUDE_FILES: &[&str] = &[
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  "package.json",
  "package-lock.json",
  "eslint.config.mjs",
  ".prettierrc.js",
  ".stylelintrc.json",
  ".editorconfig",
  ".dockerignore",
  ".node-version",
  ".npmrc",
];

/// Mirror the site to every listed folder. True when at least one deploy ran.
fn deploy_site_inner(
  source_dir: &Path,
  targets: &[String],
  images: &[DeployImageRepo],
  dry_run: bool,
  logger: &mut Logger,
) -> Result<bool, String> {
  if targets.is_empty() {
    logger.warn("No site deploy folders set (Settings → Deploy site to) — skipping deploy.");
    return Ok(false);
  }
  let mut any = false;
  for target in targets {
    any |= deploy_to_nas_inner(source_dir, target, images, dry_run, logger)?;
  }
  Ok(any)
}

/// The mirror mustn't touch the image folders: /MIR would delete anything the
/// deploy folder has that this checkout doesn't. /XD takes full source paths, as
/// a bare `img` would also skip folders like css/img. A repo kept in the site
/// under another name is left out too, so it isn't published twice.
#[cfg(target_os = "windows")]
fn mirror_exclusions(source_dir: &Path, images: &[DeployImageRepo]) -> Vec<String> {
  let mut out = Vec::new();
  for image in images {
    out.push(source_dir.join(&image.folder));
    let repo = Path::new(&image.path);
    if repo.starts_with(source_dir) {
      out.push(repo.to_path_buf());
    }
  }
  out.iter().map(|p| p.to_string_lossy().replace('/', "\\")).collect()
}

/// Build `rsync` arguments for mirroring `source_dir` into `target_dir`.
/// Root-anchors image folder exclusions (`--exclude=/img/`) so nested folders
/// like `css/img/` are still mirrored.
#[cfg_attr(target_os = "windows", allow(dead_code))]
pub(crate) fn rsync_mirror_args(
  source_dir: &Path,
  target_dir: &Path,
  images: &[DeployImageRepo],
  dry_run: bool,
) -> Vec<String> {
  let mut args = vec![
    "-a".to_string(),
    "--delete-delay".to_string(),
    "--delay-updates".to_string(),
    "--itemize-changes".to_string(),
  ];
  if dry_run {
    args.push("-n".to_string());
  }
  for d in EXCLUDE_DIRS {
    args.push(format!("--exclude={d}/"));
  }
  for f in EXCLUDE_FILES {
    args.push(format!("--exclude={f}"));
  }
  for image in images {
    let folder = image.folder.trim_matches('/');
    if !folder.is_empty() {
      let arg = format!("--exclude=/{folder}/");
      if !args.contains(&arg) {
        args.push(arg);
      }
    }
    if let Ok(rel) = Path::new(&image.path).strip_prefix(source_dir) {
      let rel_str = slash_path(rel);
      let rel_trimmed = rel_str.trim_matches('/');
      if !rel_trimmed.is_empty() {
        let arg = format!("--exclude=/{rel_trimmed}/");
        if !args.contains(&arg) {
          args.push(arg);
        }
      }
    }
  }
  let src = slash_path(source_dir);
  args.push(format!("{}/", src.trim_end_matches('/')));
  args.push(slash_path(target_dir));
  args
}

/// Build `rsync` arguments for add-only copying an image repo into `dest_dir` (never passes `--delete`).
#[cfg_attr(target_os = "windows", allow(dead_code))]
pub(crate) fn rsync_add_images_args(
  image_path: &Path,
  dest_dir: &Path,
  dry_run: bool,
) -> Vec<String> {
  let mut args = vec!["-a".to_string(), "--itemize-changes".to_string()];
  if dry_run {
    args.push("-n".to_string());
  }
  args.push("--exclude=.git/".to_string());
  let src = slash_path(image_path);
  args.push(format!("{}/", src.trim_end_matches('/')));
  args.push(slash_path(dest_dir));
  args
}

/// Run `rsync`, streaming its output lines into the logger.
#[cfg(not(target_os = "windows"))]
fn run_rsync(args: &[String], logger: &mut Logger) -> Result<(), String> {
  let mut cmd = process::cmd("rsync");
  cmd
    .args(args)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  let mut child = cmd.spawn().map_err(|e| format!("Failed to run rsync: {e}"))?;
  let stderr = child.stderr.take().map(|err| {
    std::thread::spawn(move || {
      BufReader::new(err)
        .split(b'\n')
        .map_while(Result::ok)
        .map(|l| String::from_utf8_lossy(&l).trim_end().to_string())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
    })
  });
  if let Some(out) = child.stdout.take() {
    for line in BufReader::new(out).split(b'\n').map_while(Result::ok) {
      let line = String::from_utf8_lossy(&line);
      let trimmed = line.trim();
      if !trimmed.is_empty() {
        logger.info(format!("  {trimmed}"));
      }
    }
  }
  let status = child.wait().map_err(|e| e.to_string())?;
  let err_lines = stderr.and_then(|h| h.join().ok()).unwrap_or_default();
  if !status.success() {
    let detail = if err_lines.is_empty() {
      format!("exit code {}", status.code().unwrap_or(1))
    } else {
      err_lines.join(" | ")
    };
    return Err(format!("rsync failed: {detail}"));
  }
  Ok(())
}

/// Run robocopy, streaming its non-separator stdout lines into the log, and
/// return its exit code (robocopy uses 0..=7 for success, >= 8 for errors).
#[cfg(target_os = "windows")]
fn run_robocopy(
  source: &Path,
  dest: &Path,
  flags: &[&str],
  extra_xd: &[String],
  logger: &mut Logger,
) -> Result<i32, String> {
  let mut cmd = process::cmd("robocopy");
  cmd.arg(source).arg(dest).args(flags);
  cmd.arg("/XD").args(EXCLUDE_DIRS).args(extra_xd);
  cmd.arg("/XF").args(EXCLUDE_FILES);
  cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
  let mut child = cmd.spawn().map_err(|e| format!("Failed to run robocopy: {e}"))?;
  if let Some(out) = child.stdout.take() {
    for line in BufReader::new(out).split(b'\n').map_while(Result::ok) {
      let line = String::from_utf8_lossy(&line);
      let trimmed = line.trim();
      if !trimmed.is_empty() && !trimmed.starts_with("-----") {
        logger.info(format!("  {trimmed}"));
      }
    }
  }
  Ok(child.wait().map_err(|e| e.to_string())?.code().unwrap_or(16))
}

/// Copy one image repo into its folder, on request: a walk of the whole share is
/// too slow to sit in every deploy. /E with no /MIR or /PURGE only ever adds. Each
/// copied file is logged as it lands, so a long copy shows its progress.
pub(crate) fn add_images(
  image: &DeployImageRepo,
  target_dir: &str,
  dry_run: bool,
  logger: &mut Logger,
) -> Result<(), String> {
  #[cfg(not(target_os = "windows"))]
  {
    logger.info(format!("{} -> {target_dir}/{} (only adds)", image.path, image.folder));
    let dest = Path::new(target_dir).join(&image.folder);
    if !dry_run {
      fs::create_dir_all(&dest).map_err(|e| format!("Could not create {}: {e}", dest.display()))?;
    }
    let args = rsync_add_images_args(Path::new(&image.path), &dest, dry_run);
    run_rsync(&args, logger)
  }

  #[cfg(target_os = "windows")]
  {
    logger.info(format!("{} -> {target_dir}/{} (only adds)", image.path, image.folder));
    let mut flags = vec!["/E", "/FFT", "/Z", "/R:2", "/W:2", "/NDL", "/NP", "/NJH"];
    if dry_run {
      flags.push("/L");
    }
    let dest = Path::new(target_dir).join(&image.folder);
    let code = run_robocopy(Path::new(&image.path), &dest, &flags, &[], logger)?;
    if code >= 8 {
      return Err(format!("robocopy failed copying {} with exit code {code}", image.title));
    }
    Ok(())
  }
}

fn deploy_to_nas_inner(
  source_dir: &Path,
  target_dir: &str,
  images: &[DeployImageRepo],
  dry_run: bool,
  logger: &mut Logger,
) -> Result<bool, String> {
  if target_dir.trim().is_empty() {
    logger.warn("DEPLOY_TARGET not configured — skipping NAS deploy.");
    return Ok(false);
  }

  #[cfg(not(target_os = "windows"))]
  {
    logger.info(format!(
      "{} {} -> {}",
      if dry_run { "[dry-run] Comparing" } else { "Mirroring" },
      source_dir.display(),
      target_dir
    ));
    let dest = Path::new(target_dir);
    if !dry_run {
      fs::create_dir_all(dest).map_err(|e| format!("Could not create {}: {e}", dest.display()))?;
    }
    let args = rsync_mirror_args(source_dir, dest, images, dry_run);
    run_rsync(&args, logger)?;
    logger.info(if dry_run {
      "NAS dry-run comparison complete."
    } else {
      "NAS mirror deploy complete."
    });
    return Ok(true);
  }

  #[cfg(target_os = "windows")]
  {
    logger.info(format!(
      "{} {} -> {}",
      if dry_run { "[dry-run] Comparing" } else { "Mirroring" },
      source_dir.display(),
      target_dir
    ));

    let flags = [
      "/MIR",
      "/FFT",
      "/Z",
      "/R:2",
      "/W:2",
      "/NDL",
      "/NP",
      if dry_run { "/L" } else { "/NFL" },
    ];
    let extra_xd = mirror_exclusions(source_dir, images);
    let code = run_robocopy(source_dir, Path::new(target_dir), &flags, &extra_xd, logger)?;
    if code >= 8 {
      return Err(format!("robocopy failed with exit code {code}"));
    }
    logger.info(if dry_run {
      "NAS dry-run comparison complete."
    } else {
      "NAS mirror deploy complete."
    });
    Ok(true)
  }
}

/// Command candidates for a script kind, best first.
fn script_programs(kind: &str) -> Vec<(&'static str, Vec<&'static str>)> {
  match kind {
    "powershell" => {
      let args = vec!["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"];
      let mut out = vec![("pwsh", args.clone())];
      if cfg!(target_os = "windows") {
        out.push(("powershell", args));
      }
      out
    }
    "shell" => vec![("sh", vec![])],
    "node" => vec![("node", vec![])],
    _ => vec![],
  }
}

/// Everything a deploy script is told about the run, as environment variables.
pub(crate) struct ScriptEnv {
  site_dir: PathBuf,
  deploy_folders: Vec<String>,
  changed_files: Vec<String>,
  /// From the `.env` files, for anything the environment doesn't already set.
  dotenv: HashMap<String, String>,
}

fn now_secs() -> u64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0)
}

/// Every checkout's full commit, so a later run can compare with or return to it.
fn repo_commits(paths: &ResolvedPaths) -> BTreeMap<String, String> {
  REPO_IDS
    .iter()
    .filter_map(|id| {
      let (_, dir) = repo_dir_for(paths, id)?;
      if !dir.join(".git").exists() {
        return None;
      }
      Some((id.to_string(), git_capture(dir, &["rev-parse", "HEAD"])?))
    })
    .collect()
}

/// A failure here warns: Prepare's own work is already done.
pub(crate) fn record_prepare(
  paths: &ResolvedPaths,
  ok: bool,
  outcome: &PrepareOutcome,
  warnings: &[String],
  logger: &mut Logger,
) {
  let record = LastPrepare {
    at: now_secs(),
    ok,
    site_version: package_version(&paths.repo_5e),
    commits: repo_commits(paths),
    warnings: warnings.to_vec(),
    blocked_sources: outcome.blocked.clone(),
    modules: outcome.modules.clone(),
  };
  if let Err(e) = update_raw_config(|config| {
    store_last_prepare(config, &record);
    Ok(())
  }) {
    logger.warn(format!("Couldn't save the prepare record: {e}"));
  }
}

/// A failure here warns: the deploy itself has already succeeded. The module
/// checks come from the Prepare being published, when it's the one on disk.
pub(crate) fn record_last_run(paths: &ResolvedPaths, logger: &mut Logger) {
  let commits = repo_commits(paths);
  let site_version = package_version(&paths.repo_5e);
  if let Err(e) = update_raw_config(|config| {
    let modules = load_last_prepare(config)
      .filter(|p| p.commits.get("5e") == commits.get("5e"))
      .map(|p| p.modules)
      .unwrap_or_default();
    let run = LastDeployRun {
      at: now_secs(),
      site_version,
      commits,
      modules,
    };
    store_last_run(config, &run);
    Ok(())
  }) {
    logger.warn(format!("Couldn't save the last successful run: {e}"));
  }
}

/// A site path the mirror copies, so a cache purge should cover it.
fn is_published(rel: &str) -> bool {
  let name = rel.rsplit('/').next().unwrap_or(rel);
  if EXCLUDE_FILES.contains(&name) {
    return false;
  }
  match rel.split_once('/') {
    Some((first, _)) => !EXCLUDE_DIRS.contains(&first),
    None => !name.starts_with('.'),
  }
}

/// Turns `*.ext` and `dir/*.ext` entries into the site files they name, since
/// a purge script needs real paths. Folders aren't searched below that level.
fn expand_globs(site_dir: &Path, files: Vec<String>) -> Vec<String> {
  let mut out = BTreeSet::new();
  for file in files {
    let (dir, name) = file.rsplit_once('/').unwrap_or(("", &file));
    let Some(suffix) = name.strip_prefix('*') else {
      out.insert(file.clone());
      continue;
    };
    let Ok(entries) = fs::read_dir(site_dir.join(dir)) else { continue };
    for entry in entries.flatten().filter(|e| e.path().is_file()) {
      let found = entry.file_name().to_string_lossy().to_string();
      if found.ends_with(suffix) {
        out.insert(if dir.is_empty() { found } else { format!("{dir}/{found}") });
      }
    }
  }
  out.into_iter().collect()
}

/// What a cache purge should cover: the build outputs and the files the
/// customizations write, plus everything 5e changed since the last publish and
/// every brew modified since then.
fn release_changed_files(
  modules: &[DeployModule],
  data_dir: &Path,
  site_dir: &Path,
  last: Option<&LastDeployRun>,
  logger: &mut Logger,
) -> Vec<String> {
  let mut set: BTreeSet<String> = expand_globs(site_dir, changed_files(modules, data_dir))
    .into_iter()
    .collect();
  let base = set.len();
  let Some(last) = last else {
    logger.info(format!(
      "No earlier publish recorded: the purge list is the {base} file(s) the build and customizations write."
    ));
    return set.into_iter().collect();
  };

  let mut upstream = 0usize;
  match last.commits.get("5e") {
    Some(from) => match git_capture(site_dir, &["diff", "--name-only", from, "HEAD"]) {
      Some(out) => {
        for rel in out.lines().map(str::trim).filter(|l| !l.is_empty()) {
          if is_published(rel) && site_dir.join(rel).is_file() && set.insert(rel.to_string()) {
            upstream += 1;
          }
        }
      }
      None => logger.warn(format!(
        "Couldn't diff 5e against the published commit {from}; its changed files are left out of the purge list."
      )),
    },
    None => logger.info(
      "The last publish didn't record a 5e commit; files 5etools changed are left out of the purge list.",
    ),
  }

  let mut brews = 0usize;
  if let Ok(entries) = fs::read_dir(site_dir.join("homebrew")) {
    for entry in entries.flatten() {
      let name = entry.file_name().to_string_lossy().to_string();
      let changed = name.ends_with(".json") && entry.path().is_file() && mtime_secs(&entry.path()) > last.at;
      if changed && set.insert(format!("homebrew/{name}")) {
        brews += 1;
      }
    }
  }
  logger.info(format!(
    "Purge list: {} file(s): {base} from the build and customizations, {upstream} changed in 5e, {brews} brew(s) changed since the last publish.",
    set.len()
  ));
  set.into_iter().collect()
}

/// Run one deploy script, streaming its output into the log. A dry run only
/// names it: a script can do anything, so it never runs without the real thing.
pub(crate) fn run_deploy_script(
  script: &DeployScriptEntry,
  dir: &Path,
  env_vars: &ScriptEnv,
  dry_run: bool,
  logger: &mut Logger,
) -> Result<(), String> {
  let path = script_path(dir, script);
  if !path.exists() {
    return Err(format!("{}: script file missing ({})", script.title, slash_path(&path)));
  }
  if dry_run {
    logger.info(format!("[dry-run] Would run {} ({})", script.title, slash_path(&path)));
    return Ok(());
  }

  let mut spawned = None;
  for (program, args) in script_programs(&script.kind) {
    let mut cmd = process::cmd(program);
    cmd
      .args(&args)
      .arg(&path)
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());
    if env_vars.site_dir.is_dir() {
      cmd.current_dir(&env_vars.site_dir);
    }
    for (k, v) in &env_vars.dotenv {
      if env::var_os(k).is_none() {
        cmd.env(k, v);
      }
    }
    cmd
      .env("HBM_SITE_DIR", &env_vars.site_dir)
      .env("HBM_DEPLOY_FOLDERS", env_vars.deploy_folders.join("\n"))
      .env("HBM_CHANGED_FILES", env_vars.changed_files.join("\n"));
    match cmd.spawn() {
      Ok(child) => {
        spawned = Some(child);
        break;
      }
      // pwsh isn't everywhere; Windows PowerShell is the fallback.
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
      Err(e) => return Err(format!("Couldn't start {}: {e}", script.title)),
    }
  }
  let Some(mut child) = spawned else {
    return Err(format!(
      "Couldn't start {}: no {} interpreter found on PATH",
      script.title, script.kind
    ));
  };

  // stderr drains on its own thread so a chatty script can't block on a full pipe.
  let stderr = child.stderr.take().map(|err| {
    std::thread::spawn(move || {
      BufReader::new(err)
        .split(b'\n')
        .map_while(Result::ok)
        .map(|line| String::from_utf8_lossy(&line).trim_end().to_string())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
    })
  });
  if let Some(out) = child.stdout.take() {
    for line in BufReader::new(out).split(b'\n').map_while(Result::ok) {
      let line = String::from_utf8_lossy(&line).trim_end().to_string();
      if !line.is_empty() {
        logger.info(format!("  {line}"));
      }
    }
  }
  let status = child.wait().map_err(|e| e.to_string())?;
  for line in stderr.and_then(|h| h.join().ok()).unwrap_or_default() {
    logger.warn(format!("  {line}"));
  }
  if !status.success() {
    return Err(format!(
      "{} exited with code {}",
      script.title,
      status.code().map_or("unknown".to_string(), |c| c.to_string())
    ));
  }
  logger.info(format!("{} finished.", script.title));
  Ok(())
}

fn run_deploy_scripts(
  scripts: &[DeployScriptEntry],
  env_vars: &ScriptEnv,
  dry_run: bool,
  logger: &mut Logger,
) -> Result<(), String> {
  let dir = scripts_dir();
  for script in scripts.iter().filter(|s| s.enabled) {
    logger.step(&format!("Running {}", script.title));
    run_deploy_script(script, &dir, env_vars, dry_run, logger)?;
  }
  Ok(())
}

/// The checkout's homebrew/ is the user's own folder, so Prepare leaves it
/// alone and the mirror copies it unpriced; price the deployed copies instead.
/// A failure is only a warning: the site is up, just missing some prices.
fn price_deployed_homebrew(paths: &ResolvedPaths, modules: &[DeployModule], logger: &mut Logger) {
  let Some((source, _)) = item_prices::module_price_list(modules, &paths.data_dir) else { return };
  let table = match item_prices::PriceTable::load(&source) {
    Ok(t) if !t.is_empty() => t,
    Ok(_) => return,
    Err(e) => return logger.warn(format!("Item prices: {e}")),
  };
  for folder in &paths.site_deploy_folders {
    let (files, items, errors) = item_prices::price_homebrew_dir(&Path::new(folder).join("homebrew"), &table);
    if files > 0 {
      logger.info(format!("Priced {items} homebrew item(s) in {files} file(s) in {folder}"));
    }
    for e in errors {
      logger.warn(format!("Item prices: {e}"));
    }
  }
}

pub(crate) fn script_env(paths: &ResolvedPaths, modules: &[DeployModule], logger: &mut Logger) -> ScriptEnv {
  let last = get_last_deploy_run();
  ScriptEnv {
    site_dir: paths.repo_5e.clone(),
    deploy_folders: paths.site_deploy_folders.clone(),
    changed_files: release_changed_files(modules, &paths.data_dir, &paths.repo_5e, last.as_ref(), logger),
    dotenv: load_dotenv_vars(&paths.data_dir),
  }
}

/// Copies the site to the deploy folders, then runs the user's scripts with
/// the purge list. True when something was published.
pub(crate) fn publish_inner(
  paths: &ResolvedPaths,
  modules: &[DeployModule],
  images: &[DeployImageRepo],
  scripts: &[DeployScriptEntry],
  dry_run: bool,
  logger: &mut Logger,
) -> Result<bool, String> {
  logger.phase("copy");
  logger.step("Copying the Site to the Deploy Folders");
  let deployed = deploy_site_inner(&paths.repo_5e, &paths.site_deploy_folders, images, dry_run, logger)?;
  if deployed && !dry_run {
    price_deployed_homebrew(paths, modules, logger);
  }
  let any_script = scripts.iter().any(|s| s.enabled);
  if any_script {
    logger.phase("scripts");
    let env = script_env(paths, modules, logger);
    run_deploy_scripts(scripts, &env, dry_run, logger)?;
  }
  Ok(deployed || (any_script && !dry_run))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::repos::git_run;
  use crate::test_util::{temp_dir, TempDir};

  fn commit_all(root: &Path, msg: &str) -> String {
    git_run(root, &["add", "-A"]).unwrap();
    git_run(root, &["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", msg]).unwrap();
    git_capture(root, &["rev-parse", "HEAD"]).unwrap()
  }

  fn git_site(name: &str) -> TempDir {
    let root = temp_dir(name);
    fs::create_dir_all(root.join("js")).unwrap();
    fs::write(root.join("js/navigation.js"), "NavBar._addElement_li({});\n").unwrap();
    git_run(&root, &["init", "--quiet"]).unwrap();
    commit_all(&root, "site");
    root
  }

  #[test]
  fn rsync_mirror_args_root_anchor_image_folders_and_include_custom_in_repo_image_paths() {
    let site = Path::new("/data/repos/5e");
    let target = Path::new("/data/site");
    let images = [
      DeployImageRepo {
        id: "site".into(),
        title: "Site images".into(),
        folder: "img".into(),
        path: "/data/repos/5e-img".into(),
        downloaded: true,
      },
      DeployImageRepo {
        id: "homebrew".into(),
        title: "Homebrew images".into(),
        folder: "homebrew-img".into(),
        path: "/data/repos/5e/custom-hb-img".into(),
        downloaded: true,
      },
    ];
    let args = rsync_mirror_args(site, target, &images, false);
    assert!(args.contains(&"--delete-delay".to_string()));
    assert!(args.contains(&"--delay-updates".to_string()));
    assert!(!args.contains(&"-n".to_string()));
    // Root-anchored so nested `css/img/` is NOT excluded.
    assert!(args.contains(&"--exclude=/img/".to_string()), "{args:?}");
    assert!(!args.contains(&"--exclude=img/".to_string()), "{args:?}");
    assert!(args.contains(&"--exclude=/homebrew-img/".to_string()), "{args:?}");
    assert!(args.contains(&"--exclude=/custom-hb-img/".to_string()), "{args:?}");
    assert_eq!(args.last().map(String::as_str), Some("/data/site"));
    assert_eq!(args[args.len() - 2], "/data/repos/5e/");

    let dry_args = rsync_mirror_args(site, target, &images, true);
    assert!(dry_args.contains(&"-n".to_string()));
  }

  #[test]
  fn rsync_add_images_args_never_pass_delete_flags() {
    let args = rsync_add_images_args(Path::new("/data/repos/5e-img"), Path::new("/data/site/img"), false);
    assert!(!args.iter().any(|a| a.contains("delete")), "{args:?}");
    assert!(args.contains(&"--exclude=.git/".to_string()));
    assert_eq!(args[args.len() - 2], "/data/repos/5e-img/");
    assert_eq!(args[args.len() - 1], "/data/site/img");
  }

  #[cfg(target_os = "windows")]
  #[test]
  fn a_deploy_leaves_the_image_folders_alone_until_asked_to_copy() {
    let site = temp_dir("deploy-site");
    let target = temp_dir("deploy-target");
    let put = |root: &Path, rel: &str| {
      let path = root.join(rel);
      fs::create_dir_all(path.parent().unwrap()).unwrap();
      fs::write(path, "x").unwrap();
    };
    for rel in ["index.html", "css/img/new.png", "img/new.png", "homebrew-img/img/new.png"] {
      put(&site, rel);
    }
    for rel in ["stale.html", "css/img/old.png", "img/old.png", "homebrew-img/img/old.png"] {
      put(&target, rel);
    }
    let repo = |id: &str, folder: &str| DeployImageRepo {
      id: id.into(),
      title: id.into(),
      folder: folder.into(),
      path: slash_path(&site.join(folder)),
      downloaded: true,
    };
    let images = [repo("site", "img"), repo("homebrew", "homebrew-img")];
    let target_dir = slash_path(&target);

    assert!(deploy_to_nas_inner(&site, &target_dir, &images, false, &mut Logger::new(None)).unwrap());

    let has = |rel: &str| target.join(rel).exists();
    // The rest of the site still mirrors, including a nested folder named img.
    assert!(has("index.html") && !has("stale.html"));
    assert!(has("css/img/new.png") && !has("css/img/old.png"));
    // The deploy neither deletes from the image folders nor copies into them.
    assert!(has("img/old.png") && !has("img/new.png"));
    assert!(has("homebrew-img/img/old.png") && !has("homebrew-img/img/new.png"));

    // The manual copy adds to just the one folder, and logs what it copied.
    let mut logger = Logger::new(None);
    add_images(&images[0], &target_dir, false, &mut logger).unwrap();
    assert!(has("img/old.png") && has("img/new.png"));
    assert!(!has("homebrew-img/img/new.png"));
    assert!(logger.logs.iter().any(|l| l.message.contains("new.png")));
  }

  // Needs PowerShell, which every Windows machine has.
  #[test]
  #[cfg(target_os = "windows")]
  fn a_deploy_script_gets_the_run_details_and_fails_the_run_on_a_bad_exit() {
    let dir = temp_dir("scripts");
    let script = |id: &str, body: &str| {
      let entry = DeployScriptEntry { id: id.into(), title: id.into(), kind: "powershell".into(), enabled: true };
      fs::write(script_path(&dir, &entry), body).unwrap();
      entry
    };
    let env_vars = ScriptEnv {
      site_dir: dir.to_path_buf(),
      deploy_folders: vec!["W:/5e".into()],
      changed_files: vec!["css/main.css".into(), "sw.js".into()],
      dotenv: HashMap::from([("HBM_TEST_TOKEN".to_string(), "from-dotenv".to_string())]),
    };

    let ok = script(
      "ok",
      "Write-Output \"files=$($env:HBM_CHANGED_FILES -split \"`n\" -join ',')\"\nWrite-Output \"token=$env:HBM_TEST_TOKEN\"",
    );
    let mut logger = Logger::new(None);
    run_deploy_script(&ok, &dir, &env_vars, false, &mut logger).unwrap();
    let lines: Vec<&str> = logger.logs.iter().map(|l| l.message.as_str()).collect();
    assert!(lines.contains(&"  files=css/main.css,sw.js"), "{lines:?}");
    assert!(lines.contains(&"  token=from-dotenv"), "{lines:?}");

    let bad = script("bad", "Write-Error 'nope'\nexit 3");
    let mut logger = Logger::new(None);
    let err = run_deploy_script(&bad, &dir, &env_vars, false, &mut logger).unwrap_err();
    assert!(err.contains("exited with code 3"), "{err}");
    assert!(!logger.warnings.is_empty());

    // A dry run never executes the script.
    let mut logger = Logger::new(None);
    run_deploy_script(&bad, &dir, &env_vars, true, &mut logger).unwrap();
  }

  #[test]
  fn the_purge_list_adds_what_5e_and_the_brews_changed_since_the_publish() {
    let root = git_site("purge");
    let published = git_capture(&root, &["rev-parse", "HEAD"]).unwrap();
    fs::create_dir_all(root.join("data")).unwrap();
    fs::create_dir_all(root.join("node")).unwrap();
    fs::write(root.join("data/spells.json"), "{}").unwrap();
    fs::write(root.join("node/build.mjs"), "").unwrap();
    fs::write(root.join("package.json"), "{}").unwrap();
    commit_all(&root, "release");
    fs::create_dir_all(root.join("homebrew")).unwrap();
    fs::write(root.join("homebrew/New Brew.json"), "{}").unwrap();

    let last = LastDeployRun {
      at: 1,
      site_version: None,
      commits: BTreeMap::from([("5e".to_string(), published)]),
      modules: Vec::new(),
    };
    let list = release_changed_files(&[], Path::new(""), &root, Some(&last), &mut Logger::new(None));
    assert!(list.contains(&"data/spells.json".to_string()), "{list:?}");
    assert!(list.contains(&"homebrew/New Brew.json".to_string()), "{list:?}");
    assert!(list.contains(&"sw.js".to_string()));
    // Build inputs and package files never reach the deploy folders.
    assert!(!list.iter().any(|f| f.starts_with("node/") || f == "package.json"), "{list:?}");
  }

  #[test]
  fn without_a_recorded_publish_the_purge_list_is_the_build_outputs() {
    let root = git_site("purge-first");
    let list = release_changed_files(&[], Path::new(""), &root, None, &mut Logger::new(None));
    assert_eq!(list, changed_files(&[], Path::new("")));
  }

  #[test]
  fn purge_globs_expand_to_the_site_files() {
    let root = temp_dir("purge-glob");
    fs::create_dir_all(root.join("js")).unwrap();
    for f in ["a.html", "b.html", "js/c.js", "js/d.html"] {
      fs::write(root.join(f), "x").unwrap();
    }
    let got = expand_globs(&root, vec!["*.html".into(), "js/c.js".into()]);
    assert_eq!(got, vec!["a.html", "b.html", "js/c.js"]);
  }
}
