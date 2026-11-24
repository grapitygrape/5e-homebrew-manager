//! Applies customization modules to a 5e checkout: file copies, item price
//! rewrites, git diffs, npm scripts, text patches (via `patch_ops`), module
//! builds, git target restoration, module CSS injection, and dry-run checks.

use crate::config::{read_raw_config, resolve_paths, slash_path};
use crate::item_prices;
use crate::modules::{
  diff_files, load_modules, modules_dir, option_allows, resolve_source, DeployModule, ModuleCheck,
  ModuleEntry,
};
use crate::patch_ops::{apply_patch_specs, PatchLog};
use crate::pipeline::Logger;
use crate::process;
use crate::repos::{git_capture, git_cmd, git_run};
use serde_json::{Map, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

const CSS_MARKER: &str = "/* HBM Custom Styles */";
const NPM_STAMP_REL: &str = "node_modules/.hbm-npm-stamp";

#[derive(Debug, Clone)]
struct ManifestEntryCheck {
  description: String,
  status: String, // "applied" | "ready" | "skipped" | "error"
  details: Vec<String>,
}

/// Where one module's entries resolve their files and options.
struct EntryContext<'a> {
  /// The 5e checkout the entries change.
  root_dir: &'a Path,
  module_dir: &'a Path,
  data_dir: &'a Path,
  values: &'a Map<String, Value>,
}

/// Deterministic 64-bit FNV-1a hash for stamping `package-lock.json` without extra crates.
fn fnv1a_64(bytes: &[u8]) -> u64 {
  let mut h: u64 = 0xcbf2_9ce4_8422_2325;
  for &b in bytes {
    h ^= u64::from(b);
    h = h.wrapping_mul(0x0000_0100_0000_01b3);
  }
  h
}

/// Expected `.hbm-npm-stamp` contents for `root_dir`, or `None` if there is no `package-lock.json`.
fn expected_npm_stamp(root_dir: &Path) -> Option<String> {
  let lock = fs::read(root_dir.join("package-lock.json")).ok()?;
  Some(format!(
    "{}-{}:{:016x}:{}",
    std::env::consts::OS,
    std::env::consts::ARCH,
    fnv1a_64(&lock),
    lock.len()
  ))
}

/// Ensures `root_dir/node_modules` matches the current OS/arch and `package-lock.json`.
/// Runs `npm ci --no-audit --no-fund` only when the stamp is missing or mismatched
/// (fresh clone, upstream dependency update, or checkout copied across OSes).
pub(crate) fn ensure_node_modules(root_dir: &Path, logger: &mut Logger) -> Result<(), String> {
  let Some(expected) = expected_npm_stamp(root_dir) else {
    return Ok(());
  };
  let stamp_path = root_dir.join(NPM_STAMP_REL);
  if root_dir.join("node_modules").is_dir()
    && fs::read_to_string(&stamp_path).ok().as_deref().map(str::trim) == Some(expected.as_str())
  {
    return Ok(());
  }
  logger.info("Installing 5e node_modules (`npm ci --no-audit --no-fund`)...");
  let mut cmd = process::cmd(if cfg!(windows) { "npm.cmd" } else { "npm" });
  cmd.current_dir(root_dir).args(["ci", "--no-audit", "--no-fund"]);
  let output = cmd.output().map_err(|e| format!("Failed to run npm ci: {e}"))?;
  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let tail: Vec<&str> = stderr.lines().filter(|l| !l.trim().is_empty()).rev().take(5).collect();
    return Err(format!("npm ci failed: {}", tail.into_iter().rev().collect::<Vec<_>>().join(" | ")));
  }
  if let Some(parent) = stamp_path.parent() {
    let _ = fs::create_dir_all(parent);
  }
  let _ = fs::write(&stamp_path, format!("{expected}\n"));
  Ok(())
}

/// Apply one module's typed entries (`copy`, `prices`, `diff`, `npm`, `patch`).
fn apply_entries(
  ctx: &EntryContext,
  entries: &[ModuleEntry],
  dry_run: bool,
  logger: &mut Logger,
) -> Result<(usize, Vec<String>, Vec<ManifestEntryCheck>), String> {
  let root_dir = ctx.root_dir;
  let mut applied_count = 0usize;
  let mut skipped_list = Vec::new();
  let mut checks = Vec::with_capacity(entries.len());

  let active: Vec<&ModuleEntry> = entries
    .iter()
    .filter(|e| !e.is_disabled() && option_allows(e.option(), ctx.values))
    .collect();

  let mut idx = 0usize;
  while idx < active.len() {
    let entry = active[idx];

    // Batch consecutive `parallel: true` npm entries so independent builds (e.g.
    // `gen:pages` + `build:css`) overlap instead of running back-to-back.
    if let ModuleEntry::Npm { parallel: true, .. } = entry {
      let mut batch: Vec<(&str, &str)> = Vec::new();
      while let Some(ModuleEntry::Npm { description, script, parallel: true, .. }) = active.get(idx) {
        batch.push((description.as_str(), script.as_str()));
        idx += 1;
      }
      if dry_run {
        for (description, script) in batch {
          logger.info(format!("[dry-run] Would run npm run {script}"));
          checks.push(ManifestEntryCheck {
            description: description.to_string(),
            status: "ready".into(),
            details: Vec::new(),
          });
        }
        continue;
      }
      ensure_node_modules(root_dir, logger)?;
      if batch.len() == 1 {
        let (description, script) = batch[0];
        logger.info(format!("Running npm run {script}..."));
        if let Err(msg) = run_npm(root_dir, script, &[]) {
          logger.error(&msg);
          checks.push(ManifestEntryCheck {
            description: description.to_string(),
            status: "error".into(),
            details: vec![msg.clone()],
          });
          return Err(msg);
        }
        applied_count += 1;
        checks.push(ManifestEntryCheck {
          description: description.to_string(),
          status: "applied".into(),
          details: Vec::new(),
        });
      } else {
        let names = batch.iter().map(|(_, s)| format!("npm run {s}")).collect::<Vec<_>>().join(" & ");
        logger.info(format!("Running {names} in parallel..."));
        let results: Vec<Result<(), String>> = std::thread::scope(|scope| {
          let handles: Vec<_> = batch
            .iter()
            .map(|(_, script)| {
              let script = *script;
              scope.spawn(move || run_npm(root_dir, script, &[]))
            })
            .collect();
          handles
            .into_iter()
            .map(|h| h.join().unwrap_or_else(|_| Err("npm worker thread panicked".to_string())))
            .collect()
        });
        let mut first_err: Option<String> = None;
        for ((description, _), res) in batch.into_iter().zip(results) {
          match res {
            Ok(()) => {
              applied_count += 1;
              checks.push(ManifestEntryCheck {
                description: description.to_string(),
                status: "applied".into(),
                details: Vec::new(),
              });
            }
            Err(msg) => {
              logger.error(&msg);
              checks.push(ManifestEntryCheck {
                description: description.to_string(),
                status: "error".into(),
                details: vec![msg.clone()],
              });
              if first_err.is_none() {
                first_err = Some(msg);
              }
            }
          }
        }
        if let Some(err) = first_err {
          return Err(err);
        }
      }
      continue;
    }

    idx += 1;
    match entry {
      ModuleEntry::Copy {
        description,
        source,
        target,
        if_exists,
        ..
      } => {
        let abs_source = resolve_source(source, ctx.module_dir, ctx.data_dir, ctx.values)
          .filter(|p| p.exists());
        let abs_target = root_dir.join(target);
        let Some(abs_source) = abs_source else {
          // `ifExists` sources are optional (nothing saved yet, no checkout), so
          // their absence is the normal case and stays out of the warnings.
          let msg = format!("Nothing to copy for {description}: {source} not found");
          if *if_exists {
            logger.info(&msg);
            checks.push(ManifestEntryCheck {
              description: description.clone(),
              status: "skipped".into(),
              details: vec![msg],
            });
          } else {
            logger.error(&msg);
            checks.push(ManifestEntryCheck {
              description: description.clone(),
              status: "error".into(),
              details: vec![msg],
            });
          }
          continue;
        };
        if abs_source.is_dir() {
          copy_dir_recursive(&abs_source, &abs_target, dry_run)?;
        } else if !dry_run {
          if let Some(parent) = abs_target.parent() {
            let _ = fs::create_dir_all(parent);
          }
          fs::copy(&abs_source, &abs_target).map_err(|e| e.to_string())?;
        }
        applied_count += 1;
        logger.info(format!(
          "{} {target} <- {}",
          if dry_run { "[dry-run] Would copy" } else { "Copied" },
          slash_path(&abs_source)
        ));
        checks.push(ManifestEntryCheck {
          description: description.clone(),
          status: "applied".into(),
          details: vec![format!("Source: {}", slash_path(&abs_source))],
        });
      }

      ModuleEntry::Prices {
        description,
        source,
        target,
        ..
      } => {
        let abs_target = root_dir.join(target);
        let check = |status: &str, details: Vec<String>| ManifestEntryCheck {
          description: description.clone(),
          status: status.into(),
          details,
        };
        // No price list saved yet is the normal case, like an `ifExists` copy.
        let Some(abs_source) =
          resolve_source(source, ctx.module_dir, ctx.data_dir, ctx.values).filter(|p| p.is_file())
        else {
          let msg = format!("No price list for {description}: {source} not found");
          logger.info(&msg);
          checks.push(check("skipped", vec![msg]));
          continue;
        };
        let priced = item_prices::PriceTable::load(&abs_source).and_then(|table| {
          if dry_run {
            Ok(None)
          } else {
            item_prices::price_file(&abs_target, &table).map(Some)
          }
        });
        match priced {
          Ok(count) => {
            applied_count += 1;
            logger.info(match count {
              Some(n) => format!("Priced {n} item(s) in {target}"),
              None => format!("[dry-run] Would price items in {target}"),
            });
            checks.push(check("applied", vec![format!("Source: {}", slash_path(&abs_source))]));
          }
          Err(e) => {
            logger.error(&e);
            checks.push(check("error", vec![e.clone()]));
            if !dry_run {
              return Err(e);
            }
          }
        }
      }

      ModuleEntry::Diff {
        description,
        source,
        ..
      } => {
        let check = |status: &str, details: Vec<String>| ManifestEntryCheck {
          description: description.clone(),
          status: status.into(),
          details,
        };
        let Some(abs) =
          resolve_source(source, ctx.module_dir, ctx.data_dir, ctx.values).filter(|p| p.is_file())
        else {
          // Unlike an optional copy, a missing patch would publish the site without it.
          let msg = format!("{description}: patch not found at {source}");
          logger.error(&msg);
          checks.push(check("error", vec![msg.clone()]));
          if !dry_run {
            return Err(msg);
          }
          continue;
        };
        let header = fs::read_to_string(&abs)
          .ok()
          .and_then(|t| t.lines().next().map(str::to_string))
          .unwrap_or_default();
        let abs_str = abs.to_string_lossy().to_string();
        // A dry run checks against git's index (the committed text), which the
        // real run's reset restores; the working tree may hold the last run's result.
        let args: Vec<&str> = if dry_run {
          vec!["apply", "--check", "--cached", "--whitespace=nowarn", &abs_str]
        } else {
          vec!["apply", "--whitespace=nowarn", &abs_str]
        };
        let output = git_cmd(root_dir, &args)
          .output()
          .map_err(|e| format!("Failed to spawn git: {e}"))?;
        if output.status.success() {
          applied_count += 1;
          logger.info(format!(
            "{} {description}",
            if dry_run { "[dry-run] Patch applies:" } else { "Applied" }
          ));
          checks.push(check("applied", vec![header]));
          continue;
        }
        let mut details: Vec<String> = String::from_utf8_lossy(&output.stderr)
          .lines()
          .map(str::trim)
          .filter(|l| !l.is_empty())
          .map(String::from)
          .collect();
        details.push(header.clone());
        let msg = format!("{description}: the patch doesn't apply to this 5e. {header}");
        logger.error(&msg);
        checks.push(check("error", details.clone()));
        if !dry_run {
          return Err(format!("{msg}\n{}", details.join("\n")));
        }
      }

      ModuleEntry::Npm {
        description,
        script,
        ..
      } => {
        let check = |status: &str, details: Vec<String>| ManifestEntryCheck {
          description: description.clone(),
          status: status.into(),
          details,
        };
        if dry_run {
          logger.info(format!("[dry-run] Would run npm run {script}"));
          checks.push(check("ready", Vec::new()));
          continue;
        }
        ensure_node_modules(root_dir, logger)?;
        logger.info(format!("Running npm run {script}..."));
        if let Err(msg) = run_npm(root_dir, script, &[]) {
          logger.error(&msg);
          checks.push(check("error", vec![msg.clone()]));
          return Err(msg);
        }
        applied_count += 1;
        checks.push(check("applied", Vec::new()));
      }

      ModuleEntry::Patch {
        description,
        target,
        patches,
        ..
      } => {
        let abs_target = root_dir.join(target);
        // A real run patches files restored from HEAD (see restore_module_targets),
        // so a dry run has to judge that same text, not last run's patched copy.
        let pristine = if dry_run { committed_text(root_dir, target) } else { None };
        let Some(content) = pristine.or_else(|| fs::read_to_string(&abs_target).ok()) else {
          let msg = format!("Target file not found: {target}");
          logger.error(&msg);
          checks.push(ManifestEntryCheck {
            description: description.clone(),
            status: "error".into(),
            details: vec![msg],
          });
          continue;
        };

        let outcome = apply_patch_specs(content, target, patches, ctx.values, dry_run, |insert_file| {
          fs::read_to_string(ctx.module_dir.join(insert_file))
            .map_err(|e| format!("Failed reading insertFile {insert_file}: {e}"))
        })?;

        for log in &outcome.logs {
          match log {
            PatchLog::Warn(m) => logger.warn(m),
            PatchLog::Error(m) => logger.error(m),
          }
        }
        applied_count += outcome.applied;
        skipped_list.extend(outcome.skipped);
        if let Some(err) = outcome.fatal {
          return Err(err);
        }

        if outcome.any_changed && !dry_run {
          fs::write(&abs_target, &outcome.content).map_err(|e| e.to_string())?;
          logger.info(format!("Patched {target} ({description})"));
        } else if outcome.any_changed && dry_run {
          logger.info(format!("[dry-run] Would write patched {target}"));
        }

        checks.push(ManifestEntryCheck {
          description: description.clone(),
          status: outcome.status,
          details: outcome.details,
        });
      }
    }
  }

  Ok((applied_count, skipped_list, checks))
}

/// A file's text as committed, or None when git doesn't track it.
fn committed_text(root_dir: &Path, target: &str) -> Option<String> {
  let spec = format!("HEAD:{target}");
  let output = git_cmd(root_dir, &["show", &spec]).output().ok()?;
  output.status.success().then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// `npm run <script> -- <args>` in `dir`. The error names the script and ends
/// with the last lines npm wrote to stderr.
fn run_npm(dir: &Path, script: &str, args: &[String]) -> Result<(), String> {
  let mut cmd = process::cmd(if cfg!(windows) { "npm.cmd" } else { "npm" });
  cmd.current_dir(dir).args(["run", script]);
  if !args.is_empty() {
    cmd.arg("--").args(args);
  }
  let output = cmd.output().map_err(|e| format!("Failed to run npm run {script}: {e}"))?;
  if output.status.success() {
    return Ok(());
  }
  let stderr = String::from_utf8_lossy(&output.stderr);
  let tail: Vec<&str> = stderr.lines().filter(|l| !l.trim().is_empty()).rev().take(5).collect();
  Err(format!("npm run {script} failed: {}", tail.into_iter().rev().collect::<Vec<_>>().join(" | ")))
}

/// Runs each enabled module's build, such as the Reskin module's export from the
/// customizer, so an apply always uses what's in the source now. Runs before
/// restore_module_targets, which reads the fresh patch for the files it touches.
/// A build folder that isn't here (a portable/container build carrying a pre-built
/// package without `package.json`) leaves the package as it was exported.
pub(crate) fn build_module_packages(
  data_dir: &Path,
  modules: &[DeployModule],
  dry_run: bool,
  logger: &mut Logger,
) -> Result<(), String> {
  for module in modules.iter().filter(|m| m.enabled) {
    let Some(build) = &module.def.build else {
      continue;
    };
    if module.id == "reskin"
      && !data_dir.as_os_str().is_empty()
      && data_dir.join("content/patch-deploy/reskin.patch").is_file()
    {
      logger.info(format!(
        "{}: using override in {}/content/patch-deploy",
        module.def.title,
        slash_path(data_dir)
      ));
      continue;
    }
    let command = std::iter::once(format!("npm run {}", build.script))
      .chain((!build.args.is_empty()).then(|| format!("-- {}", build.args.join(" "))))
      .collect::<Vec<_>>()
      .join(" ");
    let Some(cwd) = resolve_source(&build.cwd, &module.dir, data_dir, &module.values)
      .filter(|p| p.join("package.json").is_file())
    else {
      logger.info(format!("{}: {} isn't here, so the pre-built export is used", module.def.title, build.cwd));
      continue;
    };
    if dry_run {
      logger.info(format!("[dry-run] Would run {command} in {}", slash_path(&cwd)));
      continue;
    }
    let what = if build.description.is_empty() { &module.def.title } else { &build.description };
    logger.info(format!("{what}: running {command} in {}...", slash_path(&cwd)));
    run_npm(&cwd, &build.script, &build.args).map_err(|e| {
      let msg = format!("{}: {e}", module.def.title);
      logger.error(&msg);
      msg
    })?;
  }
  Ok(())
}

/// Every tracked file any module writes, on or off. Patches only add to a file,
/// so without this a link shown again or a renamed label stays as the last run
/// left it until the next full update. css/main.css has its own marker handling.
pub(crate) fn restore_module_targets(
  root_dir: &Path,
  data_dir: &Path,
  modules: &[DeployModule],
  logger: &mut Logger,
) -> Result<(), String> {
  let mut targets: BTreeSet<String> = BTreeSet::new();
  // What an npm script rebuilds: the generated pages and the compiled CSS.
  let mut rebuilt = false;
  for module in modules {
    for entry in &module.def.entries {
      match entry {
        ModuleEntry::Diff { source, .. } => {
          let patch = resolve_source(source, &module.dir, data_dir, &module.values)
            .and_then(|p| fs::read_to_string(p).ok());
          targets.extend(patch.map(|p| diff_files(&p)).unwrap_or_default());
        }
        ModuleEntry::Npm { .. } => rebuilt = true,
        ModuleEntry::Copy { target, .. }
        | ModuleEntry::Prices { target, .. }
        | ModuleEntry::Patch { target, .. } => {
          targets.insert(target.clone());
        }
      }
    }
  }
  let mut restored = 0;
  for target in &targets {
    // Copied folders and files the site doesn't ship aren't git's to restore.
    if git_capture(root_dir, &["ls-files", "--", target]).is_some_and(|out| out.lines().count() == 1) {
      git_run(root_dir, &["checkout", "HEAD", "--", target])?;
      restored += 1;
    }
  }
  if rebuilt {
    for spec in [":(glob)*.html", "css"] {
      let tracked = git_capture(root_dir, &["ls-files", "--", spec]).is_some_and(|out| !out.is_empty());
      if tracked {
        git_run(root_dir, &["checkout", "HEAD", "--", spec])?;
        restored += 1;
      }
    }
  }
  logger.info(format!("Restored {restored} patched file(s) from git before applying"));
  Ok(())
}

fn module_check(id: &str, checks: &[ManifestEntryCheck]) -> ModuleCheck {
  let has = |s: &str| checks.iter().any(|c| c.status == s);
  let status = if has("error") {
    "error"
  } else if has("skipped") {
    "skipped"
  } else {
    "ok"
  };
  let details = checks
    .iter()
    .filter(|c| c.status != "applied")
    .flat_map(|c| c.details.iter().map(move |d| format!("{}: {d}", c.description)))
    .collect();
  ModuleCheck { id: id.to_string(), status: status.to_string(), details }
}

pub(crate) struct ModulesOutcome {
  pub applied: usize,
  pub skipped: Vec<String>,
  pub checks: Vec<ModuleCheck>,
}

/// Every enabled module's entries in module order, then their CSS.
pub(crate) fn apply_modules(
  root_dir: &Path,
  data_dir: &Path,
  modules: &[DeployModule],
  dry_run: bool,
  logger: &mut Logger,
) -> Result<ModulesOutcome, String> {
  let mut out = ModulesOutcome { applied: 0, skipped: Vec::new(), checks: Vec::new() };
  for module in modules {
    if !module.enabled {
      out.checks.push(ModuleCheck { id: module.id.clone(), status: "off".into(), details: Vec::new() });
      continue;
    }
    let ctx = EntryContext {
      root_dir,
      module_dir: &module.dir,
      data_dir,
      values: &module.values,
    };
    let (applied, skipped, checks) = apply_entries(&ctx, &module.def.entries, dry_run, logger)?;
    out.applied += applied;
    out.skipped.extend(skipped);
    out.checks.push(module_check(&module.id, &checks));
  }
  // Last, because an entry can rebuild css/main.css from SCSS.
  apply_module_css(root_dir, modules, dry_run, logger)?;
  Ok(out)
}

/// Replace everything after CSS_MARKER in css/main.css with the enabled
/// modules' stylesheets, so switching one off takes its CSS out again.
fn apply_module_css(
  root_dir: &Path,
  modules: &[DeployModule],
  dry_run: bool,
  logger: &mut Logger,
) -> Result<(), String> {
  let mut blocks = Vec::new();
  for module in modules.iter().filter(|m| m.enabled) {
    let Some(css_file) = &module.def.css else {
      continue;
    };
    let path = module.dir.join(css_file);
    let css = fs::read_to_string(&path).map_err(|e| format!("Could not read {}: {e}", path.display()))?;
    blocks.push(format!("/* {} */\n{}", module.def.title, css.trim_end()));
  }

  let main_css_path = root_dir.join("css").join("main.css");
  let main_css = fs::read_to_string(&main_css_path)
    .map_err(|e| format!("Could not read {}: {e}", main_css_path.display()))?;
  let had_existing = main_css.contains(CSS_MARKER);
  let stripped = match main_css.find(CSS_MARKER) {
    Some(idx) => main_css[..idx].trim_end(),
    None => main_css.trim_end(),
  };
  if blocks.is_empty() && !had_existing {
    return Ok(());
  }
  let updated = if blocks.is_empty() {
    format!("{stripped}\n")
  } else {
    format!("{stripped}\n\n{CSS_MARKER}\n{}\n", blocks.join("\n\n"))
  };

  if dry_run {
    logger.info(format!(
      "[dry-run] Would update css/main.css ({} module stylesheet(s))",
      blocks.len()
    ));
    return Ok(());
  }
  fs::write(&main_css_path, updated).map_err(|e| e.to_string())?;
  logger.info(format!("Updated css/main.css ({} module stylesheet(s))", blocks.len()));
  Ok(())
}

fn copy_dir_recursive(src: &Path, dest: &Path, dry_run: bool) -> Result<(), String> {
  if !dry_run {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
  }
  let entries = fs::read_dir(src).map_err(|e| e.to_string())?;
  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with('.') {
      continue;
    }
    let src_path = entry.path();
    let dest_path = dest.join(&name);
    if src_path.is_dir() {
      copy_dir_recursive(&src_path, &dest_path, dry_run)?;
    } else if !dry_run {
      fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;
    }
  }
  Ok(())
}

/// A non-destructive dry run of every module against the 5e checkout as it is.
pub async fn check_deploy_modules() -> Result<Vec<ModuleCheck>, String> {
  tokio::task::spawn_blocking(move || {
    let paths = resolve_paths();
    let modules = load_modules(&modules_dir(), &read_raw_config())?;
    let mut logger = Logger::new(None);
    let outcome = apply_modules(&paths.repo_5e, &paths.data_dir, &modules, true, &mut logger)?;
    Ok(outcome.checks)
  })
  .await
  .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::modules::ModuleFile;
  use crate::test_util::{temp_dir, TempDir};
  use serde_json::json;
  use std::env;
  use std::path::PathBuf;

  fn values(v: Value) -> Map<String, Value> {
    serde_json::from_value(v).unwrap()
  }

  fn bundled(id: &str) -> DeployModule {
    load_modules(&modules_dir(), &Map::new())
      .unwrap()
      .into_iter()
      .find(|m| m.id == id)
      .unwrap()
  }

  fn run(root: &Path, module: &DeployModule, values: &Map<String, Value>) -> Vec<ManifestEntryCheck> {
    let ctx = EntryContext { root_dir: root, module_dir: &module.dir, data_dir: Path::new(""), values };
    apply_entries(&ctx, &module.def.entries, false, &mut Logger::new(None)).unwrap().2
  }

  fn commit_all(root: &Path, msg: &str) -> String {
    git_run(root, &["add", "-A"]).unwrap();
    git_run(root, &["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", msg]).unwrap();
    git_capture(root, &["rev-parse", "HEAD"]).unwrap()
  }

  const BUILD_SW: &str = "workbox.injectManifest({\n\tinjectionPoint: \"self.__WB_PRECACHE_MANIFEST\",\n\tglobPatterns: [],\n});\n";

  #[test]
  fn offline_cache_patch_stays_single_when_rerun_with_extra_globs() {
    let root = temp_dir("sw");
    fs::create_dir_all(root.join("node")).unwrap();
    let target = root.join("node/build-sw.mjs");
    fs::write(&target, BUILD_SW).unwrap();
    let module = bundled("offline-cache");
    let opts = values(json!({ "extraGlobs": ["homebrew/Big;*.json", " "], "skipMonsters": true }));

    run(&root, &module, &opts);
    run(&root, &module, &opts);
    let out = fs::read_to_string(&target).unwrap();
    assert_eq!(out.matches("globIgnores:").count(), 1, "{out}");
    assert_eq!(out.matches("\"homebrew/Big;*.json\"").count(), 1);
    assert!(out.contains("\"data/bestiary/**\""));
    assert!(out.contains("\"homebrew/unused/**\""));
  }

  #[test]
  fn an_option_off_leaves_its_patch_out() {
    let root = temp_dir("nav");
    fs::create_dir_all(root.join("js")).unwrap();
    let target = root.join("js/navigation.js");
    let nav = "\t\tNavBar._addElement_li({page: \"recipes.html\"});\n\t\tNavBar._addElement_divider();\n\t\tNavBar._addElement_li({page: \"names.html\"});\n";
    fs::write(&target, nav).unwrap();
    let module = bundled("trim-navigation");
    let mut opts = module.values.clone();
    opts.insert("hide-names".into(), json!(false));

    run(&root, &module, &opts);
    let out = fs::read_to_string(&target).unwrap();
    // Upstream calls stay untouched; the appended runtime filter carries only enabled hides.
    assert!(out.contains("\t\tNavBar._addElement_li({page: \"recipes.html\"});"), "{out}");
    assert!(out.contains("\n\t\tNavBar._addElement_divider"), "{out}");
    let filter = out.split("/* === BEGIN HBM: Trim Navigation === */").nth(1).expect("filter block injected");
    assert!(filter.contains("\"recipes.html\""), "{filter}");
    assert!(!filter.contains("\"names.html\""), "{filter}");
  }

  const NAV_SPECIES: &str = "NavBar._addElement_li({page: \"races.html\", aText: \"Species\"});\nNavBar._addElement_li({page: \"tables.html\", aText: \"Tables\"});\n";

  /// A throwaway checkout with a nav file in it, committed as the site ships it.
  fn git_site(name: &str) -> TempDir {
    let root = temp_dir(name);
    fs::create_dir_all(root.join("js")).unwrap();
    fs::write(root.join("js/navigation.js"), NAV_SPECIES).unwrap();
    git_run(&root, &["init", "--quiet"]).unwrap();
    git_run(&root, &["add", "."]).unwrap();
    git_run(&root, &["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "site"]).unwrap();
    root
  }

  fn with_config(id: &str, saved: Value) -> DeployModule {
    let config: Map<String, Value> =
      serde_json::from_value(json!({ "deploy": { "modules": { id: saved } } })).unwrap();
    load_modules(&modules_dir(), &config).unwrap().into_iter().find(|m| m.id == id).unwrap()
  }

  fn apply_like_local(root: &Path, modules: &[DeployModule]) {
    let mut logger = Logger::new(None);
    restore_module_targets(root, Path::new(""), modules, &mut logger).unwrap();
    for module in modules {
      let ctx = EntryContext { root_dir: root, module_dir: &module.dir, data_dir: Path::new(""), values: &module.values };
      apply_entries(&ctx, &module.def.entries, false, &mut logger).unwrap();
    }
  }

  #[test]
  fn apply_can_rename_a_label_and_bring_a_link_back() {
    let root = git_site("reapply");
    apply_like_local(&root, &[
      with_config("prefer-ancestries", json!({ "options": { "plural": "Ancestries" } })),
      with_config("trim-navigation", json!({ "options": { "hide-tables": true } })),
    ]);
    let out = fs::read_to_string(root.join("js/navigation.js")).unwrap();
    assert!(out.contains("aText: \"Ancestries\""), "{out}");
    let filter_on = out.split("/* === BEGIN HBM: Trim Navigation === */").nth(1).expect("filter block injected");
    assert!(filter_on.contains("\"tables.html\""), "{filter_on}");

    apply_like_local(&root, &[
      with_config("prefer-ancestries", json!({ "options": { "plural": "Lineages" } })),
      with_config("trim-navigation", json!({ "options": { "hide-tables": false } })),
    ]);
    let out = fs::read_to_string(root.join("js/navigation.js")).unwrap();
    assert!(out.contains("aText: \"Lineages\""), "{out}");
    assert!(!out.contains("Ancestries"), "{out}");
    let filter_off = out.split("/* === BEGIN HBM: Trim Navigation === */").nth(1).expect("filter block injected");
    assert!(!filter_off.contains("\"tables.html\""), "{filter_off}");
  }

  #[test]
  fn a_dry_run_judges_the_committed_file_not_the_last_run() {
    let root = git_site("dry-pristine");
    // As a previous Apply left it: the text the patch looks for is already gone.
    fs::write(root.join("js/navigation.js"), NAV_SPECIES.replace("Species", "Ancestries")).unwrap();
    let module = with_config("prefer-ancestries", json!({ "options": { "plural": "Lineages" } }));
    let ctx = EntryContext { root_dir: &root, module_dir: &module.dir, data_dir: Path::new(""), values: &module.values };
    let (_, _, checks) = apply_entries(&ctx, &module.def.entries, true, &mut Logger::new(None)).unwrap();
    let nav = checks.iter().find(|c| c.description == "Menu").unwrap();
    assert_eq!(nav.status, "applied", "{:?}", nav.details);
    // A dry run still writes nothing.
    assert!(fs::read_to_string(root.join("js/navigation.js")).unwrap().contains("Ancestries"));
  }

  #[test]
  fn a_missing_optional_source_is_a_quiet_skip() {
    let root = temp_dir("home");
    let module = bundled("home-page");
    let ctx = EntryContext {
      root_dir: &root,
      module_dir: &module.dir,
      data_dir: Path::new(""),
      values: &module.values,
    };
    let mut logger = Logger::new(None);
    let (_, skipped, checks) = apply_entries(&ctx, &module.def.entries, false, &mut logger).unwrap();
    assert_eq!(checks[0].status, "skipped");
    assert!(skipped.is_empty());
    assert!(logger.warnings.is_empty());
    assert!(!root.join("index.html").exists());
  }

  #[test]
  fn the_site_theme_takes_its_font_from_the_data_folder_with_nodesto_as_the_fallback() {
    let root = temp_dir("font-site");
    let data = temp_dir("font-data");
    let module = bundled("site-theme");
    let ctx = EntryContext { root_dir: &root, module_dir: &module.dir, data_dir: &data, values: &module.values };
    // No Modesto yet: the bundled fallback still ships.
    apply_entries(&ctx, &module.def.entries, false, &mut Logger::new(None)).unwrap();
    assert!(root.join("hbm/nodesto/nodesto-caps-condensed.otf").exists());
    assert!(!root.join("hbm/modesto-condensed/modesto-condensed.woff2").exists());

    fs::create_dir_all(data.join("fonts")).unwrap();
    fs::write(data.join("fonts/modesto-condensed.woff2"), "x").unwrap();
    apply_entries(&ctx, &module.def.entries, false, &mut Logger::new(None)).unwrap();
    assert!(root.join("hbm/modesto-condensed/modesto-condensed.woff2").exists());
  }

  #[test]
  fn item_prices_rewrite_the_official_data_from_the_data_folder() {
    let root = temp_dir("prices-site");
    let data = temp_dir("prices-data");
    let module = bundled("item-prices");
    let prices: Vec<ModuleEntry> = module
      .def
      .entries
      .iter()
      .filter(|e| matches!(e, ModuleEntry::Prices { .. }))
      .cloned()
      .collect();
    assert_eq!(prices.len(), 3);
    fs::create_dir_all(root.join("data")).unwrap();
    for file in ["items.json", "items-base.json", "magicvariants.json"] {
      fs::write(root.join("data").join(file), json!({ "item": [{ "name": "Rope", "source": "PHB", "value": 100 }] }).to_string()).unwrap();
    }
    let ctx = EntryContext { root_dir: &root, module_dir: &module.dir, data_dir: &data, values: &module.values };

    // Nothing saved yet: a quiet skip that leaves the data alone.
    let mut logger = Logger::new(None);
    let (_, _, checks) = apply_entries(&ctx, &prices, false, &mut logger).unwrap();
    assert!(checks.iter().all(|c| c.status == "skipped"));
    assert!(logger.warnings.is_empty());
    assert!(!fs::read_to_string(root.join("data/items.json")).unwrap().contains("hbmPrice"));

    fs::create_dir_all(data.join("content")).unwrap();
    fs::write(data.join("content/item-prices.json"), json!({ "prices": [{ "name": "rope", "cost": 2, "max": 3 }] }).to_string()).unwrap();
    let (applied, _, _) = apply_entries(&ctx, &prices, false, &mut Logger::new(None)).unwrap();
    assert_eq!(applied, 3);
    let items: Value = serde_json::from_str(&fs::read_to_string(root.join("data/items.json")).unwrap()).unwrap();
    assert_eq!(items["item"][0]["value"], json!(200));
    assert_eq!(items["item"][0]["hbmPrice"], json!({ "max": 300, "original": 100 }));
  }

  /// Upstream drift check. Point HBM_TEST_SITE at a scratch copy of a clean 5e
  /// checkout (it gets patched) and run with `--ignored`.
  #[test]
  #[ignore]
  fn bundled_modules_apply_to_a_real_checkout() {
    let root = PathBuf::from(env::var("HBM_TEST_SITE").expect("set HBM_TEST_SITE"));
    let mut modules = load_modules(&modules_dir(), &Map::new()).unwrap();
    modules.iter_mut().for_each(|m| m.enabled = true);
    let mut logger = Logger::new(None);
    let outcome = apply_modules(&root, Path::new(""), &modules, false, &mut logger).unwrap();
    let failed: Vec<_> = outcome.checks.iter().filter(|c| c.status == "error").collect();
    assert!(failed.is_empty(), "{failed:#?}");
    assert!(outcome.skipped.is_empty(), "{:#?}", outcome.skipped);
  }

  #[test]
  fn module_css_is_replaced_and_removed_with_its_module() {
    let root = temp_dir("css");
    let module_dir = temp_dir("css-module");
    fs::create_dir_all(root.join("css")).unwrap();
    fs::write(module_dir.join("a.css"), ".a { color: red; }\n").unwrap();
    let main = root.join("css/main.css");
    fs::write(&main, format!("body {{}}\n\n{CSS_MARKER}\n.old {{}}\n")).unwrap();
    let def: ModuleFile = serde_json::from_value(json!({ "title": "A", "css": "a.css" })).unwrap();
    let mut module = DeployModule { id: "a".into(), dir: module_dir.to_path_buf(), def, enabled: true, values: Map::new(), replaced_by: None };

    apply_module_css(&root, std::slice::from_ref(&module), false, &mut Logger::new(None)).unwrap();
    let on = fs::read_to_string(&main).unwrap();
    assert!(on.contains(".a { color: red; }") && !on.contains(".old"), "{on}");

    module.enabled = false;
    apply_module_css(&root, &[module], false, &mut Logger::new(None)).unwrap();
    assert_eq!(fs::read_to_string(&main).unwrap(), "body {}\n");
  }

  const PATCH_HEADER: &str = "Reskin exported from 5e-testing abc1234, built on upstream v1.0.0 (def5678)";

  fn patch_changing(from: &str, to: &str) -> String {
    format!("{PATCH_HEADER}\ndiff --git a/js/a.js b/js/a.js\n--- a/js/a.js\n+++ b/js/a.js\n@@ -1,2 +1,2 @@\n one\n-{from}\n+{to}\n")
  }

  /// A committed site with js/a.js, and a module folder holding `patch`.
  fn diff_site(name: &str, patch: &str) -> (TempDir, TempDir) {
    let root = temp_dir(name);
    fs::create_dir_all(root.join("js")).unwrap();
    fs::write(root.join("js/a.js"), "one\ntwo\n").unwrap();
    // As 5etools' own .gitattributes does, so a CRLF git config can't change the text.
    fs::write(root.join(".gitattributes"), "* text eol=lf\n").unwrap();
    git_run(&root, &["init", "--quiet"]).unwrap();
    commit_all(&root, "site");
    let module_dir = temp_dir(&format!("{name}-module"));
    fs::write(module_dir.join("reskin.patch"), patch).unwrap();
    (root, module_dir)
  }

  fn run_entries(root: &Path, module_dir: &Path, entries: Value, dry_run: bool) -> Result<Vec<ManifestEntryCheck>, String> {
    let entries: Vec<ModuleEntry> = serde_json::from_value(entries).unwrap();
    let vals = Map::new();
    let ctx = EntryContext { root_dir: root, module_dir, data_dir: Path::new(""), values: &vals };
    apply_entries(&ctx, &entries, dry_run, &mut Logger::new(None)).map(|r| r.2)
  }

  #[test]
  fn a_diff_entry_applies_a_git_patch() {
    let (root, module_dir) = diff_site("diff-ok", &patch_changing("two", "TWO"));
    let entries = json!([{ "type": "diff", "description": "Shell", "source": "reskin.patch" }]);

    let dry = run_entries(&root, &module_dir, entries.clone(), true).unwrap();
    assert_eq!(dry[0].status, "applied");
    assert_eq!(fs::read_to_string(root.join("js/a.js")).unwrap(), "one\ntwo\n");

    let real = run_entries(&root, &module_dir, entries.clone(), false).unwrap();
    assert_eq!(real[0].status, "applied");
    assert_eq!(fs::read_to_string(root.join("js/a.js")).unwrap(), "one\nTWO\n");
    // Git's index is left alone, so a dry run still judges the committed text.
    assert_eq!(run_entries(&root, &module_dir, entries, true).unwrap()[0].status, "applied");
  }

  #[test]
  fn a_diff_that_does_not_apply_errors_with_its_header() {
    let (root, module_dir) = diff_site("diff-bad", &patch_changing("three", "THREE"));
    let entries = json!([{ "type": "diff", "description": "Shell", "source": "reskin.patch" }]);

    let dry = run_entries(&root, &module_dir, entries.clone(), true).unwrap();
    assert_eq!(dry[0].status, "error");
    assert!(dry[0].details.iter().any(|d| d.contains("built on upstream v1.0.0")), "{:?}", dry[0].details);

    let err = run_entries(&root, &module_dir, entries, false).unwrap_err();
    assert!(err.contains("built on upstream v1.0.0"), "{err}");
    assert_eq!(fs::read_to_string(root.join("js/a.js")).unwrap(), "one\ntwo\n");
  }

  #[test]
  fn a_missing_diff_source_errors() {
    let (root, module_dir) = diff_site("diff-missing", "");
    let entries = json!([{ "type": "diff", "description": "Shell", "source": "gone.patch" }]);
    assert_eq!(run_entries(&root, &module_dir, entries.clone(), true).unwrap()[0].status, "error");
    assert!(run_entries(&root, &module_dir, entries, false).is_err());
  }

  #[test]
  fn an_npm_entry_only_runs_for_real() {
    let root = temp_dir("npm");
    let entries = json!([{ "type": "npm", "description": "Pages", "script": "gen:pages" }]);
    // No package.json here, so a real run fails; a dry run doesn't try.
    assert_eq!(run_entries(&root, &root, entries.clone(), true).unwrap()[0].status, "ready");
    let err = run_entries(&root, &root, entries, false).unwrap_err();
    assert!(err.contains("gen:pages"), "{err}");
  }

  #[test]
  fn parallel_npm_entries_run_both_and_keep_order() {
    let root = temp_dir("npm-parallel");
    fs::write(
      root.join("package.json"),
      r#"{ "scripts": { "a": "node -e \"require('fs').writeFileSync('a.txt', 'A')\"", "b": "node -e \"require('fs').writeFileSync('b.txt', 'B')\"" } }"#,
    )
    .unwrap();
    let entries = json!([
      { "type": "npm", "description": "Task A", "script": "a", "parallel": true },
      { "type": "npm", "description": "Task B", "script": "b", "parallel": true }
    ]);
    let checks = run_entries(&root, &root, entries, false).unwrap();
    assert_eq!(checks.len(), 2);
    assert_eq!((checks[0].description.as_str(), checks[0].status.as_str()), ("Task A", "applied"));
    assert_eq!((checks[1].description.as_str(), checks[1].status.as_str()), ("Task B", "applied"));
    assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "A");
    assert_eq!(fs::read_to_string(root.join("b.txt")).unwrap(), "B");
  }

  #[test]
  fn ensure_node_modules_skips_when_stamp_matches_lockfile() {
    let root = temp_dir("npm-stamp");
    fs::write(root.join("package-lock.json"), r#"{"name":"x","lockfileVersion":3}"#).unwrap();
    let expected = expected_npm_stamp(&root).unwrap();
    fs::create_dir_all(root.join("node_modules")).unwrap();
    fs::write(root.join(NPM_STAMP_REL), format!("{expected}\n")).unwrap();
    let mut logger = Logger::new(None);
    ensure_node_modules(&root, &mut logger).unwrap();
    assert!(logger.logs.is_empty());
  }

  #[test]
  fn module_css_is_appended_after_entries() {
    let root = temp_dir("css-after");
    let module_dir = temp_dir("css-after-module");
    fs::create_dir_all(root.join("css")).unwrap();
    fs::write(root.join("css/main.css"), "body {}\n").unwrap();
    fs::write(module_dir.join("fresh.css"), "rebuilt {}\n").unwrap();
    fs::write(module_dir.join("a.css"), ".a { color: red; }\n").unwrap();
    // The copy stands in for build:css, which rewrites main.css from SCSS.
    let def: ModuleFile = serde_json::from_value(json!({
      "title": "A",
      "css": "a.css",
      "entries": [{ "type": "copy", "description": "Rebuild", "source": "fresh.css", "target": "css/main.css" }]
    }))
    .unwrap();
    let module = DeployModule { id: "a".into(), dir: module_dir.to_path_buf(), def, enabled: true, values: Map::new(), replaced_by: None };

    apply_modules(&root, Path::new(""), &[module], false, &mut Logger::new(None)).unwrap();
    let css = fs::read_to_string(root.join("css/main.css")).unwrap();
    assert!(css.starts_with("rebuilt {}") && css.contains(".a { color: red; }"), "{css}");
  }

  #[test]
  fn restoring_targets_covers_a_diff_and_regenerated_pages() {
    let (root, module_dir) = diff_site("restore-diff", &patch_changing("two", "TWO"));
    fs::write(root.join("index.html"), "<p>upstream</p>\n").unwrap();
    commit_all(&root, "page");
    fs::write(root.join("js/a.js"), "one\nTWO\n").unwrap();
    fs::write(root.join("index.html"), "<p>generated</p>\n").unwrap();
    let def: ModuleFile = serde_json::from_value(json!({
      "title": "Reskin",
      "entries": [
        { "type": "diff", "source": "reskin.patch" },
        { "type": "npm", "script": "gen:pages" }
      ]
    }))
    .unwrap();
    // Off: a module switched off still has its files put back.
    let module = DeployModule { id: "reskin".into(), dir: module_dir.to_path_buf(), def, enabled: false, values: Map::new(), replaced_by: None };

    restore_module_targets(&root, Path::new(""), &[module], &mut Logger::new(None)).unwrap();
    assert_eq!(fs::read_to_string(root.join("js/a.js")).unwrap(), "one\ntwo\n");
    assert_eq!(fs::read_to_string(root.join("index.html")).unwrap(), "<p>upstream</p>\n");
  }

  /// A module whose build is an npm script in `dir` that records its arguments.
  fn module_building_in(dir: &Path, script_body: &str, enabled: bool) -> DeployModule {
    fs::write(dir.join("write.js"), script_body).unwrap();
    fs::write(dir.join("package.json"), r#"{ "scripts": { "export": "node write.js" } }"#).unwrap();
    let def: ModuleFile = serde_json::from_value(json!({
      "title": "Reskin",
      "build": { "cwd": slash_path(dir), "script": "export", "args": ["--worktree"] }
    }))
    .unwrap();
    DeployModule { id: "reskin".into(), dir: dir.to_path_buf(), def, enabled, values: Map::new(), replaced_by: None }
  }

  const RECORD_ARGS: &str = "require('fs').writeFileSync('ran.txt', process.argv.slice(2).join(' '))";

  #[test]
  fn a_module_build_runs_its_script_with_its_args() {
    let dir = temp_dir("build-runs");
    let module = module_building_in(&dir, RECORD_ARGS, true);
    build_module_packages(Path::new(""), &[module], false, &mut Logger::new(None)).unwrap();
    assert_eq!(fs::read_to_string(dir.join("ran.txt")).unwrap(), "--worktree");
  }

  #[test]
  fn a_module_build_skips_dry_runs_and_switched_off_modules() {
    let dir = temp_dir("build-skips");
    let on = module_building_in(&dir, RECORD_ARGS, true);
    build_module_packages(Path::new(""), &[on], true, &mut Logger::new(None)).unwrap();
    let off = module_building_in(&dir, RECORD_ARGS, false);
    build_module_packages(Path::new(""), &[off], false, &mut Logger::new(None)).unwrap();
    assert!(!dir.join("ran.txt").exists());
  }

  #[test]
  fn a_module_build_with_no_folder_or_package_json_keeps_the_last_export() {
    let dir = temp_dir("build-missing");
    let mut module = module_building_in(&dir, RECORD_ARGS, true);
    module.def.build.as_mut().unwrap().cwd = slash_path(&dir.join("gone"));
    build_module_packages(Path::new(""), &[module.clone()], false, &mut Logger::new(None)).unwrap();

    // A bundled customizer/ containing only patch-deploy/ (no package.json) skips cleanly.
    let prebuilt = temp_dir("build-prebuilt");
    fs::create_dir_all(prebuilt.join("patch-deploy")).unwrap();
    module.def.build.as_mut().unwrap().cwd = slash_path(&prebuilt);
    build_module_packages(Path::new(""), &[module], false, &mut Logger::new(None)).unwrap();
  }

  #[test]
  fn reskin_build_is_skipped_when_data_override_exists() {
    let dir = temp_dir("build-override");
    let data = temp_dir("build-override-data");
    fs::create_dir_all(data.join("content/patch-deploy")).unwrap();
    fs::write(data.join("content/patch-deploy/reskin.patch"), "override").unwrap();
    let module = module_building_in(&dir, RECORD_ARGS, true);
    let mut logger = Logger::new(None);
    build_module_packages(&data, &[module], false, &mut logger).unwrap();
    assert!(!dir.join("ran.txt").exists());
    assert!(logger.logs.iter().any(|l| l.message.contains("using override")));
  }

  #[test]
  fn a_failed_module_build_stops_the_apply() {
    let dir = temp_dir("build-fails");
    let module = module_building_in(&dir, "console.error('no site'); process.exit(1)", true);
    let err = build_module_packages(Path::new(""), &[module], false, &mut Logger::new(None)).unwrap_err();
    assert!(err.contains("Reskin") && err.contains("export") && err.contains("no site"), "{err}");
  }

  #[test]
  fn the_reskin_module_exports_the_customizer_before_it_applies() {
    let build = bundled("reskin").def.build.expect("reskin has a build");
    assert_eq!((build.cwd.as_str(), build.script.as_str()), ("{manager}/customizer", "export"));
    assert_eq!(build.args, vec!["--worktree"]);
  }
}
