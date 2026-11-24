//! Blocking sources that a full update adds to the site.
//!
//! Pulling 5e can add official books and adventures, and pulling the homebrew
//! repo can add partnered brews. Each full update records the sources it saw in
//! `known-sources.json`, next to the config. On the next run, a source missing
//! from that list gets a whole-source rule in `content-blocklist.json`, so new
//! content stays hidden until the user unblocks it in Choose Content.
//!
//! Official and partnered sources are recorded separately. A group with no list
//! yet (the first run after setup, or a homebrew repo added since) is only
//! recorded, so nothing already on the site gets blocked.

use serde::{Deserialize, Serialize, Serializer};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

pub const KNOWN_SOURCES_FILE: &str = "known-sources.json";
const BLOCKLIST_FILE: &str = "content-blocklist.json";

/// What the last full update saw. `None` means that group was never recorded.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct KnownSources {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub official: Option<Vec<String>>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub partnered: Option<Vec<String>>,
}

/// One partnered source, with the brew file that declares it.
#[derive(Debug, Clone)]
pub struct PartneredSource {
  pub code: String,
  pub file: String,
}

#[derive(Debug, Default)]
pub struct NewSourcesOutcome {
  /// New sources given a whole-source rule this run.
  pub blocked: Vec<String>,
  /// New sources that already had one.
  pub already_blocked: Vec<String>,
  /// New sources left alone because the user's own homebrew declares or needs them.
  pub kept: Vec<String>,
  /// Groups recorded for the first time, so nothing in them was blocked.
  pub first_seen: Vec<&'static str>,
}

/// Sources of every official book and adventure, from 5e's `data/`.
pub fn official_sources(repo_5e: &Path) -> Result<Vec<String>, String> {
  let mut out = Vec::new();
  for (file, prop) in [("books.json", "book"), ("adventures.json", "adventure")] {
    let path = repo_5e.join("data").join(file);
    let json = read_json(&path)?;
    let list = json
      .get(prop)
      .and_then(Value::as_array)
      .ok_or_else(|| format!("{} has no \"{prop}\" list", path.display()))?;
    out.extend(list.iter().filter_map(|r| r.get("source")?.as_str().map(String::from)));
  }
  Ok(out)
}

/// The partnered brews' sources, from the homebrew repo's `_generated` indexes.
/// `None` when the repo has no indexes to read.
pub fn partnered_sources(repo_homebrew: &Path) -> Option<Vec<PartneredSource>> {
  let generated = repo_homebrew.join("_generated");
  let meta = read_json(&generated.join("index-meta.json")).ok()?;
  let sources = read_json(&generated.join("index-sources.json")).ok()?;
  // Meta is keyed by basename and carries the partnered flag `p`; the source
  // index maps each source code to its file's repo path.
  let partnered: HashSet<&str> = meta
    .as_object()?
    .iter()
    .filter(|(_, entry)| entry.get("p").is_some_and(|p| p.as_bool().unwrap_or_else(|| p.as_i64().is_some_and(|n| n != 0))))
    .map(|(file, _)| file.as_str())
    .collect();
  let mut out: Vec<PartneredSource> = sources
    .as_object()?
    .iter()
    .filter_map(|(code, path)| {
      let file = path.as_str()?.rsplit(['/', '\\']).next()?;
      partnered.contains(file).then(|| PartneredSource { code: code.clone(), file: file.to_string() })
    })
    .collect();
  out.sort_by(|a, b| a.code.cmp(&b.code));
  Some(out)
}

#[derive(Deserialize)]
struct BrewHead {
  #[serde(rename = "_meta")]
  meta: Option<BrewMeta>,
}

#[derive(Deserialize)]
struct BrewMeta {
  #[serde(default)]
  sources: Vec<BrewSource>,
  #[serde(default)]
  dependencies: HashMap<String, Vec<String>>,
  #[serde(default)]
  includes: HashMap<String, Vec<String>>,
}

#[derive(Deserialize)]
struct BrewSource {
  json: Option<String>,
  abbreviation: Option<String>,
}

/// Lowercased source codes the user's own brews declare or pull in, plus their
/// file names. Blocking any of them would hide the user's own content.
pub fn local_sources(brew_dir: &Path, files: &[String]) -> HashSet<String> {
  let mut out = HashSet::new();
  for file in files {
    out.insert(file.to_lowercase());
    let Ok(raw) = fs::read_to_string(brew_dir.join(file)) else {
      continue;
    };
    let Some(meta) = serde_json::from_str::<BrewHead>(&raw).ok().and_then(|h| h.meta) else {
      continue;
    };
    for src in meta.sources {
      if let Some(code) = src.json.or(src.abbreviation) {
        out.insert(code.to_lowercase());
      }
    }
    for code in meta.dependencies.into_values().chain(meta.includes.into_values()).flatten() {
      out.insert(code.to_lowercase());
    }
  }
  out
}

pub fn read_known(path: &Path) -> Result<KnownSources, String> {
  match fs::read_to_string(path) {
    Ok(raw) => serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", path.display())),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(KnownSources::default()),
    Err(e) => Err(format!("{}: {e}", path.display())),
  }
}

/// Block what's new since `known`, then record everything seen. Writes nothing
/// on a dry run. `local_files` are the brew files the site imports.
pub fn block_new_sources(
  known_path: &Path,
  brew_dir: &Path,
  official: Vec<String>,
  partnered: Option<Vec<PartneredSource>>,
  local_files: &[String],
  dry_run: bool,
) -> Result<NewSourcesOutcome, String> {
  let mut known = read_known(known_path)?;
  let mut outcome = NewSourcesOutcome::default();

  let partnered_codes = partnered.as_ref().map(|list| list.iter().map(|p| p.code.clone()).collect::<Vec<_>>());
  let mut fresh = Vec::new();
  for (group, current, recorded) in [
    ("official", Some(&official), &mut known.official),
    ("partnered", partnered_codes.as_ref(), &mut known.partnered),
  ] {
    let Some(current) = current else { continue };
    match recorded {
      None => outcome.first_seen.push(group),
      Some(seen) => {
        let seen: HashSet<String> = seen.iter().map(|s| s.to_lowercase()).collect();
        fresh.extend(current.iter().filter(|s| !seen.contains(&s.to_lowercase())).cloned());
      }
    }
    *recorded = Some(union(recorded.take().unwrap_or_default(), current));
  }
  fresh.sort_by_key(|s| s.to_lowercase());
  fresh.dedup_by(|a, b| a.eq_ignore_ascii_case(b));

  if !fresh.is_empty() {
    let local = local_sources(brew_dir, local_files);
    let file_of: HashMap<String, String> = partnered
      .iter()
      .flatten()
      .map(|p| (p.code.to_lowercase(), p.file.to_lowercase()))
      .collect();
    let (kept, to_block): (Vec<String>, Vec<String>) = fresh.into_iter().partition(|code| {
      let key = code.to_lowercase();
      local.contains(&key) || file_of.get(&key).is_some_and(|f| local.contains(f))
    });
    outcome.kept = kept;
    let blocklist_path = brew_dir.join(BLOCKLIST_FILE);
    let (doc, added, already) = add_source_rules(read_blocklist(&blocklist_path)?, &to_block, now_secs());
    outcome.blocked = added;
    outcome.already_blocked = already;
    if !dry_run && !outcome.blocked.is_empty() {
      write_blocklist(&blocklist_path, &doc)?;
    }
  }

  // Recorded only once the blocklist is safely written, so a failed write is
  // retried next run instead of forgotten.
  if !dry_run {
    let formatted = serde_json::to_string_pretty(&known).map_err(|e| e.to_string())?;
    fs::write(known_path, format!("{formatted}\n")).map_err(|e| format!("{}: {e}", known_path.display()))?;
  }
  Ok(outcome)
}

fn union(mut seen: Vec<String>, current: &[String]) -> Vec<String> {
  let have: HashSet<String> = seen.iter().map(|s| s.to_lowercase()).collect();
  seen.extend(current.iter().filter(|s| !have.contains(&s.to_lowercase())).cloned());
  seen.sort_by_key(|s| s.to_lowercase());
  seen.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
  seen
}

fn read_json(path: &Path) -> Result<Value, String> {
  let raw = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
  serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", path.display()))
}

/// The blocklist file, or a fresh one in the shape Choose Content writes.
fn read_blocklist(path: &Path) -> Result<Value, String> {
  if !path.exists() {
    return Ok(json!({
      "fileType": "content-blocklist",
      "_meta": { "sources": [], "dateAdded": 0, "dateLastModified": 0 },
      "blocklist": [],
    }));
  }
  let doc = read_json(path)?;
  if !doc.get("blocklist").is_some_and(Value::is_array) {
    return Err(format!("{} has no \"blocklist\" list", path.display()));
  }
  Ok(doc)
}

/// Add a whole-source rule for each source that has none. Returns the document
/// and the sources added and already there.
fn add_source_rules(mut doc: Value, sources: &[String], now: u64) -> (Value, Vec<String>, Vec<String>) {
  let (mut added, mut already) = (Vec::new(), Vec::new());
  let Some(list) = doc.get_mut("blocklist").and_then(Value::as_array_mut) else {
    return (doc, added, already);
  };
  let star = |v: &Value, key: &str| v.get(key).and_then(Value::as_str) == Some("*");
  let blocked: HashSet<String> = list
    .iter()
    .filter(|r| star(r, "hash") && star(r, "category"))
    .filter_map(|r| r.get("source")?.as_str().map(str::to_lowercase))
    .collect();
  for source in sources {
    if blocked.contains(&source.to_lowercase()) {
      already.push(source.clone());
      continue;
    }
    // Not isAuto: Choose Content won't let the user remove an auto rule.
    list.push(json!({ "displayName": "*", "hash": "*", "category": "*", "source": source, "isAuto": false }));
    added.push(source.clone());
  }
  if !added.is_empty() {
    if let Some(meta) = doc.get_mut("_meta").and_then(Value::as_object_mut) {
      meta.insert("dateLastModified".into(), json!(now));
    }
  }
  (doc, added, already)
}

/// Write the blocklist like Choose Content does: the old file kept as `.bak`, and
/// keys in 5etools' export order so the diff shows only the new rules.
fn write_blocklist(path: &Path, doc: &Value) -> Result<(), String> {
  if path.exists() {
    let mut bak = path.as_os_str().to_owned();
    bak.push(".bak");
    fs::copy(path, &bak).map_err(|e| format!("backing up {}: {e}", path.display()))?;
  }
  let formatted = serde_json::to_string_pretty(&Ordered(doc)).map_err(|e| e.to_string())?;
  fs::write(path, format!("{formatted}\n")).map_err(|e| format!("{}: {e}", path.display()))
}

// serde_json's map sorts keys, so the file's order is put back by rank. Keys
// not listed keep sorted order after the listed ones.
const KEY_ORDER: &[&str] = &[
  "siteVersion", "fileType", "_meta", "blocklist",
  "sources", "dateAdded", "dateLastModified", "edition",
  "json", "abbreviation", "full", "url", "version",
  "displayName", "hash", "category", "source", "isAuto",
];

struct Ordered<'a>(&'a Value);

impl Serialize for Ordered<'_> {
  fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
    use serde::ser::SerializeMap;
    match self.0 {
      Value::Object(map) => {
        let mut keys: Vec<&String> = map.keys().collect();
        keys.sort_by_key(|k| KEY_ORDER.iter().position(|o| o == k).unwrap_or(KEY_ORDER.len()));
        let mut out = s.serialize_map(Some(keys.len()))?;
        for key in keys {
          out.serialize_entry(key, &Ordered(&map[key]))?;
        }
        out.end()
      }
      Value::Array(items) => s.collect_seq(items.iter().map(Ordered)),
      other => other.serialize(s),
    }
  }
}

fn now_secs() -> u64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;
  use regex::Regex;

  fn codes(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
  }

  fn partnered(list: &[(&str, &str)]) -> Option<Vec<PartneredSource>> {
    Some(list.iter().map(|(code, file)| PartneredSource { code: code.to_string(), file: file.to_string() }).collect())
  }

  fn rules(brew: &Path) -> Vec<String> {
    let doc = read_json(&brew.join(BLOCKLIST_FILE)).unwrap();
    doc["blocklist"]
      .as_array()
      .unwrap()
      .iter()
      .map(|r| format!("{}/{}/{}", r["source"].as_str().unwrap(), r["category"].as_str().unwrap(), r["hash"].as_str().unwrap()))
      .collect()
  }

  const BLOCKLIST: &str = r#"{
  "siteVersion": "2.30.1",
  "fileType": "content-blocklist",
  "_meta": {
    "sources": [
      {
        "json": "blocklist",
        "abbreviation": "blocklist",
        "full": "blocklist",
        "url": "https://example.com/",
        "version": "1.1.0"
      }
    ],
    "dateAdded": 0,
    "dateLastModified": 1,
    "edition": "one"
  },
  "blocklist": [
    {
      "displayName": "Giff",
      "hash": "giff_aag",
      "category": "race",
      "source": "AAG",
      "isAuto": false
    }
  ]
}
"#;

  #[test]
  fn the_first_run_only_records() {
    let dir = temp_dir("first");
    let known = dir.join(KNOWN_SOURCES_FILE);
    let out = block_new_sources(&known, &dir, codes(&["PHB", "AAG"]), partnered(&[("BoET", "Ebon.json")]), &[], false).unwrap();
    assert!(out.blocked.is_empty());
    assert_eq!(out.first_seen, vec!["official", "partnered"]);
    assert!(!dir.join(BLOCKLIST_FILE).exists());
    let saved = read_known(&known).unwrap();
    assert_eq!(saved.official.unwrap(), codes(&["AAG", "PHB"]));
    assert_eq!(saved.partnered.unwrap(), codes(&["BoET"]));
  }

  #[test]
  fn a_later_run_blocks_only_the_new_sources() {
    let dir = temp_dir("later");
    let known = dir.join(KNOWN_SOURCES_FILE);
    fs::write(dir.join(BLOCKLIST_FILE), BLOCKLIST).unwrap();
    fs::write(&known, r#"{ "official": ["PHB", "AAG"], "partnered": ["BoET"] }"#).unwrap();

    let out = block_new_sources(
      &known,
      &dir,
      codes(&["PHB", "aag", "XPHB"]),
      partnered(&[("BoET", "Ebon.json"), ("TLotRR", "Rings.json")]),
      &[],
      false,
    )
    .unwrap();
    assert_eq!(out.blocked, codes(&["TLotRR", "XPHB"]));
    assert_eq!(rules(&dir), vec!["AAG/race/giff_aag", "TLotRR/*/*", "XPHB/*/*"]);
    assert_eq!(read_known(&known).unwrap().official.unwrap(), codes(&["AAG", "PHB", "XPHB"]));

    // The old file is kept, and nothing is blocked twice.
    assert_eq!(fs::read_to_string(dir.join("content-blocklist.json.bak")).unwrap(), BLOCKLIST);
    let again = block_new_sources(&known, &dir, codes(&["PHB", "XPHB"]), None, &[], false).unwrap();
    assert!(again.blocked.is_empty());
  }

  #[test]
  fn the_rewrite_keeps_the_files_key_order() {
    let dir = temp_dir("order");
    let known = dir.join(KNOWN_SOURCES_FILE);
    fs::write(dir.join(BLOCKLIST_FILE), BLOCKLIST).unwrap();
    fs::write(&known, r#"{ "official": ["AAG"] }"#).unwrap();
    block_new_sources(&known, &dir, codes(&["AAG", "XPHB"]), None, &[], false).unwrap();
    let written = fs::read_to_string(dir.join(BLOCKLIST_FILE)).unwrap();
    let rule = "    {\n      \"displayName\": \"*\",\n      \"hash\": \"*\",\n      \"category\": \"*\",\n      \"source\": \"XPHB\",\n      \"isAuto\": false\n    }\n";
    let expected = BLOCKLIST.replace("      \"isAuto\": false\n    }\n", &format!("      \"isAuto\": false\n    }},\n{rule}"));
    let strip = |s: &str| Regex::new(r#""dateLastModified": \d+"#).unwrap().replace(s, "").into_owned();
    assert_eq!(strip(&written), strip(&expected));
  }

  #[test]
  fn a_source_the_users_own_brew_declares_or_needs_is_left_alone() {
    let dir = temp_dir("local");
    let known = dir.join(KNOWN_SOURCES_FILE);
    fs::write(&known, r#"{ "official": [], "partnered": [] }"#).unwrap();
    fs::write(
      dir.join("Mine.json"),
      r#"{ "_meta": { "sources": [{ "json": "MyBook", "full": "Mine" }], "dependencies": { "monster": ["NeededBrew"] } } }"#,
    )
    .unwrap();
    let out = block_new_sources(
      &known,
      &dir,
      codes(&["mybook"]),
      partnered(&[("NeededBrew", "Needed.json"), ("Copied", "Copied.json"), ("Other", "Other.json")]),
      &codes(&["Mine.json", "Copied.json"]),
      false,
    )
    .unwrap();
    assert_eq!(out.kept, codes(&["Copied", "mybook", "NeededBrew"]));
    assert_eq!(out.blocked, codes(&["Other"]));
  }

  #[test]
  fn an_existing_whole_source_rule_counts_as_blocked() {
    let dir = temp_dir("existing");
    let known = dir.join(KNOWN_SOURCES_FILE);
    fs::write(&known, r#"{ "official": [] }"#).unwrap();
    fs::write(
      dir.join(BLOCKLIST_FILE),
      r#"{ "blocklist": [{ "displayName": "*", "hash": "*", "category": "*", "source": "xphb", "isAuto": false }] }"#,
    )
    .unwrap();
    let out = block_new_sources(&known, &dir, codes(&["XPHB"]), None, &[], false).unwrap();
    assert!(out.blocked.is_empty());
    assert_eq!(out.already_blocked, codes(&["XPHB"]));
  }

  #[test]
  fn a_dry_run_reports_without_writing() {
    let dir = temp_dir("dry");
    let known = dir.join(KNOWN_SOURCES_FILE);
    let before = r#"{ "official": ["PHB"] }"#;
    fs::write(&known, before).unwrap();
    let out = block_new_sources(&known, &dir, codes(&["PHB", "XPHB"]), None, &[], true).unwrap();
    assert_eq!(out.blocked, codes(&["XPHB"]));
    assert!(!dir.join(BLOCKLIST_FILE).exists());
    assert_eq!(fs::read_to_string(&known).unwrap(), before);
  }

  #[test]
  fn a_broken_blocklist_fails_and_is_retried_next_run() {
    let dir = temp_dir("broken");
    let known = dir.join(KNOWN_SOURCES_FILE);
    let before = r#"{ "official": ["PHB"] }"#;
    fs::write(&known, before).unwrap();
    fs::write(dir.join(BLOCKLIST_FILE), "{ not json").unwrap();
    assert!(block_new_sources(&known, &dir, codes(&["PHB", "XPHB"]), None, &[], false).is_err());
    assert_eq!(fs::read_to_string(&known).unwrap(), before);
  }

  #[test]
  fn partnered_sources_come_from_the_flagged_files() {
    let repo = temp_dir("partnered");
    fs::create_dir_all(repo.join("_generated")).unwrap();
    fs::write(
      repo.join("_generated/index-meta.json"),
      r#"{ "Ebon.json": { "a": ["BoET"], "p": 1 }, "Plain.json": { "a": ["P"] } }"#,
    )
    .unwrap();
    fs::write(
      repo.join("_generated/index-sources.json"),
      r#"{ "BookOfEbonTides": "book/Ebon.json", "Plain": "spell/Plain.json" }"#,
    )
    .unwrap();
    let found = partnered_sources(&repo).unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!((found[0].code.as_str(), found[0].file.as_str()), ("BookOfEbonTides", "Ebon.json"));
    assert!(partnered_sources(&repo.join("missing")).is_none());
  }
}
