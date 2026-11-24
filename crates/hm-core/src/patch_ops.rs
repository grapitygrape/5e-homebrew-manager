//! Pure text-patching primitives used by deploy modules (`find`/`replace`,
//! regex, `contains` line commenting, `insertFile` fenced blocks, and
//! `ensureArrayItems`), plus the shared Rust/TS fixture suite.

use crate::modules::{fill_options, option_allows, PatchSpec};
use regex::Regex;
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::sync::OnceLock;

pub(crate) struct PatchResult {
  pub next: String,
  pub count: usize,
  pub already_satisfied: bool,
}

pub(crate) enum PatchLog {
  Warn(String),
  Error(String),
}

pub(crate) struct PatchBatchOutcome {
  pub content: String,
  pub any_changed: bool,
  pub applied: usize,
  pub skipped: Vec<String>,
  pub details: Vec<String>,
  pub status: String,
  pub logs: Vec<PatchLog>,
  pub fatal: Option<String>,
}

fn comment_line(line: &str) -> (String, bool) {
  if line.trim_start().starts_with("//") {
    return (line.to_string(), false);
  }
  let indent_len = line.len() - line.trim_start().len();
  let indent = &line[..indent_len];
  let body = &line[indent_len..];
  (format!("{indent}// {body}"), true)
}

pub(crate) fn apply_contains_patch(
  content: &str,
  contains: &str,
  is_regex: bool,
  also_comment_next_divider: bool,
  also_comment_next_regex: Option<&str>,
) -> Result<PatchResult, String> {
  let mut lines: Vec<String> = content.split('\n').map(|s| s.to_string()).collect();
  let matcher = if is_regex {
    Some(Regex::new(contains).map_err(|e| e.to_string())?)
  } else {
    None
  };
  let next_matcher = if let Some(pat) = also_comment_next_regex {
    Some(Regex::new(pat).map_err(|e| e.to_string())?)
  } else {
    None
  };

  let mut count = 0;
  let mut matched = 0;
  let mut i = 0;
  while i < lines.len() {
    let is_match = match &matcher {
      Some(re) => re.is_match(&lines[i]),
      None => lines[i].contains(contains),
    };
    if is_match {
      matched += 1;
      let (next_line, changed) = comment_line(&lines[i]);
      if changed {
        lines[i] = next_line;
        count += 1;
      }
      if i + 1 < lines.len() {
        let should_div = also_comment_next_divider && lines[i + 1].contains("_addElement_divider");
        let should_re = next_matcher
          .as_ref()
          .map(|re| re.is_match(&lines[i + 1]))
          .unwrap_or(false);
        if should_div || should_re {
          let (next_commented, next_changed) = comment_line(&lines[i + 1]);
          if next_changed {
            lines[i + 1] = next_commented;
            count += 1;
          }
        }
      }
    }
    i += 1;
  }

  Ok(PatchResult {
    next: lines.join("\n"),
    count,
    already_satisfied: count == 0 && matched > 0,
  })
}

fn backref_regex() -> &'static Regex {
  static RE: OnceLock<Regex> = OnceLock::new();
  RE.get_or_init(|| Regex::new(r"\$(?:\d+|&|<[^>]+>)").unwrap())
}

fn is_already_replaced(content: &str, replace: &str) -> bool {
  if replace.is_empty() {
    return false;
  }
  let segments: Vec<&str> = backref_regex()
    .split(replace)
    .map(str::trim)
    .filter(|s| s.len() >= 8)
    .collect();
  !segments.is_empty() && segments.iter().all(|s| content.contains(s))
}

fn is_insertion_patch(find: &str, replace: &str, is_regex: bool) -> bool {
  if is_regex {
    backref_regex().is_match(replace)
  } else {
    !replace.is_empty() && !find.is_empty() && replace.contains(find)
  }
}

pub(crate) fn apply_text_patch(
  content: &str,
  find: &str,
  replace: &str,
  is_regex: bool,
  flags: Option<&str>,
) -> Result<PatchResult, String> {
  if is_insertion_patch(find, replace, is_regex) && is_already_replaced(content, replace) {
    return Ok(PatchResult {
      next: content.to_string(),
      count: 0,
      already_satisfied: true,
    });
  }

  if is_regex {
    let mut pattern = String::new();
    if let Some(f) = flags {
      if f.contains('i') {
        pattern.push_str("(?i)");
      }
      if f.contains('m') {
        pattern.push_str("(?m)");
      }
      if f.contains('s') {
        pattern.push_str("(?s)");
      }
    }
    pattern.push_str(find);
    let re = Regex::new(&pattern).map_err(|e| e.to_string())?;
    let count = re.find_iter(content).count();
    if count == 0 {
      return Ok(PatchResult {
        next: content.to_string(),
        count: 0,
        already_satisfied: is_already_replaced(content, replace),
      });
    }
    let global = flags.map(|f| f.contains('g')).unwrap_or(true);
    let next = if global {
      re.replace_all(content, replace).to_string()
    } else {
      re.replace(content, replace).to_string()
    };
    Ok(PatchResult {
      next,
      count,
      already_satisfied: false,
    })
  } else {
    let count = content.matches(find).count();
    if count == 0 {
      return Ok(PatchResult {
        next: content.to_string(),
        count: 0,
        already_satisfied: is_already_replaced(content, replace),
      });
    }
    Ok(PatchResult {
      next: content.replace(find, replace),
      count,
      already_satisfied: false,
    })
  }
}

pub(crate) fn apply_insert_file_patch(
  content: &str,
  block: &str,
  marker: &str,
  position: &str,
  find: Option<&str>,
) -> Result<PatchResult, String> {
  let begin_tag = format!("/* === BEGIN {marker} === */");
  let end_tag = format!("/* === END {marker} === */");
  let fenced = format!("{begin_tag}\n{}\n{end_tag}", block.trim_end());

  if let (Some(b_idx), Some(e_idx)) = (content.find(&begin_tag), content.find(&end_tag)) {
    if e_idx > b_idx {
      let existing = &content[b_idx..e_idx + end_tag.len()];
      if existing == fenced {
        return Ok(PatchResult {
          next: content.to_string(),
          count: 0,
          already_satisfied: true,
        });
      }
      let mut next = String::with_capacity(content.len());
      next.push_str(&content[..b_idx]);
      next.push_str(&fenced);
      next.push_str(&content[e_idx + end_tag.len()..]);
      return Ok(PatchResult {
        next,
        count: 1,
        already_satisfied: false,
      });
    }
  }

  if position == "end" {
    return Ok(PatchResult {
      next: format!("{}\n\n{fenced}", content.trim_end()),
      count: 1,
      already_satisfied: false,
    });
  }

  let anchor = find.ok_or_else(|| format!("insertFile position \"{position}\" requires a \"find\" anchor"))?;
  let Some(ix_anchor) = content.find(anchor) else {
    return Ok(PatchResult {
      next: content.to_string(),
      count: 0,
      already_satisfied: false,
    });
  };

  let ix_splice = if position == "after" {
    ix_anchor + anchor.len()
  } else {
    ix_anchor
  };
  Ok(PatchResult {
    next: format!("{}\n{fenced}\n{}", &content[..ix_splice], &content[ix_splice..]),
    count: 1,
    already_satisfied: false,
  })
}

pub(crate) fn ensure_array_items(content: &str, array_key: &str, items: &[String]) -> PatchResult {
  let lines: Vec<&str> = content.split('\n').collect();
  let needle = format!("{array_key}:");
  let Some(idx_start) = lines.iter().position(|l| l.contains(&needle)) else {
    return PatchResult {
      next: content.to_string(),
      count: 0,
      already_satisfied: false,
    };
  };

  let start_line = lines[idx_start];
  let indent_len = start_line.len() - start_line.trim_start().len();
  let arr_indent = format!("{}  ", &start_line[..indent_len]);

  let Some(rel_end) = lines[idx_start + 1..].iter().position(|l| l.contains(']')) else {
    return PatchResult {
      next: content.to_string(),
      count: 0,
      already_satisfied: false,
    };
  };
  let idx_end = idx_start + 1 + rel_end;

  let mut existing = HashSet::new();
  static QUOTE_RE: OnceLock<Regex> = OnceLock::new();
  let quote_re = QUOTE_RE.get_or_init(|| Regex::new(r#""([^"]+)""#).unwrap());
  for line in &lines[idx_start + 1..idx_end] {
    if let Some(cap) = quote_re.captures(line) {
      if let Some(m) = cap.get(1) {
        existing.insert(m.as_str().to_string());
      }
    }
  }

  let missing: Vec<&String> = items.iter().filter(|it| !existing.contains(*it)).collect();
  if missing.is_empty() {
    return PatchResult {
      next: content.to_string(),
      count: 0,
      already_satisfied: true,
    };
  }

  let mut next_lines: Vec<String> = lines[..idx_end].iter().map(|s| (*s).to_string()).collect();
  for it in &missing {
    next_lines.push(format!("{arr_indent}\"{it}\","));
  }
  for line in &lines[idx_end..] {
    next_lines.push((*line).to_string());
  }

  PatchResult {
    next: next_lines.join("\n"),
    count: missing.len(),
    already_satisfied: false,
  }
}

/// Run a sequence of `PatchSpec` entries against one file's text.
pub(crate) fn apply_patch_specs(
  mut content: String,
  target: &str,
  patches: &[PatchSpec],
  values: &Map<String, Value>,
  dry_run: bool,
  read_insert: impl Fn(&str) -> Result<String, String>,
) -> Result<PatchBatchOutcome, String> {
  let mut applied = 0usize;
  let mut skipped = Vec::new();
  let mut details = Vec::new();
  let mut status = "applied".to_string();
  let mut any_changed = false;
  let mut logs = Vec::new();

  for (p_idx, patch) in patches.iter().enumerate() {
    if !option_allows(patch.option.as_deref(), values) {
      continue;
    }
    let label_or_index = || {
      if patch.note.is_empty() {
        format!("patch #{}", p_idx + 1)
      } else {
        patch.note.clone()
      }
    };

    // A later patch can grow what this one inserted, so the insert no longer
    // matches itself; `unlessContains` names a part that stays put.
    if let Some(sentinel) = &patch.unless_contains {
      if content.contains(sentinel.as_str()) {
        applied += 1;
        details.push(format!("Already applied: {}", label_or_index()));
        continue;
      }
    }

    let res = if let Some(insert_file) = &patch.insert_file {
      let marker = patch
        .marker
        .as_deref()
        .ok_or_else(|| format!("Patch {} in {target} missing marker", p_idx + 1))?;
      let position = patch.position.as_deref().unwrap_or("end");
      let block = read_insert(insert_file)?;
      apply_insert_file_patch(&content, &block, marker, position, patch.find.as_deref())?
    } else if let Some(arr_cfg) = &patch.ensure_array_items {
      let from_option = patch
        .items_option
        .as_deref()
        .and_then(|id| values.get(id))
        .and_then(|v| v.as_array())
        .into_iter()
        .flatten()
        .filter_map(Value::as_str);
      let items: Vec<String> = arr_cfg
        .items
        .iter()
        .map(String::as_str)
        .chain(from_option)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
      if items.is_empty() {
        continue;
      }
      ensure_array_items(&content, &arr_cfg.array_key, &items)
    } else if let Some(contains) = &patch.contains {
      apply_contains_patch(
        &content,
        contains,
        patch.is_regex,
        patch.also_comment_next_divider,
        patch.also_comment_next_regex.as_deref(),
      )?
    } else {
      let find = patch.find.as_deref().unwrap_or("");
      let replace = fill_options(patch.replace.as_deref().unwrap_or(""), values);
      apply_text_patch(&content, find, &replace, patch.is_regex, patch.flags.as_deref())?
    };

    if res.count == 0 && res.already_satisfied {
      applied += 1;
      details.push(format!("Already applied: {}", label_or_index()));
      continue;
    }

    if res.count == 0 {
      let label = if patch.note.is_empty() {
        format!("{target} (patch #{})", p_idx + 1)
      } else {
        format!("{target} — {}", patch.note)
      };
      if patch.allow_missing {
        skipped.push(label.clone());
        // release-checks.ts recognises this wording; keep them in step.
        logs.push(PatchLog::Warn(format!("Skipped patch (no match): {label}")));
        details.push(format!("Skipped (no match): {label}"));
        if status != "error" {
          status = "skipped".to_string();
        }
        continue;
      } else {
        let err_msg = format!("Required patch failed to match: {label}");
        logs.push(PatchLog::Error(err_msg.clone()));
        details.push(err_msg.clone());
        status = "error".to_string();
        if !dry_run {
          return Ok(PatchBatchOutcome {
            content,
            any_changed,
            applied,
            skipped,
            details,
            status,
            logs,
            fatal: Some(err_msg),
          });
        }
        continue;
      }
    }

    content = res.next;
    any_changed = true;
    applied += 1;
    details.push(format!("{}: {} match(es)", label_or_index(), res.count));
  }

  Ok(PatchBatchOutcome {
    content,
    any_changed,
    applied,
    skipped,
    details,
    status,
    logs,
    fatal: None,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use std::path::PathBuf;

  /// The TypeScript port in src/lib/engine/deploy-modules checks the same files.
  #[test]
  fn every_shared_fixture_matches_rust() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../src/lib/engine/deploy-modules/fixtures");
    let mut checked = 0;
    for file in fs::read_dir(&dir).unwrap().flatten() {
      let f: Value = serde_json::from_str(&fs::read_to_string(file.path()).unwrap()).unwrap();
      let name = f["name"].as_str().unwrap();
      let target = f["target"].as_str().unwrap();
      let input = f["input"].as_str().unwrap();
      let inserts = f["inserts"].as_object().unwrap();
      let vals: Map<String, Value> = serde_json::from_value(f["values"].clone()).unwrap();
      let patches: Vec<PatchSpec> = serde_json::from_value(f["patches"].clone()).unwrap();

      let outcome = apply_patch_specs(input.to_string(), target, &patches, &vals, false, |insert| {
        inserts
          .get(insert)
          .and_then(Value::as_str)
          .map(String::from)
          .ok_or_else(|| format!("Missing fixture insertFile {insert}"))
      })
      .unwrap();

      // A required miss stops a real run before writing, keeping the input unchanged.
      let (actual_text, actual_status) = if outcome.fatal.is_some() {
        (input, "error")
      } else {
        (outcome.content.as_str(), outcome.status.as_str())
      };
      assert_eq!(actual_text, f["expected"].as_str().unwrap(), "{name}: text");
      assert_eq!(actual_status, f["status"].as_str().unwrap(), "{name}: status");
      checked += 1;
    }
    assert!(checked > 10, "only {checked} fixtures");
  }
}
