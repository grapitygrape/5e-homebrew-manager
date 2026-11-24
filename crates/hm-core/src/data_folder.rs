//! The data folder: the folder holding `hbm-config.json`. Beside the config it
//! keeps the user's own files that deploy modules and deploy scripts use, one
//! subfolder per kind, each with a README saying what goes in it. Module
//! sources reach it as `{data}/…`.

use crate::config::config_file_path;
use crate::migrations::migrate_data_folder;
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) const FONTS_DIR: &str = "fonts";
pub(crate) const SCRIPTS_DIR: &str = "scripts";
pub(crate) const CONTENT_DIR: &str = "content";

/// Rewritten whenever the app's copy changes, so they describe this version.
const READMES: &[(&str, &str)] = &[
  ("README.md", include_str!("../../../src-tauri/data-folder/README.md")),
  (".env.example", include_str!("../../../src-tauri/data-folder/.env.example")),
  ("fonts/README.md", include_str!("../../../src-tauri/data-folder/fonts/README.md")),
  ("scripts/README.md", include_str!("../../../src-tauri/data-folder/scripts/README.md")),
  ("content/README.md", include_str!("../../../src-tauri/data-folder/content/README.md")),
];

pub fn data_dir() -> PathBuf {
  data_dir_for(&config_file_path())
}

pub(crate) fn data_dir_for(config_path: &Path) -> PathBuf {
  config_path.parent().map(Path::to_path_buf).unwrap_or_default()
}

/// A font from `fonts/`, for the app's own pages. Missing is not an error: the
/// page falls back to the bundled Nodesto, so it gets no bytes instead.
pub fn read_data_font_bytes(name: &str) -> Result<Vec<u8>, String> {
  read_font(&data_dir(), name)
}

/// Only a bare .woff2 name, so callers can't read anything else through this.
fn read_font(dir: &Path, name: &str) -> Result<Vec<u8>, String> {
  let bare = !name.contains(['/', '\\']) && !name.starts_with('.') && name.ends_with(".woff2");
  if !bare {
    return Err(format!("{name} is not a font file name"));
  }
  match fs::read(dir.join(FONTS_DIR).join(name)) {
    Ok(bytes) => Ok(bytes),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
    Err(e) => Err(format!("Could not read {name} from the data folder's fonts: {e}")),
  }
}

/// Make the subfolders and their READMEs, then run any pending legacy migrations.
/// Problems are logged rather than returned: the app still runs without them.
pub fn prepare() {
  let dir = data_dir();
  if let Err(err) = ensure_layout(&dir) {
    eprintln!("Couldn't set up the data folder {}: {err}", dir.display());
  }
  for problem in migrate_data_folder(&dir) {
    eprintln!("Data folder: {problem}");
  }
}

fn ensure_layout(dir: &Path) -> std::io::Result<()> {
  for sub in [FONTS_DIR, SCRIPTS_DIR, CONTENT_DIR] {
    fs::create_dir_all(dir.join(sub))?;
  }
  for (rel, text) in READMES {
    let path = dir.join(rel);
    if fs::read_to_string(&path).ok().as_deref() != Some(*text) {
      fs::write(&path, text)?;
    }
  }
  Ok(())
}

/// A portable copy that imports the installed copy's settings
/// (`config::import_installed_setup`) takes its files too, or those settings
/// would name scripts and fonts the portable folder doesn't have. Files
/// already in `dir` win.
pub(crate) fn seed_from(installed: &Path, dir: &Path) -> Vec<String> {
  let mut problems = Vec::new();
  // The config is copied on its own; webview data belongs to one copy only.
  copy_missing(installed, dir, &["hbm-config.json", "webview"], &mut problems);
  problems
}

fn copy_missing(from: &Path, to: &Path, skip: &[&str], problems: &mut Vec<String>) {
  let Ok(entries) = fs::read_dir(from) else {
    return;
  };
  for entry in entries.flatten() {
    let name = entry.file_name();
    if skip.iter().any(|s| name == *s) {
      continue;
    }
    let (src, dest) = (entry.path(), to.join(&name));
    if src.is_dir() {
      copy_missing(&src, &dest, &[], problems);
      continue;
    }
    if dest.exists() {
      continue;
    }
    let made = fs::create_dir_all(to);
    if let Err(err) = made.and_then(|()| fs::copy(&src, &dest).map(|_| ())) {
      problems.push(format!("Couldn't copy {} to {}: {err}", src.display(), dest.display()));
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util::temp_dir;

  fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
  }

  #[test]
  fn layout_makes_each_folder_with_its_readme_and_refreshes_a_stale_one() {
    let dir = temp_dir("data-layout");
    write(&dir.join("fonts/README.md"), "old text");
    ensure_layout(&dir).unwrap();
    for (rel, text) in READMES {
      assert_eq!(fs::read_to_string(dir.join(rel)).unwrap(), *text, "{rel}");
    }
    assert!(dir.join("scripts").is_dir() && dir.join("content").is_dir());
  }

  #[test]
  fn seeding_copies_the_installed_files_but_not_its_config_or_webview_data() {
    let root = temp_dir("data-seed");
    let (installed, dir) = (root.join("installed"), root.join("portable/data"));
    write(&installed.join("hbm-config.json"), "{}");
    write(&installed.join(".env"), "TOKEN=x");
    write(&installed.join("scripts/purge.mjs"), "purge");
    write(&installed.join("fonts/modesto-condensed.woff2"), "font");
    write(&installed.join("content/home-page.html"), "installed home");
    write(&installed.join("webview/EBWebView/x"), "browser");
    write(&dir.join("content/home-page.html"), "portable home");

    assert!(seed_from(&installed, &dir).is_empty());

    assert_eq!(fs::read_to_string(dir.join(".env")).unwrap(), "TOKEN=x");
    assert_eq!(fs::read_to_string(dir.join("scripts/purge.mjs")).unwrap(), "purge");
    assert_eq!(fs::read_to_string(dir.join("fonts/modesto-condensed.woff2")).unwrap(), "font");
    assert_eq!(fs::read_to_string(dir.join("content/home-page.html")).unwrap(), "portable home");
    assert!(!dir.join("hbm-config.json").exists());
    assert!(!dir.join("webview").exists());
  }

  #[test]
  fn fonts_are_read_by_bare_name_only_and_a_missing_one_is_empty() {
    let dir = temp_dir("data-font");
    write(&dir.join("fonts/modesto-condensed.woff2"), "font");
    write(&dir.join("secret.woff2"), "not a font");
    assert_eq!(read_font(&dir, "modesto-condensed.woff2").unwrap(), b"font");
    assert!(read_font(&dir, "absent.woff2").unwrap().is_empty());
    for name in ["../secret.woff2", "..\\secret.woff2", "README.md", ".woff2"] {
      assert!(read_font(&dir, name).is_err(), "{name}");
    }
  }
}
