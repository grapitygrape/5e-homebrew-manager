//! File I/O for the webview. Backs `src/lib/fs/tauri-fs.ts`, so the frontend's
//! services can run without a Node server. Errors are plain strings carrying
//! the path, because the UI shows them as-is.

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
  name: String,
  is_file: bool,
  is_directory: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  size: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  mtime_ms: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatInfo {
  size: u64,
  mtime_ms: f64,
  is_file: bool,
  is_directory: bool,
}

fn fail(action: &str, path: &str, err: std::io::Error) -> String {
  format!("{action} {path}: {err}")
}

fn modified_ms(meta: &fs::Metadata) -> f64 {
  meta
    .modified()
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| d.as_secs_f64() * 1000.0)
    .unwrap_or(0.0)
}

#[tauri::command]
pub async fn fs_read_text(path: String) -> Result<String, String> {
  tokio::fs::read_to_string(&path).await.map_err(|e| fail("Could not read", &path, e))
}

fn read_many_text_sync(paths: Vec<String>) -> Vec<Option<String>> {
  paths.into_iter().map(|p| fs::read_to_string(p).ok()).collect()
}

#[tauri::command]
pub async fn fs_read_many_text(paths: Vec<String>) -> Result<Vec<Option<String>>, String> {
  tokio::task::spawn_blocking(move || read_many_text_sync(paths))
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_write_text(path: String, text: String) -> Result<(), String> {
  tokio::fs::write(&path, text).await.map_err(|e| fail("Could not write", &path, e))
}

fn read_dir_sync(path: &str) -> Result<Vec<DirEntryInfo>, String> {
  let reader = fs::read_dir(path).map_err(|e| fail("Could not list", path, e))?;
  let mut out = Vec::new();
  for entry in reader {
    let entry = entry.map_err(|e| fail("Could not list", path, e))?;
    let kind = entry.file_type().map_err(|e| fail("Could not list", path, e))?;
    let is_file = kind.is_file();
    let (size, mtime_ms) = if is_file {
      match entry.metadata() {
        Ok(meta) => (Some(meta.len()), Some(modified_ms(&meta))),
        Err(_) => (None, None),
      }
    } else {
      (None, None)
    };
    out.push(DirEntryInfo {
      name: entry.file_name().to_string_lossy().into_owned(),
      is_file,
      is_directory: kind.is_dir(),
      size,
      mtime_ms,
    });
  }
  Ok(out)
}

#[tauri::command]
pub async fn fs_read_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
  tokio::task::spawn_blocking(move || read_dir_sync(&path))
    .await
    .map_err(|e| e.to_string())?
}

/// Unreadable folders are skipped, not fatal, matching the old Node walks.
fn walk(dir: &Path, rel: &str, ext: &str, out: &mut Vec<String>) {
  let Ok(entries) = fs::read_dir(dir) else { return };
  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().into_owned();
    let child_rel = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
    let Ok(kind) = entry.file_type() else { continue };
    if kind.is_dir() {
      walk(&entry.path(), &child_rel, ext, out);
    } else if name.ends_with(ext) {
      out.push(child_rel);
    }
  }
}

fn walk_files(root: &Path, ext: &str) -> Vec<String> {
  let mut out = Vec::new();
  walk(root, "", ext, &mut out);
  out.sort();
  out
}

#[tauri::command]
pub async fn fs_walk_files(root: String, ext: String) -> Result<Vec<String>, String> {
  tokio::task::spawn_blocking(move || walk_files(Path::new(&root), &ext))
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_stat(path: String) -> Result<FileStatInfo, String> {
  let meta = tokio::fs::metadata(&path).await.map_err(|e| fail("Could not stat", &path, e))?;
  Ok(FileStatInfo {
    size: meta.len(),
    mtime_ms: modified_ms(&meta),
    is_file: meta.is_file(),
    is_directory: meta.is_dir(),
  })
}

#[tauri::command]
pub async fn fs_exists(path: String) -> Result<bool, String> {
  Ok(tokio::fs::metadata(&path).await.is_ok())
}

#[tauri::command]
pub async fn fs_mkdir(path: String) -> Result<(), String> {
  tokio::fs::create_dir_all(&path).await.map_err(|e| fail("Could not create", &path, e))
}

#[tauri::command]
pub async fn fs_copy_file(from: String, to: String) -> Result<(), String> {
  tokio::fs::copy(&from, &to)
    .await
    .map(|_| ())
    .map_err(|e| format!("Could not copy {from} to {to}: {e}"))
}

#[tauri::command]
pub async fn fs_rename(from: String, to: String) -> Result<(), String> {
  tokio::fs::rename(&from, &to)
    .await
    .map_err(|e| format!("Could not move {from} to {to}: {e}"))
}

/// The path with links and junctions resolved, without Windows' `\\?\` prefix,
/// so two names for one folder compare equal.
#[tauri::command]
pub async fn fs_real_path(path: String) -> Result<String, String> {
  let real = tokio::fs::canonicalize(&path).await.map_err(|e| fail("Could not resolve", &path, e))?;
  let text = real.to_string_lossy();
  Ok(text.strip_prefix(r"\\?\").unwrap_or(&text).to_string())
}

#[cfg(test)]
mod tests {
  use super::*;
  use hm_core::test_util::temp_dir;

  #[test]
  fn walk_files_returns_sorted_relative_paths_for_one_extension() {
    let root = temp_dir("walk");
    fs::create_dir_all(root.join("b/nested")).unwrap();
    fs::write(root.join("z.json"), "{}").unwrap();
    fs::write(root.join("b/a.json"), "{}").unwrap();
    fs::write(root.join("b/nested/c.json"), "{}").unwrap();
    fs::write(root.join("b/skip.md"), "").unwrap();

    let found = walk_files(&root, ".json");
    assert_eq!(found, vec!["b/a.json", "b/nested/c.json", "z.json"]);
  }

  #[test]
  fn walk_files_on_a_missing_root_is_empty() {
    assert!(walk_files(Path::new("Z:/definitely/not/here"), ".json").is_empty());
  }

  #[test]
  fn read_dir_sync_includes_file_metadata() {
    let root = temp_dir("readdir-meta");
    fs::create_dir_all(root.join("sub")).unwrap();
    fs::write(root.join("a.json"), "{\"ok\":true}").unwrap();

    let entries = read_dir_sync(root.to_str().unwrap()).unwrap();
    let file = entries.iter().find(|e| e.name == "a.json").unwrap();
    assert!(file.is_file && !file.is_directory);
    assert_eq!(file.size, Some(11));
    assert!(file.mtime_ms.unwrap_or(0.0) > 0.0);

    let dir = entries.iter().find(|e| e.name == "sub").unwrap();
    assert!(dir.is_directory && !dir.is_file);
    assert_eq!(dir.size, None);
    assert_eq!(dir.mtime_ms, None);
  }

  #[test]
  fn read_many_text_sync_preserves_order_and_marks_missing_none() {
    let root = temp_dir("readmany");
    let a = root.join("a.txt");
    let b = root.join("missing.txt");
    let c = root.join("c.txt");
    fs::write(&a, "alpha").unwrap();
    fs::write(&c, "gamma").unwrap();

    let out = read_many_text_sync(vec![
      a.to_string_lossy().into_owned(),
      b.to_string_lossy().into_owned(),
      c.to_string_lossy().into_owned(),
    ]);
    assert_eq!(out, vec![Some("alpha".to_string()), None, Some("gamma".to_string())]);
  }
}
