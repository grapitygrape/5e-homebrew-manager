//! Shop lists added to from the site browser.
//!
//! Each shop is `{data folder}/content/shops/<slug>.json`, a 5etools
//! items-sublist with a snapshot of each item (see src/lib/engine/shop-list.ts,
//! which reads and edits the same files for Shops > Lists). An add from the site
//! is written straight away: there's no unsaved editor to join, unlike blocklist
//! rules, and it should stick whether or not the manager's page is open.

use serde::Serialize;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// One add at a time, so two quick clicks can't both read the old file.
static WRITING: Mutex<()> = Mutex::new(());

/// Plenty for a long pinned list; a page can't add more at once.
const MAX_ENTRIES: usize = 2000;

pub(crate) fn shops_dir(data: &Path) -> PathBuf {
  data.join(crate::data_folder::CONTENT_DIR).join("shops")
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ShopSummary {
  pub file: String,
  pub name: String,
  pub count: usize,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Added {
  pub file: String,
  pub name: String,
  /// Entries sent, after dropping any without a hash.
  pub added: usize,
  /// Distinct entries in the shop now.
  pub count: usize,
}

/// A bare `*.json` name, so a page can't write outside the folder.
fn is_shop_file_name(file: &str) -> bool {
  let lower = file.to_ascii_lowercase();
  lower.ends_with(".json")
    && lower.len() > ".json".len()
    && !file.starts_with('.')
    && !file.chars().any(|c| matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
}

fn text(raw: &Value, key: &str) -> Option<String> {
  raw.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

/// The fields a shop entry has, cleaned as the TS `cleanShopEntry` does. None without a hash.
fn clean_entry(raw: &Value) -> Option<Map<String, Value>> {
  let h = text(raw, "h")?;
  let count = match raw.get("c") {
    Some(Value::Number(n)) => n.as_f64(),
    Some(Value::String(s)) => s.trim().parse::<f64>().ok(),
    _ => None,
  };
  let c = count.filter(|n| n.is_finite() && *n >= 1.0).map(|n| n.floor() as u64).unwrap_or(1);
  let mut out = Map::new();
  out.insert("h".into(), json!(h));
  out.insert("c".into(), json!(c));
  for key in ["customHashId", "name", "source"] {
    if let Some(v) = text(raw, key) {
      out.insert(key.into(), json!(v));
    }
  }
  if raw.get("value").and_then(Value::as_f64).is_some_and(|v| v.is_finite() && v >= 0.0) {
    out.insert("value".into(), raw["value"].clone());
  }
  // A spell, with its level. Whether it sells as a scroll or a service, and
  // the cost, are the DM's choices in the manager, so a re-add can't reset them.
  if raw.get("page").and_then(Value::as_str) == Some(SPELLS_PAGE) {
    out.insert("page".into(), json!(SPELLS_PAGE));
    if let Some(level) = raw.get("level").and_then(Value::as_u64).filter(|l| *l <= 9) {
      out.insert("level".into(), json!(level));
    }
  }
  Some(out)
}

const SPELLS_PAGE: &str = "spells.html";

fn entry_key(entry: &Map<String, Value>) -> (String, String, String) {
  let field = |k: &str| entry.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
  (field("page"), field("h"), field("customHashId"))
}

fn sources(items: &[Value]) -> Vec<String> {
  let mut out: Vec<String> = Vec::new();
  for source in items.iter().filter_map(|e| e.get("source").and_then(Value::as_str)) {
    if !out.iter().any(|s| s == source) {
      out.push(source.to_string());
    }
  }
  out
}

/// Add entries; one already stocked adds to its count and takes the new snapshot.
fn merge(items: &mut Vec<Value>, entries: Vec<Map<String, Value>>) {
  for entry in entries {
    let key = entry_key(&entry);
    let have = items.iter_mut().find(|e| e.as_object().map(entry_key).as_ref() == Some(&key));
    match have.and_then(Value::as_object_mut) {
      Some(have) => {
        let total = have.get("c").and_then(Value::as_u64).unwrap_or(1) + entry["c"].as_u64().unwrap_or(1);
        have.extend(entry);
        have.insert("c".into(), json!(total));
      }
      None => items.push(Value::Object(entry)),
    }
  }
}

fn slug(name: &str) -> String {
  let mut out = String::new();
  for c in name.to_lowercase().chars() {
    if c.is_ascii_alphanumeric() {
      out.push(c);
    } else if !out.ends_with('-') {
      out.push('-');
    }
  }
  let trimmed = out.trim_matches('-');
  if trimmed.is_empty() { "shop".into() } else { trimmed.into() }
}

fn shop_files(dir: &Path) -> Vec<String> {
  let Ok(read) = fs::read_dir(dir) else { return Vec::new() };
  read
    .filter_map(Result::ok)
    .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
    .filter_map(|e| e.file_name().into_string().ok())
    .filter(|name| is_shop_file_name(name))
    .collect()
}

/// A file name for a new shop, past any already taken (case-insensitive, as Windows is).
fn new_file_name(name: &str, taken: &[String]) -> String {
  let base = slug(name);
  let used = |f: &str| taken.iter().any(|t| t.eq_ignore_ascii_case(f));
  let mut file = format!("{base}.json");
  let mut n = 2;
  while used(&file) {
    file = format!("{base}-{n}.json");
    n += 1;
  }
  file
}

fn read_shop(path: &Path) -> Result<Map<String, Value>, String> {
  let raw = fs::read_to_string(path).map_err(|e| format!("Could not read {}: {e}", path.display()))?;
  match serde_json::from_str::<Value>(raw.trim_start_matches('\u{feff}')) {
    Ok(Value::Object(map)) => Ok(map),
    Ok(_) => Err(format!("{} is not a shop list.", path.display())),
    Err(e) => Err(format!("{} is not valid JSON: {e}", path.display())),
  }
}

fn display_name(shop: &Map<String, Value>, file: &str) -> String {
  text(&Value::Object(shop.clone()), "name").unwrap_or_else(|| file.trim_end_matches(".json").to_string())
}

/// Every readable shop, by name. One that won't parse is left out of the picker.
pub(crate) fn list_shops(dir: &Path) -> Vec<ShopSummary> {
  let mut out: Vec<ShopSummary> = shop_files(dir)
    .into_iter()
    .filter_map(|file| {
      let shop = read_shop(&dir.join(&file)).ok()?;
      let count = shop.get("items").and_then(Value::as_array).map_or(0, Vec::len);
      Some(ShopSummary { name: display_name(&shop, &file), file, count })
    })
    .collect();
  out.sort_by_key(|s| s.name.to_lowercase());
  out
}

/// Add to the shop in `file`, or to a new shop called `new_name`.
pub(crate) fn add_to_shop(dir: &Path, file: Option<&str>, new_name: Option<&str>, entries: &[Value]) -> Result<Added, String> {
  if entries.len() > MAX_ENTRIES {
    return Err(format!("Too many items at once ({}).", entries.len()));
  }
  let cleaned: Vec<Map<String, Value>> = entries.iter().filter_map(clean_entry).collect();
  if cleaned.is_empty() {
    return Err("Nothing to add.".into());
  }
  let _guard = WRITING.lock().unwrap_or_else(|e| e.into_inner());

  let (file, mut shop) = match (file, new_name.map(str::trim).filter(|n| !n.is_empty())) {
    (Some(file), _) => {
      if !is_shop_file_name(file) {
        return Err(format!("Not a shop file name: {file}"));
      }
      (file.to_string(), read_shop(&dir.join(file))?)
    }
    (None, Some(name)) => {
      let mut shop = Map::new();
      shop.insert("fileType".into(), json!("items-sublist"));
      shop.insert("name".into(), json!(name));
      (new_file_name(name, &shop_files(dir)), shop)
    }
    (None, None) => return Err("Choose a shop, or name a new one.".into()),
  };

  let mut items = shop.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
  let added = cleaned.len();
  merge(&mut items, cleaned);
  shop.insert("sources".into(), json!(sources(&items)));
  shop.insert("fileType".into(), json!("items-sublist"));
  let count = items.len();
  shop.insert("items".into(), Value::Array(items));

  fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
  let path = dir.join(&file);
  if path.exists() {
    let _ = fs::copy(&path, dir.join(format!("{file}.bak")));
  }
  let body = serde_json::to_string_pretty(&Value::Object(shop.clone())).map_err(|e| e.to_string())? + "\n";
  fs::write(&path, body).map_err(|e| format!("Could not write {}: {e}", path.display()))?;
  Ok(Added { name: display_name(&shop, &file), file, added, count })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;

  fn read(dir: &Path, file: &str) -> Value {
    serde_json::from_str(&fs::read_to_string(dir.join(file)).unwrap()).unwrap()
  }

  #[test]
  fn a_new_shop_is_named_and_written_as_an_items_sublist() {
    let root = temp_dir("shops-new");
    let dir = root.join("shops");
    let entries = [json!({ "h": "rope_phb", "c": 2, "name": "Rope", "source": "PHB", "value": 100, "extra": 1 })];
    let added = add_to_shop(&dir, None, Some(" Trollskull Alley Goods "), &entries).unwrap();
    assert_eq!(
      added,
      Added { file: "trollskull-alley-goods.json".into(), name: "Trollskull Alley Goods".into(), added: 1, count: 1 }
    );
    assert_eq!(
      read(&dir, &added.file),
      json!({
        "fileType": "items-sublist",
        "name": "Trollskull Alley Goods",
        "items": [{ "h": "rope_phb", "c": 2, "name": "Rope", "source": "PHB", "value": 100 }],
        "sources": ["PHB"],
      })
    );
  }

  #[test]
  fn adding_an_item_already_stocked_adds_to_its_count_and_keeps_a_backup() {
    let dir = temp_dir("shops-merge");
    fs::write(
      dir.join("goods.json"),
      json!({ "name": "Goods", "keeper": "Bob", "items": [{ "h": "rope_phb", "c": 2 }] }).to_string(),
    )
    .unwrap();
    let entries = [json!({ "h": "rope_phb", "c": 3, "name": "Rope" }), json!({ "h": "torch_phb" }), json!({ "c": 1 })];
    let added = add_to_shop(&dir, Some("goods.json"), None, &entries).unwrap();
    assert_eq!((added.added, added.count), (2, 2));
    let shop = read(&dir, "goods.json");
    assert_eq!(shop["items"], json!([{ "h": "rope_phb", "c": 5, "name": "Rope" }, { "h": "torch_phb", "c": 1 }]));
    assert_eq!(shop["keeper"], "Bob");
    assert_eq!(read(&dir, "goods.json.bak")["items"][0]["c"], 2);
  }

  #[test]
  fn the_same_hash_with_another_custom_hash_id_is_its_own_entry() {
    let dir = temp_dir("shops-custom");
    let entries = [json!({ "h": "horse_mm" }), json!({ "h": "horse_mm", "customHashId": "scaled:5" })];
    assert_eq!(add_to_shop(&dir, None, Some("Stable"), &entries).unwrap().count, 2);
  }

  #[test]
  fn a_spell_keeps_its_page_and_level_and_a_re_add_keeps_the_dms_choices() {
    let dir = temp_dir("shops-spell");
    fs::write(
      dir.join("magic.json"),
      json!({ "name": "Magic", "items": [
        { "h": "light_phb", "c": 1, "page": "spells.html", "as": "spell", "cost": 10 },
        { "h": "light_phb", "c": 1 },
      ] })
      .to_string(),
    )
    .unwrap();
    let spell = json!({ "h": "light_phb", "page": "spells.html", "level": 0, "as": "scroll", "cost": 1 });
    add_to_shop(&dir, Some("magic.json"), None, &[spell]).unwrap();
    let items = read(&dir, "magic.json")["items"].clone();
    // The spell gained one and kept "spell" and its cost; the item with the same hash didn't change.
    assert_eq!(items[0], json!({ "h": "light_phb", "c": 2, "page": "spells.html", "level": 0, "as": "spell", "cost": 10 }));
    assert_eq!(items[1], json!({ "h": "light_phb", "c": 1 }));
  }

  #[test]
  fn a_new_shop_steps_past_a_file_name_in_use() {
    let dir = temp_dir("shops-taken");
    fs::write(dir.join("goods.json"), "{}").unwrap();
    let added = add_to_shop(&dir, None, Some("Goods"), &[json!({ "h": "rope_phb" })]).unwrap();
    assert_eq!(added.file, "goods-2.json");
  }

  #[test]
  fn an_add_needs_a_safe_file_name_or_a_new_name_and_something_to_add() {
    let dir = temp_dir("shops-bad");
    let rope = [json!({ "h": "rope_phb" })];
    assert!(add_to_shop(&dir, Some("../escape.json"), None, &rope).is_err());
    assert!(add_to_shop(&dir, None, Some("  "), &rope).is_err());
    assert!(add_to_shop(&dir, None, Some("Goods"), &[json!({ "c": 1 })]).is_err());
    assert!(add_to_shop(&dir, Some("missing.json"), None, &rope).is_err());
    assert!(!dir.join("escape.json").exists());
  }

  #[test]
  fn the_listing_reads_names_and_counts_and_skips_backups_and_broken_files() {
    let dir = temp_dir("shops-list");
    fs::write(dir.join("b.json"), json!({ "name": "Zed's", "items": [{ "h": "a" }, { "h": "b" }] }).to_string()).unwrap();
    fs::write(dir.join("a.json"), json!({ "items": [] }).to_string()).unwrap();
    fs::write(dir.join("a.json.bak"), "{}").unwrap();
    fs::write(dir.join("broken.json"), "{").unwrap();
    assert_eq!(
      list_shops(&dir),
      vec![
        ShopSummary { file: "a.json".into(), name: "a".into(), count: 0 },
        ShopSummary { file: "b.json".into(), name: "Zed's".into(), count: 2 },
      ]
    );
    assert!(list_shops(&dir.join("absent")).is_empty());
  }

  #[test]
  fn only_bare_json_names_are_shop_files() {
    assert!(is_shop_file_name("goods.json"));
    assert!(is_shop_file_name("Goods.JSON"));
    assert!(!is_shop_file_name("a/goods.json"));
    assert!(!is_shop_file_name("..\\goods.json"));
    assert!(!is_shop_file_name("goods.json.bak"));
    assert!(!is_shop_file_name(".json"));
  }
}
