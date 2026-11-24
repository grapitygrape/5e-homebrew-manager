//! Customization modules (the Customize Site page).
//!
//! Modules ship with the app (`deploy-modules/<id>/module.json`); which are on,
//! and their option values, live in `hbm-config.json` under `deploy.modules`.

use crate::config::{ensure_object, read_raw_config, slash_path, update_raw_config};
use crate::runtime::manager_dir_for;
use regex::{Captures, Regex};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Site files a cache purge should cover whatever modules are on.
const BASE_CHANGED_FILES: &[&str] = &[
  "css/main.css",
  "sw.js",
  "sw-injector.js",
  "homebrew/index.json",
  "homebrew/content-blocklist.json",
];

/// How one module fared: "ok", "skipped" (something optional was missing or
/// didn't match), "error", or "off" when it's switched off.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleCheck {
  pub id: String,
  pub status: String,
  pub details: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleOption {
  pub id: String,
  pub label: String,
  /// "toggle" | "list" | "path" | "text"
  pub kind: String,
  #[serde(default)]
  pub default: Value,
  /// The card it shows in, when a module's options split across several.
  #[serde(default)]
  pub group: Option<String>,
}

/// A button on the module's card that opens another page of the app.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleLink {
  pub href: String,
  pub label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EnsureArrayItems {
  #[serde(default)]
  pub array_key: String,
  #[serde(default)]
  pub items: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PatchSpec {
  #[serde(default)]
  pub note: String,
  #[serde(default)]
  pub find: Option<String>,
  #[serde(default)]
  pub replace: Option<String>,
  #[serde(default)]
  pub is_regex: bool,
  #[serde(default)]
  pub flags: Option<String>,
  #[serde(default)]
  pub contains: Option<String>,
  #[serde(default)]
  pub also_comment_next_divider: bool,
  #[serde(default)]
  pub also_comment_next_regex: Option<String>,
  #[serde(default)]
  pub insert_file: Option<String>,
  #[serde(default)]
  pub marker: Option<String>,
  #[serde(default)]
  pub position: Option<String>,
  #[serde(default)]
  pub ensure_array_items: Option<EnsureArrayItems>,
  #[serde(default)]
  pub items_option: Option<String>,
  #[serde(default)]
  pub unless_contains: Option<String>,
  #[serde(default)]
  pub allow_missing: bool,
  #[serde(default)]
  pub option: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub(crate) enum ModuleEntry {
  Copy {
    #[serde(default)]
    description: String,
    #[serde(default)]
    disabled: bool,
    #[serde(default)]
    option: Option<String>,
    source: String,
    target: String,
    #[serde(default)]
    if_exists: bool,
  },
  Prices {
    #[serde(default)]
    description: String,
    #[serde(default)]
    disabled: bool,
    #[serde(default)]
    option: Option<String>,
    source: String,
    target: String,
  },
  Diff {
    #[serde(default)]
    description: String,
    #[serde(default)]
    disabled: bool,
    #[serde(default)]
    option: Option<String>,
    source: String,
  },
  Npm {
    #[serde(default)]
    description: String,
    #[serde(default)]
    disabled: bool,
    #[serde(default)]
    option: Option<String>,
    script: String,
    /// When true, consecutive parallel npm entries run concurrently (e.g. gen:pages + build:css).
    #[serde(default)]
    parallel: bool,
  },
  Patch {
    #[serde(default)]
    description: String,
    #[serde(default)]
    disabled: bool,
    #[serde(default)]
    option: Option<String>,
    target: String,
    #[serde(default)]
    patches: Vec<PatchSpec>,
  },
}

impl ModuleEntry {
  pub(crate) fn is_disabled(&self) -> bool {
    match self {
      Self::Copy { disabled, .. }
      | Self::Prices { disabled, .. }
      | Self::Diff { disabled, .. }
      | Self::Npm { disabled, .. }
      | Self::Patch { disabled, .. } => *disabled,
    }
  }

  pub(crate) fn option(&self) -> Option<&str> {
    match self {
      Self::Copy { option, .. }
      | Self::Prices { option, .. }
      | Self::Diff { option, .. }
      | Self::Npm { option, .. }
      | Self::Patch { option, .. } => option.as_deref(),
    }
  }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModuleFile {
  pub title: String,
  #[serde(default)]
  pub description: String,
  #[serde(default)]
  pub order: i64,
  #[serde(default)]
  pub default_enabled: bool,
  #[serde(default)]
  pub css: Option<String>,
  #[serde(default)]
  pub entries: Vec<ModuleEntry>,
  #[serde(default)]
  pub options: Vec<ModuleOption>,
  /// Site paths the module changes that aren't entry targets.
  #[serde(default)]
  pub also_changes: Vec<String>,
  /// Modules naming the same card share one on the Customize Site page.
  #[serde(default)]
  pub card: Option<String>,
  #[serde(default)]
  pub link: Option<ModuleLink>,
  /// Modules this one stands in for. They count as off while it's on, and
  /// their saved settings stay as they were for when it's off again.
  #[serde(default)]
  pub replaces: Vec<String>,
  /// Rebuilds what the entries read, before every apply, so they never use a
  /// stale export.
  #[serde(default)]
  pub build: Option<ModuleBuild>,
}

/// `npm run <script> -- <args>` in `cwd`, which takes `{manager}`, `{data}` and
/// `{option:<id>}` like an entry's source.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModuleBuild {
  #[serde(default)]
  pub description: String,
  pub cwd: String,
  pub script: String,
  #[serde(default)]
  pub args: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct DeployModule {
  pub id: String,
  pub dir: PathBuf,
  pub def: ModuleFile,
  pub enabled: bool,
  /// Every option's value: the saved one, else the default.
  pub values: Map<String, Value>,
  /// The title of the enabled module that replaces this one.
  pub replaced_by: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleOptionView {
  pub id: String,
  pub label: String,
  pub kind: String,
  pub value: Value,
  pub default: Value,
  pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployModuleView {
  pub id: String,
  pub title: String,
  pub description: String,
  pub enabled: bool,
  pub default_enabled: bool,
  pub options: Vec<ModuleOptionView>,
  pub card: Option<String>,
  pub link: Option<ModuleLink>,
  pub replaced_by: Option<String>,
}

/// The modules bundled with the app.
pub fn modules_dir() -> PathBuf {
  crate::runtime::modules_dir()
}

pub(crate) fn deploy_section(config: &Map<String, Value>) -> Option<&Map<String, Value>> {
  config.get("deploy").and_then(Value::as_object)
}

/// `config.deploy[key]` as a mutable object, created when missing.
pub(crate) fn deploy_object<'a>(config: &'a mut Map<String, Value>, key: &str) -> &'a mut Map<String, Value> {
  ensure_object(ensure_object(config, "deploy"), key)
}

/// Text options land inside quoted strings in the site's JS and HTML, so anything
/// that could close the string or start markup is refused. Matches labelProblem in
/// customize-cards.ts.
fn text_fits(text: &str) -> bool {
  !text.trim().is_empty() && !text.contains(['"', '`', '\\', '$', '<', '>', '\n', '\r'])
}

/// A saved value is used only when it has the option's shape, so a hand edit
/// with the wrong type falls back to the default instead of breaking a run.
fn option_value(opt: &ModuleOption, saved: Option<&Value>) -> Value {
  let fits = |v: &Value| match opt.kind.as_str() {
    "toggle" => v.is_boolean(),
    "list" => v.as_array().is_some_and(|a| a.iter().all(Value::is_string)),
    "text" => v.as_str().is_some_and(text_fits),
    _ => v.is_string(),
  };
  match saved {
    Some(v) if fits(v) => v.clone(),
    _ => opt.default.clone(),
  }
}

pub(crate) fn read_module_file(module_dir: &Path) -> Result<Option<ModuleFile>, String> {
  let file = module_dir.join("module.json");
  if !file.exists() {
    return Ok(None);
  }
  let raw = fs::read_to_string(&file).map_err(|e| format!("Could not read {}: {e}", file.display()))?;
  let def: ModuleFile =
    serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", slash_path(&file)))?;
  Ok(Some(def))
}

fn build_module_with_saved(
  module_dir: PathBuf,
  id: String,
  def: ModuleFile,
  saved: Option<&Map<String, Value>>,
) -> DeployModule {
  let mine = saved.and_then(|m| m.get(&id));
  let enabled = mine
    .and_then(|m| m.get("enabled"))
    .and_then(Value::as_bool)
    .unwrap_or(def.default_enabled);
  let saved_opts = mine.and_then(|m| m.get("options")).and_then(Value::as_object);
  let values = def
    .options
    .iter()
    .map(|opt| (opt.id.clone(), option_value(opt, saved_opts.and_then(|o| o.get(&opt.id)))))
    .collect();
  DeployModule { id, dir: module_dir, def, enabled, values, replaced_by: None }
}

pub(crate) fn build_module(
  module_dir: PathBuf,
  id: String,
  def: ModuleFile,
  config: &Map<String, Value>,
) -> DeployModule {
  let saved = deploy_section(config)
    .and_then(|d| d.get("modules"))
    .and_then(Value::as_object);
  build_module_with_saved(module_dir, id, def, saved)
}

pub(crate) fn load_modules(dir: &Path, config: &Map<String, Value>) -> Result<Vec<DeployModule>, String> {
  let saved = deploy_section(config)
    .and_then(|d| d.get("modules"))
    .and_then(Value::as_object);
  let entries = fs::read_dir(dir).map_err(|e| format!("Could not read {}: {e}", dir.display()))?;
  let mut out = Vec::new();
  for entry in entries.flatten() {
    let module_dir = entry.path();
    let Some(def) = read_module_file(&module_dir)? else {
      continue;
    };
    let id = entry.file_name().to_string_lossy().to_string();
    out.push(build_module_with_saved(module_dir, id, def, saved));
  }
  out.sort_by(|a, b| a.def.order.cmp(&b.def.order).then_with(|| a.id.cmp(&b.id)));
  let replaced: Vec<(String, String)> = out
    .iter()
    .filter(|m| m.enabled)
    .flat_map(|m| m.def.replaces.iter().map(|id| (id.clone(), m.def.title.clone())))
    .collect();
  for (id, title) in replaced {
    if let Some(m) = out.iter_mut().find(|m| m.id == id) {
      m.enabled = false;
      m.replaced_by = Some(title);
    }
  }
  Ok(out)
}

/// The files a git patch changes, from its `diff --git a/X b/X` lines.
pub(crate) fn diff_files(patch: &str) -> Vec<String> {
  patch
    .lines()
    .filter_map(|l| l.strip_prefix("diff --git a/"))
    .map(|rest| {
      // "X b/X": when both halves match, a space in the path can't mislead the split.
      let half = rest.len().saturating_sub(3) / 2;
      match (rest.get(..half), rest.get(half..half + 3)) {
        (Some(path), Some(" b/")) if rest[half + 3..] == *path => path.to_string(),
        _ => rest.split_once(" b/").map_or(rest, |(a, _)| a).to_string(),
      }
    })
    .collect()
}

/// `{data}/…` (the data folder), `{manager}/…`, `{option:<id>}`, an absolute path,
/// or a path in the module folder. None when it names something unset (an empty option).
/// When resolving `{manager}/customizer/patch-deploy`, checks `{data}/content/patch-deploy`
/// first so a user or container override can supply a custom Reskin export without
/// editing `hbm-config.json`.
pub(crate) fn resolve_source(raw: &str, module_dir: &Path, data_dir: &Path, values: &Map<String, Value>) -> Option<PathBuf> {
  if let Some((id, rest)) = raw.strip_prefix("{option:").and_then(|s| s.split_once('}')) {
    let value = values.get(id)?.as_str()?.trim();
    // A user's path is a full path or under {data} or {manager}: a bare relative
    // one would land inside the app's own module folder.
    if !value.starts_with("{data}") && !value.starts_with("{manager}") && !Path::new(value).is_absolute() {
      return None;
    }
    let base = resolve_source(value, module_dir, data_dir, values)?;
    // `{option:<id>}/file` names a file in the folder the option points at.
    let rest = rest.trim_start_matches(['/', '\\']);
    return Some(if rest.is_empty() { base } else { base.join(rest) });
  }
  if let Some(rest) = raw.strip_prefix("{data}") {
    if data_dir.as_os_str().is_empty() {
      return None;
    }
    return Some(data_dir.join(rest.trim_start_matches(['/', '\\'])));
  }
  if let Some(rest) = raw.strip_prefix("{manager}") {
    let rel = rest.trim_start_matches(['/', '\\']);
    if !data_dir.as_os_str().is_empty()
      && (rel == "customizer/patch-deploy" || rel.starts_with("customizer/patch-deploy/"))
    {
      let override_dir = data_dir.join("content/patch-deploy");
      if override_dir.join("reskin.patch").is_file() {
        let suffix = rel
          .strip_prefix("customizer/patch-deploy")
          .unwrap_or("")
          .trim_start_matches(['/', '\\']);
        return Some(if suffix.is_empty() {
          override_dir
        } else {
          override_dir.join(suffix)
        });
      }
    }
    return Some(manager_dir_for(module_dir, cfg!(debug_assertions)).join(rel));
  }
  let path = Path::new(raw);
  Some(if path.is_absolute() { path.to_path_buf() } else { module_dir.join(raw) })
}

/// An entry or patch with `option` runs only while that toggle is on.
pub(crate) fn option_allows(option: Option<&str>, values: &Map<String, Value>) -> bool {
  match option {
    Some(id) => values.get(id).and_then(Value::as_bool).unwrap_or(false),
    None => true,
  }
}

/// Fills `{option:<id>}` and `{option:<id>:lower}` in a patch's replacement text.
pub(crate) fn fill_options(text: &str, values: &Map<String, Value>) -> String {
  static RE: OnceLock<Regex> = OnceLock::new();
  let re = RE.get_or_init(|| Regex::new(r"\{option:([\w-]+)(:lower)?\}").unwrap());
  re.replace_all(text, |caps: &Captures| match values.get(&caps[1]).and_then(Value::as_str) {
    Some(value) if caps.get(2).is_some() => value.trim().to_lowercase(),
    Some(value) => value.trim().to_string(),
    None => caps[0].to_string(),
  })
  .into_owned()
}

/// What a cache purge should cover: build outputs, plus every served file the
/// enabled modules write. `node/` targets are build inputs, and a copied folder
/// (fonts) has no single URL.
pub(crate) fn changed_files(modules: &[DeployModule], data_dir: &Path) -> Vec<String> {
  let mut set: BTreeSet<String> = BASE_CHANGED_FILES.iter().map(|s| (*s).to_string()).collect();
  for module in modules.iter().filter(|m| m.enabled) {
    set.extend(module.def.also_changes.iter().cloned());
    for entry in &module.def.entries {
      if entry.is_disabled() || !option_allows(entry.option(), &module.values) {
        continue;
      }
      match entry {
        ModuleEntry::Diff { source, .. } => {
          let patch = resolve_source(source, &module.dir, data_dir, &module.values).and_then(|p| fs::read_to_string(p).ok());
          let served = |f: &String| !f.starts_with("node/") && !f.starts_with("scss/");
          set.extend(patch.map(|p| diff_files(&p)).unwrap_or_default().into_iter().filter(served));
        }
        ModuleEntry::Copy { source, target, .. } => {
          if !target.starts_with("node/")
            && !resolve_source(source, &module.dir, data_dir, &module.values).is_some_and(|p| p.is_dir())
          {
            set.insert(target.clone());
          }
        }
        ModuleEntry::Prices { target, .. } | ModuleEntry::Patch { target, .. } => {
          if !target.starts_with("node/") {
            set.insert(target.clone());
          }
        }
        ModuleEntry::Npm { .. } => {}
      }
    }
  }
  set.into_iter().collect()
}

fn view(module: &DeployModule) -> DeployModuleView {
  DeployModuleView {
    id: module.id.clone(),
    title: module.def.title.clone(),
    description: module.def.description.clone(),
    enabled: module.enabled,
    default_enabled: module.def.default_enabled,
    options: module
      .def
      .options
      .iter()
      .map(|opt| ModuleOptionView {
        id: opt.id.clone(),
        label: opt.label.clone(),
        kind: opt.kind.clone(),
        value: module.values.get(&opt.id).cloned().unwrap_or(Value::Null),
        default: opt.default.clone(),
        group: opt.group.clone(),
      })
      .collect(),
    card: module.def.card.clone(),
    link: module.def.link.clone(),
    replaced_by: module.replaced_by.clone(),
  }
}

pub fn list_deploy_modules() -> Result<Vec<DeployModuleView>, String> {
  let modules = load_modules(&modules_dir(), &read_raw_config())?;
  Ok(modules.iter().map(view).collect())
}

/// Save a module's switch and, when given, its option values (merged over the saved ones).
pub fn set_deploy_module(
  module_id: String,
  enabled: bool,
  options: Option<Map<String, Value>>,
) -> Result<(), String> {
  update_raw_config(|config| {
    let modules = deploy_object(config, "modules");
    let entry = ensure_object(modules, &module_id);
    entry.insert("enabled".into(), Value::Bool(enabled));
    if let Some(options) = options {
      let saved = ensure_object(entry, "options");
      for (k, v) in options {
        saved.insert(k, v);
      }
    }
    Ok(())
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::{pick_bundled_or_repo, source_repo_root};
  use crate::test_util::temp_dir;
  use serde_json::json;

  fn bundled() -> Vec<DeployModule> {
    load_modules(&modules_dir(), &Map::new()).unwrap()
  }

  #[test]
  fn debug_builds_deploy_the_repo_modules_not_the_build_copy() {
    let root = temp_dir("pick");
    let copy = root.join("target-copy");
    let repo = root.join("repo");
    fs::create_dir_all(&copy).unwrap();
    fs::create_dir_all(&repo).unwrap();
    // `tauri dev` refreshes its copy only when Rust rebuilds, so it can lag the repo.
    assert_eq!(pick_bundled_or_repo(Some(copy.clone()), repo.clone(), true), repo);
    assert_eq!(pick_bundled_or_repo(Some(copy.clone()), repo.clone(), false), copy);
    assert_eq!(pick_bundled_or_repo(Some(root.join("missing")), repo.clone(), false), repo);
    assert_eq!(pick_bundled_or_repo(Some(copy.clone()), root.join("no-repo"), true), copy);
  }

  #[test]
  fn release_manager_dir_resolves_from_bundled_deploy_modules_parent() {
    let bundled_mod = Path::new("/app/deploy-modules/reskin");
    assert_eq!(manager_dir_for(bundled_mod, false), PathBuf::from("/app"));
    assert_eq!(manager_dir_for(bundled_mod, true), source_repo_root());
  }

  #[test]
  fn every_bundled_module_loads_in_order() {
    let modules = bundled();
    assert!(modules.len() >= 12);
    let orders: Vec<i64> = modules.iter().map(|m| m.def.order).collect();
    let mut sorted = orders.clone();
    sorted.sort();
    assert_eq!(orders, sorted);
    // Every insertFile and module-relative copy source ships beside its module.json.
    for module in &modules {
      for entry in &module.def.entries {
        match entry {
          ModuleEntry::Copy { source, .. }
          | ModuleEntry::Prices { source, .. }
          | ModuleEntry::Diff { source, .. } => {
            if !source.starts_with('{') {
              assert!(module.dir.join(source).exists(), "{}: missing {source}", module.id);
            }
          }
          ModuleEntry::Patch { patches, .. } => {
            for patch in patches {
              if let Some(file) = &patch.insert_file {
                assert!(module.dir.join(file).exists(), "{}: missing {file}", module.id);
              }
            }
          }
          ModuleEntry::Npm { .. } => {}
        }
      }
      if let Some(css) = &module.def.css {
        assert!(module.dir.join(css).exists(), "{}: missing {css}", module.id);
      }
    }
  }

  #[test]
  fn patch_placeholders_fill_from_the_options() {
    let values: Map<String, Value> = serde_json::from_value(json!({ "singular": " Ancestry " })).unwrap();
    assert_eq!(fill_options("x: \"{option:singular}\"", &values), "x: \"Ancestry\"");
    assert_eq!(fill_options("{option:singular:lower}", &values), "ancestry");
    assert_eq!(fill_options("{option:missing}", &values), "{option:missing}");
  }

  #[test]
  fn a_label_that_would_break_the_site_falls_back_to_the_default() {
    let config: Map<String, Value> = serde_json::from_value(json!({
      "deploy": { "modules": { "prefer-ancestries": { "options": {
        "singular": "Lineage's",
        "plural": "Bad\" + alert(1) + \""
      } } } }
    }))
    .unwrap();
    let modules = load_modules(&modules_dir(), &config).unwrap();
    let module = modules.iter().find(|m| m.id == "prefer-ancestries").unwrap();
    assert_eq!(module.values["singular"], json!("Lineage's"));
    assert_eq!(module.values["plural"], json!("Ancestries"));
  }

  #[test]
  fn every_nav_link_option_belongs_to_a_menu() {
    let modules = bundled();
    let nav = modules.iter().find(|m| m.id == "trim-navigation").unwrap();
    assert!(nav.def.options.iter().all(|o| o.group.is_some()));
    // Links hidden before this list grew stay hidden; the new ones stay shown.
    assert_eq!(nav.values["hide-recipes"], json!(true));
    assert_eq!(nav.values["hide-tables"], json!(false));
  }

  #[test]
  fn every_option_a_patch_names_is_declared() {
    for module in bundled() {
      let ids: Vec<&str> = module.def.options.iter().map(|o| o.id.as_str()).collect();
      for entry in &module.def.entries {
        if let Some(id) = entry.option() {
          assert!(ids.contains(&id), "{}: option {id} isn't declared", module.id);
        }
        if let ModuleEntry::Patch { patches, .. } = entry {
          for patch in patches {
            if let Some(id) = &patch.option {
              assert!(ids.contains(&id.as_str()), "{}: option {id} isn't declared", module.id);
            }
            if let Some(id) = &patch.items_option {
              assert!(ids.contains(&id.as_str()), "{}: itemsOption {id} isn't declared", module.id);
            }
            if let Some(replace) = &patch.replace {
              let filled = fill_options(replace, &module.values);
              assert!(!filled.contains("{option:"), "{}: unfilled placeholder in {replace}", module.id);
            }
          }
        }
      }
    }
  }

  #[test]
  fn saved_settings_override_defaults_and_bad_types_fall_back() {
    let config: Map<String, Value> = serde_json::from_value(json!({
      "deploy": { "modules": {
        "shops": { "enabled": true },
        "trim-navigation": { "enabled": true, "options": { "hide-recipes": false, "hide-names": "yes" } }
      } }
    }))
    .unwrap();
    let modules = load_modules(&modules_dir(), &config).unwrap();
    let get = |id: &str| modules.iter().find(|m| m.id == id).unwrap();
    assert!(get("shops").enabled);
    assert_eq!(get("trim-navigation").values["hide-recipes"], json!(false));
    assert_eq!(get("trim-navigation").values["hide-names"], json!(true));
    assert!(!bundled().iter().find(|m| m.id == "shops").unwrap().enabled);
  }

  #[test]
  fn sources_resolve_against_data_options_and_module() {
    let module = Path::new("C:/app/deploy-modules/home-page");
    let data = Path::new("C:/app/data");
    let values: Map<String, Value> =
      serde_json::from_value(json!({
        "file": "{data}/content/home-page.html",
        "empty": " ",
        "relative": "home/index.html",
        "old": "{tools}/local-overrides/index.html"
      }))
      .unwrap();
    assert_eq!(
      resolve_source("{option:file}", module, data, &values),
      Some(data.join("content/home-page.html"))
    );
    assert_eq!(resolve_source("{option:empty}", module, data, &values), None);
    assert_eq!(resolve_source("{option:relative}", module, data, &values), None);
    // The legacy {tools} token is gone; data_folder.rs repoints saved values.
    assert_eq!(resolve_source("{option:old}", module, data, &values), None);
    assert_eq!(resolve_source("{data}/x", module, Path::new(""), &values), None);
    assert_eq!(resolve_source("shops.html", module, data, &values), Some(module.join("shops.html")));
    // A path inside an option's folder.
    assert_eq!(
      resolve_source("{option:file}/../site", module, data, &values),
      Some(data.join("content/home-page.html").join("../site"))
    );
    assert_eq!(resolve_source("{option:empty}/site", module, data, &values), None);
  }

  #[test]
  fn manager_paths_resolve_in_this_repo_directly_and_through_an_option() {
    let module = Path::new("C:/app/deploy-modules/reskin");
    let values: Map<String, Value> =
      serde_json::from_value(json!({ "package": "{manager}/customizer/patch-deploy" })).unwrap();
    let package = source_repo_root().join("customizer/patch-deploy");
    assert_eq!(resolve_source("{manager}/customizer/patch-deploy", module, Path::new(""), &values), Some(package.clone()));
    assert_eq!(
      resolve_source("{option:package}/reskin.patch", module, Path::new(""), &values),
      Some(package.join("reskin.patch"))
    );
    assert!(source_repo_root().join("deploy-modules").is_dir());
  }

  #[test]
  fn data_content_patch_deploy_overrides_manager_customizer_patch_deploy_when_present() {
    let dir = temp_dir("reskin-override");
    let module = Path::new("C:/app/deploy-modules/reskin");
    let values: Map<String, Value> =
      serde_json::from_value(json!({ "package": "{manager}/customizer/patch-deploy" })).unwrap();

    // Without reskin.patch in {data}/content/patch-deploy, resolves to {manager}/customizer/patch-deploy.
    let default_pkg = source_repo_root().join("customizer/patch-deploy");
    assert_eq!(
      resolve_source("{option:package}/reskin.patch", module, &dir, &values),
      Some(default_pkg.join("reskin.patch"))
    );

    // Once {data}/content/patch-deploy/reskin.patch exists, it wins automatically.
    let override_pkg = dir.join("content/patch-deploy");
    fs::create_dir_all(&override_pkg).unwrap();
    fs::write(override_pkg.join("reskin.patch"), "override patch").unwrap();
    assert_eq!(
      resolve_source("{option:package}/reskin.patch", module, &dir, &values),
      Some(override_pkg.join("reskin.patch"))
    );
    assert_eq!(
      resolve_source("{option:package}/site", module, &dir, &values),
      Some(override_pkg.join("site"))
    );
  }

  #[test]
  fn changed_files_follow_the_enabled_modules() {
    let mut modules = bundled();
    let base = changed_files(&modules, Path::new(""));
    assert!(base.contains(&"css/main.css".to_string()));
    assert!(base.contains(&"js/navigation.js".to_string()));
    assert!(!base.contains(&"shops.html".to_string()));
    assert!(!base.iter().any(|f| f.starts_with("node/")));

    modules.iter_mut().for_each(|m| m.enabled = m.id == "shops");
    let shops = changed_files(&modules, Path::new(""));
    assert!(shops.contains(&"shops.html".to_string()));
    assert!(shops.contains(&"data/shops.json".to_string()));
    assert!(!shops.contains(&"js/items.js".to_string()));
  }

  fn write_module(dir: &Path, id: &str, def: Value) {
    fs::create_dir_all(dir.join(id)).unwrap();
    fs::write(dir.join(id).join("module.json"), def.to_string()).unwrap();
  }

  #[test]
  fn a_replaced_module_is_off_while_its_replacer_is_on() {
    let dir = temp_dir("replaces");
    write_module(&dir, "theme", json!({ "title": "Site theme", "defaultEnabled": true }));
    write_module(&dir, "reskin", json!({ "title": "Reskin the site", "replaces": ["theme"] }));
    let config = |on: bool| -> Map<String, Value> {
      serde_json::from_value(json!({ "deploy": { "modules": { "reskin": { "enabled": on }, "theme": { "enabled": true } } } })).unwrap()
    };
    let theme = |on: bool| load_modules(&dir, &config(on)).unwrap().into_iter().find(|m| m.id == "theme").unwrap();

    let replaced = theme(true);
    assert!(!replaced.enabled);
    assert_eq!(replaced.replaced_by.as_deref(), Some("Reskin the site"));
    assert_eq!(view(&replaced).replaced_by.as_deref(), Some("Reskin the site"));

    let back = theme(false);
    assert!(back.enabled);
    assert_eq!(back.replaced_by, None);
  }

  #[test]
  fn changed_files_include_the_served_files_a_diff_changes() {
    let dir = temp_dir("diff-changes");
    write_module(&dir, "reskin", json!({
      "title": "Reskin",
      "defaultEnabled": true,
      "alsoChanges": ["*.html"],
      "entries": [{ "type": "diff", "source": "reskin.patch" }]
    }));
    let patch = "header\ndiff --git a/js/a.js b/js/a.js\n--- a/js/a.js\n+++ b/js/a.js\n\
      diff --git a/node/x.js b/node/x.js\n--- a/node/x.js\n+++ b/node/x.js\n\
      diff --git a/scss/y.scss b/scss/y.scss\n--- a/scss/y.scss\n+++ b/scss/y.scss\n";
    fs::write(dir.join("reskin/reskin.patch"), patch).unwrap();
    let modules = load_modules(&dir, &Map::new()).unwrap();

    let files = changed_files(&modules, Path::new(""));
    assert!(files.contains(&"js/a.js".to_string()), "{files:?}");
    assert!(files.contains(&"*.html".to_string()));
    assert!(!files.iter().any(|f| f.starts_with("node/") || f.starts_with("scss/")), "{files:?}");
    assert_eq!(diff_files(patch), vec!["js/a.js", "node/x.js", "scss/y.scss"]);
  }
}
