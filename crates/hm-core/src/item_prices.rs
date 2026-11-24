//! Item prices: write the DM's price list into item data on deploy.
//!
//! A port of `priceDocument` in `src/lib/engine/item-prices.ts`, which owns the
//! rules (match, `hbmPrice`, magic variants). Both run the fixtures in
//! `src/lib/engine/__tests__/fixtures/item-prices`, so change them together.
//! Prepare prices the checkout's official data; the site deploy prices the
//! homebrew copies in each deploy folder, never the homebrew authoring folder.
//! The local server prices both as it serves them (`serve_priced`), so the
//! preview follows the price list without a Prepare and the files stay as they are.
//! A brew entry that `_copy`s an item of the same name is priced by that item's
//! rows too: content replacement swaps official items for such copies.

use crate::config::IGNORED_HOMEBREW;
use crate::modules::{read_module_file, resolve_source, DeployModule, ModuleEntry, ModuleFile};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

/// The id of the deploy module that turns pricing on.
pub(crate) const MODULE_ID: &str = "item-prices";

const PRICED_PROPS: &[&str] = &["item", "baseitem", "itemGroup"];

/// The source a row lists to match any source no other row for that name lists.
const ANY_SOURCE: &str = "*";

#[derive(Debug, Clone)]
struct Price {
  cost: f64,
  min: Option<f64>,
  max: Option<f64>,
}

#[derive(Debug, Default)]
pub(crate) struct PriceTable {
  by_key: HashMap<String, Price>,
}

fn key(name: &str, source: &str) -> String {
  format!("{}|{}", name.trim().to_lowercase(), source.trim().to_lowercase())
}

fn number(v: Option<&Value>) -> Option<f64> {
  match v? {
    Value::Number(n) => n.as_f64(),
    Value::String(s) if !s.trim().is_empty() => s.trim().replace(',', "").parse().ok(),
    _ => None,
  }
  .filter(|n: &f64| n.is_finite())
}

fn cp(gp: f64) -> Value {
  Value::from((gp * 100.0).round() as i64)
}

impl PriceTable {
  /// Rows from an `item-prices.json` value; unusable rows are skipped, as the editor does.
  pub(crate) fn from_json(json: &Value) -> PriceTable {
    let rows = json.get("prices").and_then(Value::as_array).or_else(|| json.as_array());
    let mut by_key = HashMap::new();
    for row in rows.into_iter().flatten() {
      let name = row.get("name").and_then(Value::as_str).unwrap_or("").trim();
      let Some(cost) = number(row.get("cost")).filter(|c| *c >= 0.0) else { continue };
      if name.is_empty() {
        continue;
      }
      let price = Price { cost, min: number(row.get("min")), max: number(row.get("max")) };
      for source in sources(row.get("source")) {
        by_key.insert(key(name, &source), price.clone());
      }
    }
    PriceTable { by_key }
  }

  pub(crate) fn load(path: &Path) -> Result<PriceTable, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("Couldn't read {}: {e}", path.display()))?;
    let json: Value = serde_json::from_str(text.trim_start_matches('\u{feff}'))
      .map_err(|e| format!("{} isn't valid JSON: {e}", path.display()))?;
    Ok(PriceTable::from_json(&json))
  }

  pub(crate) fn is_empty(&self) -> bool {
    self.by_key.is_empty()
  }

  /// A row listing the item's source first, then the source it copies, then one with `*`.
  fn lookup(&self, name: &str, source: Option<&str>, copied: Option<&str>) -> Option<&Price> {
    source
      .and_then(|s| self.by_key.get(&key(name, s)))
      .or_else(|| copied.and_then(|s| self.by_key.get(&key(name, s))))
      .or_else(|| self.by_key.get(&key(name, ANY_SOURCE)))
  }
}

/// A row's sources: an array, or (older files) one comma-separated string.
/// None at all means `*`, as `toSources` does in the editor.
fn sources(v: Option<&Value>) -> Vec<String> {
  let parts: Vec<String> = match v {
    Some(Value::Array(list)) => list.iter().filter_map(Value::as_str).map(str::to_string).collect(),
    Some(Value::String(s)) => s.split(',').map(str::to_string).collect(),
    _ => Vec::new(),
  };
  let out: Vec<String> = parts.into_iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
  if out.is_empty() {
    vec![ANY_SOURCE.to_string()]
  } else {
    out
  }
}

fn apply(target: &mut Map<String, Value>, price: &Price) {
  // An existing hbmPrice means this was priced already; keep its original.
  let original = match target.get("hbmPrice") {
    Some(prior) => number(prior.get("original")),
    None => number(target.get("value")),
  };
  let mut meta = Map::new();
  if let Some(min) = price.min {
    meta.insert("min".into(), cp(min));
  }
  if let Some(max) = price.max {
    meta.insert("max".into(), cp(max));
  }
  if let Some(original) = original {
    meta.insert("original".into(), Value::from(original as i64));
  }
  target.insert("value".into(), cp(price.cost));
  target.insert("hbmPrice".into(), Value::Object(meta));
}

/// The source of the item an entry `_copy`s, when that item has the same name.
fn same_name_copy_source(ent: &Map<String, Value>) -> Option<String> {
  let copy = ent.get("_copy")?;
  let name = ent.get("name").and_then(Value::as_str)?;
  let copied = copy.get("name").and_then(Value::as_str)?;
  if copied.trim().to_lowercase() != name.trim().to_lowercase() {
    return None;
  }
  copy.get("source").and_then(Value::as_str).map(str::to_string)
}

/// The value a `_mod` entry sets with setProp (one mod or a list), if any.
fn set_prop_value(m: Option<&Value>) -> Option<&Value> {
  let list = match m? {
    Value::Array(list) => list.iter().collect::<Vec<_>>(),
    one => vec![one],
  };
  list.into_iter().filter(|m| m.get("mode").and_then(Value::as_str) == Some("setProp")).last()?.get("value")
}

fn set_prop(value: Value) -> Value {
  let mut m = Map::new();
  m.insert("mode".into(), Value::from("setProp"));
  m.insert("value".into(), value);
  Value::Object(m)
}

/// Price a `_copy` magic variant through its mods, as `price_document` prices `inherits`.
fn price_variant_copy(copy: &mut Map<String, Value>, price: &Price) {
  let mods = copy.entry("_mod").or_insert_with(|| Value::Object(Map::new()));
  let Some(mods) = mods.as_object_mut() else { return };
  let original = match set_prop_value(mods.get("inherits.hbmPrice")) {
    Some(prior) => number(prior.get("original")),
    None => number(set_prop_value(mods.get("inherits.value"))),
  };
  let mut meta = Map::new();
  if let Some(min) = price.min {
    meta.insert("min".into(), cp(min));
  }
  if let Some(max) = price.max {
    meta.insert("max".into(), cp(max));
  }
  if let Some(original) = original {
    meta.insert("original".into(), Value::from(original as i64));
  }
  meta.insert("plusBase".into(), Value::Bool(true));
  mods.insert("inherits.valueExpression".into(), set_prop(Value::from(format!("[[baseItem.value]] + {}", cp(price.cost)))));
  mods.insert("inherits.value".into(), set_prop(cp(price.cost)));
  mods.insert("inherits.hbmPrice".into(), set_prop(Value::Object(meta)));
  mods.insert("inherits.valueMult".into(), Value::from("remove"));
}

/// Price every matching item in a data or brew document in place. Returns how many changed.
fn price_document(doc: &mut Value, table: &PriceTable) -> usize {
  if table.is_empty() {
    return 0;
  }
  let mut count = 0;
  for prop in PRICED_PROPS {
    let Some(list) = doc.get_mut(*prop).and_then(Value::as_array_mut) else { continue };
    for ent in list.iter_mut().filter_map(Value::as_object_mut) {
      let Some(name) = ent.get("name").and_then(Value::as_str) else { continue };
      let copied = same_name_copy_source(ent);
      let source = ent.get("source").and_then(Value::as_str);
      let Some(price) = table.lookup(name, source, copied.as_deref()).cloned() else { continue };
      apply(ent, &price);
      count += 1;
    }
  }
  if let Some(list) = doc.get_mut("magicvariant").and_then(Value::as_array_mut) {
    for v in list.iter_mut().filter_map(Value::as_object_mut) {
      let Some(name) = v.get("name").and_then(Value::as_str).map(str::to_string) else { continue };
      let copied = same_name_copy_source(v);
      if !v.get("inherits").is_some_and(Value::is_object) {
        // A brew variant copying an official one: its inherits only exist after the copy.
        let source = v.get("source").and_then(Value::as_str);
        let Some(copied) = copied.as_deref() else { continue };
        let Some(price) = table.lookup(&name, source, Some(copied)).cloned() else { continue };
        let Some(copy) = v.get_mut("_copy").and_then(Value::as_object_mut) else { continue };
        price_variant_copy(copy, &price);
        count += 1;
        continue;
      }
      let Some(inherits) = v.get_mut("inherits").and_then(Value::as_object_mut) else { continue };
      let source = inherits.get("source").and_then(Value::as_str);
      let Some(price) = table.lookup(&name, source, copied.as_deref()).cloned() else { continue };
      // A specific variant costs its base item plus the variant's price. `value`
      // stays as the generic variant's own price and the fallback for a base
      // item with no value; serde_json sorts keys, so the expression comes after it.
      inherits.remove("valueExpression");
      inherits.remove("valueMult");
      apply(inherits, &price);
      inherits.insert("valueExpression".into(), Value::from(format!("[[baseItem.value]] + {}", cp(price.cost))));
      if let Some(meta) = inherits.get_mut("hbmPrice").and_then(Value::as_object_mut) {
        meta.insert("plusBase".into(), Value::Bool(true));
      }
      count += 1;
    }
  }
  count
}

/// A document's text with prices applied, and how many changed. None when nothing matched.
fn price_text(text: &str, table: &PriceTable) -> Result<Option<(String, usize)>, String> {
  let mut doc: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e| e.to_string())?;
  let count = price_document(&mut doc, table);
  if count == 0 {
    return Ok(None);
  }
  Ok(Some((serde_json::to_string(&doc).map_err(|e| e.to_string())?, count)))
}

/// Price one JSON file in place. A file with nothing to price isn't rewritten.
pub(crate) fn price_file(path: &Path, table: &PriceTable) -> Result<usize, String> {
  let text = fs::read_to_string(path).map_err(|e| format!("Couldn't read {}: {e}", path.display()))?;
  match price_text(&text, table).map_err(|e| format!("{} isn't valid JSON: {e}", path.display()))? {
    Some((out, count)) => {
      fs::write(path, out).map_err(|e| format!("Couldn't write {}: {e}", path.display()))?;
      Ok(count)
    }
    None => Ok(0),
  }
}

/// Site files the module's `prices` entries target.
fn price_targets(def: &ModuleFile) -> Vec<String> {
  def
    .entries
    .iter()
    .filter_map(|e| match e {
      ModuleEntry::Prices { target, .. } => Some(target.clone()),
      _ => None,
    })
    .collect()
}

/// The price list (when one is saved) and targets for a single `item-prices` module.
/// None when the module is off or has no saved price list.
pub(crate) fn module_price_list_for(module: &DeployModule, data_dir: &Path) -> Option<(PathBuf, Vec<String>)> {
  if !module.enabled {
    return None;
  }
  let mut first_source: Option<&str> = None;
  let mut targets = Vec::new();
  for entry in &module.def.entries {
    if let ModuleEntry::Prices { source, target, .. } = entry {
      if first_source.is_none() {
        first_source = Some(source.as_str());
      }
      targets.push(target.clone());
    }
  }
  let list = first_source
    .and_then(|s| resolve_source(s, &module.dir, data_dir, &module.values))
    .filter(|p| p.is_file())?;
  Some((list, targets))
}

/// The enabled Item prices module's price list (when one is saved) and the
/// site files its `prices` entries target. None when the module is off.
pub(crate) fn module_price_list(modules: &[DeployModule], data_dir: &Path) -> Option<(PathBuf, Vec<String>)> {
  let module = modules.iter().find(|m| m.id == MODULE_ID)?;
  module_price_list_for(module, data_dir)
}

/// Cached `item-prices/module.json` and its targets, refreshed if the manifest changes.
static MODULE_DEF_CACHE: Mutex<Option<(PathBuf, SystemTime, Arc<(ModuleFile, Vec<String>)>)>> = Mutex::new(None);

pub(crate) fn cached_module_def(module_dir: &Path) -> Option<Arc<(ModuleFile, Vec<String>)>> {
  let file = module_dir.join("module.json");
  let modified = fs::metadata(&file).and_then(|m| m.modified()).ok()?;
  let mut cache = MODULE_DEF_CACHE.lock().unwrap_or_else(|e| e.into_inner());
  if let Some((path, at, entry)) = cache.as_ref() {
    if path == &file && *at == modified {
      return Some(entry.clone());
    }
  }
  let def = read_module_file(module_dir).ok()??;
  let targets = price_targets(&def);
  let entry = Arc::new((def, targets));
  *cache = Some((file, modified, entry.clone()));
  Some(entry)
}

/// Brews the site loads from `homebrew/`, beside the targets: not its bookkeeping files.
pub(crate) fn is_served_priced(rel: &str, targets: &[String]) -> bool {
  if targets.iter().any(|t| t == rel) {
    return true;
  }
  let Some(name) = rel.strip_prefix("homebrew/") else { return false };
  name.ends_with(".json") && !name.contains('/') && !IGNORED_HOMEBREW.contains(&name)
}

/// The last list read, kept until the file changes: a page load fetches many brews.
static TABLE_CACHE: Mutex<Option<(PathBuf, SystemTime, Arc<PriceTable>)>> = Mutex::new(None);

fn cached_table(list: &Path) -> Result<Arc<PriceTable>, String> {
  let modified = fs::metadata(list).and_then(|m| m.modified()).map_err(|e| e.to_string())?;
  let mut cache = TABLE_CACHE.lock().unwrap_or_else(|e| e.into_inner());
  if let Some((path, at, table)) = cache.as_ref() {
    if path == list && *at == modified {
      return Ok(table.clone());
    }
  }
  let table = Arc::new(PriceTable::load(list)?);
  *cache = Some((list.to_path_buf(), modified, table.clone()));
  Ok(table)
}

/// For the local server: the site file at `rel` (a decoded path under `root`)
/// with prices applied, when it's one the module prices and something in it
/// matches. None means serve the file as it is.
pub(crate) fn serve_priced(root: &Path, rel: &str, list: &Path, targets: &[String]) -> Option<String> {
  if !is_served_priced(rel, targets) {
    return None;
  }
  let table = cached_table(list).ok()?;
  let text = fs::read_to_string(root.join(rel)).ok()?;
  // A brew that isn't valid JSON goes out unchanged; the site reports it.
  price_text(&text, &table).ok().flatten().map(|(out, _)| out)
}

/// Price every brew in a folder. Returns (files changed, items priced) and one
/// message per file that couldn't be read, so one bad brew doesn't stop the rest.
pub(crate) fn price_homebrew_dir(dir: &Path, table: &PriceTable) -> (usize, usize, Vec<String>) {
  let (mut files, mut items, mut errors) = (0, 0, Vec::new());
  let Ok(entries) = fs::read_dir(dir) else { return (0, 0, errors) };
  for entry in entries.flatten() {
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();
    if !path.is_file() || !name.ends_with(".json") || IGNORED_HOMEBREW.contains(&name.as_str()) {
      continue;
    }
    match price_file(&path, table) {
      Ok(0) => {}
      Ok(n) => {
        files += 1;
        items += n;
      }
      Err(e) => errors.push(e),
    }
  }
  (files, items, errors)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;
  use serde_json::json;

  const PRICES: &str = include_str!("../../../src/lib/engine/__tests__/fixtures/item-prices/prices.json");
  const INPUT: &str = include_str!("../../../src/lib/engine/__tests__/fixtures/item-prices/input.json");
  const EXPECTED: &str = include_str!("../../../src/lib/engine/__tests__/fixtures/item-prices/expected.json");

  fn table() -> PriceTable {
    PriceTable::from_json(&serde_json::from_str(PRICES).unwrap())
  }

  #[test]
  fn matches_the_shared_fixture() {
    let expected: Value = serde_json::from_str(EXPECTED).unwrap();
    let mut doc: Value = serde_json::from_str(INPUT).unwrap();
    let count = price_document(&mut doc, &table());
    assert_eq!(doc, expected["doc"]);
    assert_eq!(count as u64, expected["count"].as_u64().unwrap());
  }

  #[test]
  fn pricing_twice_keeps_the_first_original() {
    let expected: Value = serde_json::from_str(EXPECTED).unwrap();
    let mut doc: Value = serde_json::from_str(INPUT).unwrap();
    price_document(&mut doc, &table());
    price_document(&mut doc, &table());
    assert_eq!(doc, expected["doc"]);
  }

  #[test]
  fn a_listed_source_beats_another_rows_wildcard() {
    let table = PriceTable::from_json(&json!({"prices": [
      {"name": "Wand", "source": ["DMG", "XDMG", "*"], "cost": 10},
      {"name": "Wand", "source": "GGR, ERLW", "cost": 20}
    ]}));
    let cost = |s| table.lookup("wand", Some(s), None).map(|p| p.cost);
    assert_eq!((cost("xdmg"), cost("ERLW"), cost("TCE")), (Some(10.0), Some(20.0), Some(10.0)));
  }

  #[test]
  fn serve_priced_prices_brews_and_targets_without_touching_the_files() {
    let root = temp_dir("item-prices-serve");
    let list = root.join("item-prices.json");
    fs::write(&list, PRICES).unwrap();
    fs::create_dir_all(root.join("homebrew")).unwrap();
    fs::create_dir_all(root.join("data")).unwrap();
    let brew = json!({"item": [{"name": "Potion of Healing", "source": "X", "value": 1}]}).to_string();
    for rel in ["homebrew/A; B.json", "homebrew/index.json", "data/items.json", "data/other.json"] {
      fs::write(root.join(rel), &brew).unwrap();
    }
    let targets = vec!["data/items.json".to_string()];
    let served = |rel: &str| serve_priced(&root, rel, &list, &targets);

    let priced: Value = serde_json::from_str(&served("homebrew/A; B.json").unwrap()).unwrap();
    assert_eq!(priced["item"][0]["value"], json!(5000));
    assert!(served("data/items.json").is_some());
    assert_eq!((served("homebrew/index.json"), served("data/other.json")), (None, None));
    assert_eq!(fs::read_to_string(root.join("homebrew/A; B.json")).unwrap(), brew);

    // A saved change shows on the next request.
    fs::write(&list, r#"{"prices": [{"name": "Potion of Healing", "cost": 7}]}"#).unwrap();
    let later = fs::metadata(&list).unwrap().modified().unwrap() + std::time::Duration::from_secs(2);
    fs::File::options().write(true).open(&list).unwrap().set_modified(later).unwrap();
    let priced: Value = serde_json::from_str(&served("homebrew/A; B.json").unwrap()).unwrap();
    assert_eq!(priced["item"][0]["value"], json!(700));
  }

  #[test]
  fn price_file_leaves_unmatched_files_alone() {
    let dir = temp_dir("item-prices");
    let path = dir.join("brew.json");
    let original = "{\n\t\"item\": [{\"name\": \"Torch\", \"source\": \"PHB\", \"value\": 1}]\n}";
    fs::write(&path, original).unwrap();
    assert_eq!(price_file(&path, &table()).unwrap(), 0);
    assert_eq!(fs::read_to_string(&path).unwrap(), original);
  }

  #[test]
  fn price_homebrew_dir_skips_bookkeeping_and_reports_bad_files() {
    let dir = temp_dir("item-prices-dir");
    fs::write(dir.join("a.json"), json!({"item": [{"name": "Potion of Healing", "source": "X", "value": 1}]}).to_string()).unwrap();
    fs::write(dir.join("index.json"), json!({"item": [{"name": "Potion of Healing"}]}).to_string()).unwrap();
    fs::write(dir.join("bad.json"), "{nope").unwrap();
    let (files, items, errors) = price_homebrew_dir(&dir, &table());
    assert_eq!((files, items, errors.len()), (1, 1, 1));
    let a: Value = serde_json::from_str(&fs::read_to_string(dir.join("a.json")).unwrap()).unwrap();
    assert_eq!(a["item"][0]["value"], json!(5000));
    assert!(fs::read_to_string(dir.join("index.json")).unwrap().contains("Potion"));
    assert!(!fs::read_to_string(dir.join("index.json")).unwrap().contains("hbmPrice"));
  }
}
