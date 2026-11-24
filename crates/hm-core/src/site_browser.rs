//! Core (Tauri-free) site browser helpers: injected `site-browser.js` script,
//! allowed site origin resolution, Foundry send bridge actions, queued
//! blocklist rules, and shop additions from the site.
//!
//! The desktop Tauri window and capability plugin live in `src-tauri/src/site_browser.rs`
//! and delegate to these functions.

use crate::config::resolve_paths;
use crate::foundry::{send_command, send_status, to_origin};
use crate::runtime::emit_event;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use url::Url;

pub const SCRIPT: &str = include_str!("../../../src-tauri/src/site-browser.js");

/// Tells the app that rules are waiting, with how many.
pub const BLOCKLIST_EVENT: &str = "site-blocklist-added";
/// Tells the app a shop changed, with its file name.
pub const SHOPS_EVENT: &str = "site-shops-changed";

/// Plenty for a mass blocklist of a long list; a page can't queue more at once.
const MAX_RULES: usize = 5000;

static PENDING_RULES: OnceLock<Mutex<Vec<Value>>> = OnceLock::new();

fn pending_rules() -> &'static Mutex<Vec<Value>> {
  PENDING_RULES.get_or_init(Default::default)
}

// --- where it may go ------------------------------------------------------------

/// Settings → Tools URL: `HBM_SITE_URL`, the stored `app.toolsUrl`, or `HBM_TOOLS_URL`.
pub fn tools_url() -> String {
  resolve_paths().site_url
}

pub fn local_url() -> String {
  let paths = resolve_paths();
  paths.preview_url_for(paths.local_server_port)
}

/// The deployed site if one is set, else the local server.
pub fn start_url(tools: &str, local: &str) -> String {
  let tools = tools.trim();
  if to_origin(tools).is_some() {
    tools.to_string()
  } else {
    local.to_string()
  }
}

/// Origins that count as the site: the deployed one and the local server.
pub fn site_origins(tools: &str, local: &str) -> HashSet<String> {
  [tools, local].iter().filter_map(|u| to_origin(u)).collect()
}

/// A web link off the site. Anything else (`blob:` downloads, `about:blank`) stays.
pub fn is_foreign(url: &Url, origins: &HashSet<String>) -> bool {
  matches!(url.scheme(), "http" | "https") && !origins.contains(&url.origin().ascii_serialization())
}

// --- what the page can call -----------------------------------------------------

pub fn status() -> Value {
  send_status()
}

pub async fn targets(packets: Value) -> Result<Value, String> {
  send_command(json!({ "action": "sendTargets", "packets": packets })).await
}

pub async fn send(target_uuid: Option<String>, packets: Value) -> Result<Value, String> {
  send_command(json!({ "action": "send", "targetUuid": target_uuid, "packets": packets })).await
}

// --- blocklist rules from the site ------------------------------------------------

/// Keeps just the fields a blocklist rule has, as strings. None if a key is missing.
pub(crate) fn clean_rule(raw: &Value) -> Option<Value> {
  let field = |key: &str| {
    raw
      .get(key)
      .and_then(Value::as_str)
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .map(str::to_string)
  };
  let (hash, category, source) = (field("hash")?, field("category")?, field("source")?);
  let display_name = field("displayName").unwrap_or_else(|| hash.clone());
  Some(json!({
    "displayName": display_name,
    "hash": hash,
    "category": category,
    "source": source,
    "isAuto": false,
  }))
}

/// Queue blocklist rules added from the site and emit `site-blocklist-added`.
pub fn blocklist_add(entries: Vec<Value>) -> Result<usize, String> {
  if entries.len() > MAX_RULES {
    return Err(format!("Too many rules at once ({}).", entries.len()));
  }
  let rules: Vec<Value> = entries.iter().filter_map(clean_rule).collect();
  let count = rules.len();
  if count > 0 {
    pending_rules().lock().unwrap().extend(rules);
    emit_event(BLOCKLIST_EVENT, &count);
  }
  Ok(count)
}

/// Hands over the queued rules and empties the queue.
pub fn take_site_blocklist_rules() -> Vec<Value> {
  std::mem::take(&mut *pending_rules().lock().unwrap())
}

// --- shop adds from the site -------------------------------------------------------

fn shops_dir() -> std::path::PathBuf {
  crate::shops::shops_dir(&crate::data_folder::data_dir())
}

pub fn shop_list() -> Value {
  json!(crate::shops::list_shops(&shops_dir()))
}

/// Adds to the shop in `file`, or to a new one called `name`, and emits `site-shops-changed`.
pub fn shop_add(file: Option<String>, name: Option<String>, entries: Vec<Value>) -> Result<Value, String> {
  let added = crate::shops::add_to_shop(&shops_dir(), file.as_deref(), name.as_deref(), &entries)?;
  emit_event(SHOPS_EVENT, &added.file);
  Ok(json!(added))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn url(value: &str) -> Url {
    value.parse().unwrap()
  }

  #[test]
  fn starts_on_the_deployed_site_when_there_is_one() {
    let local = "http://localhost:5050";
    assert_eq!(start_url("https://rules.example.com/5e", local), "https://rules.example.com/5e");
    assert_eq!(start_url("", local), local);
    assert_eq!(start_url("not a url", local), local);
  }

  #[test]
  fn both_the_deployed_site_and_the_local_server_count_as_the_site() {
    let origins = site_origins("https://rules.example.com/5e", "http://localhost:5050");
    assert!(origins.contains("https://rules.example.com"));
    assert!(origins.contains("http://localhost:5050"));
    assert_eq!(origins.len(), 2);
    assert_eq!(site_origins("", "http://localhost:5050").len(), 1);
  }

  #[test]
  fn a_rule_from_the_site_keeps_only_its_known_fields() {
    let raw = json!({
      "displayName": "Rope",
      "hash": "rope_phb",
      "category": "item",
      "source": "PHB",
      "isAuto": true,
      "extra": "dropped",
    });
    assert_eq!(
      clean_rule(&raw).unwrap(),
      json!({
        "displayName": "Rope",
        "hash": "rope_phb",
        "category": "item",
        "source": "PHB",
        "isAuto": false,
      }),
    );
  }

  #[test]
  fn a_rule_from_the_site_needs_hash_category_and_source() {
    assert!(clean_rule(&json!({ "hash": "rope_phb", "category": "item" })).is_none());
    assert!(clean_rule(&json!({ "hash": "", "category": "item", "source": "PHB" })).is_none());
    assert!(clean_rule(&json!({ "hash": 3, "category": "item", "source": "PHB" })).is_none());
    let unnamed = clean_rule(&json!({ "hash": "*", "category": "*", "source": "PHB" })).unwrap();
    assert_eq!(unnamed["displayName"], "*");
  }

  #[test]
  fn only_web_links_off_the_site_are_foreign() {
    let origins = site_origins("https://rules.example.com/5e", "http://localhost:5050");
    assert!(!is_foreign(&url("https://rules.example.com/5e/spells.html"), &origins));
    assert!(!is_foreign(&url("http://localhost:5050/items.html"), &origins));
    assert!(is_foreign(&url("https://discord.gg/abc"), &origins));
    // Same host on another port is another site.
    assert!(is_foreign(&url("http://localhost:9999/"), &origins));
    assert!(!is_foreign(&url("about:blank"), &origins));
    assert!(!is_foreign(&url("blob:https://rules.example.com/abc"), &origins));
  }
}
