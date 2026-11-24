//! Font Awesome Pro from the Tools source checkout, for the app's own icons.
//! The app ships only Font Awesome Free, so the page asks for these files and
//! keeps the Free icons while the checkout doesn't have them (src/lib/site-icons.ts).

use crate::config::resolve_paths;
use std::fs;
use std::path::Path;

/// The only files the page may ask for, by path in the checkout.
fn site_path(file: &str) -> Option<&'static str> {
  match file {
    "css" => Some("css/fontawesome.css"),
    "font" => Some("fonts/fontawesome/fa-sharp-duotone-regular-400.woff2"),
    _ => None,
  }
}

pub fn read_site_icon_file(file: &str) -> Result<Vec<u8>, String> {
  read_from(&resolve_paths().repo_5e, file)
}

/// No checkout, or no file in it, is not an error: the page gets no bytes and
/// keeps the Free icons.
fn read_from(repo_5e: &Path, file: &str) -> Result<Vec<u8>, String> {
  let rel = site_path(file).ok_or_else(|| format!("{file} is not a site icon file"))?;
  if repo_5e.as_os_str().is_empty() {
    return Ok(Vec::new());
  }
  match fs::read(repo_5e.join(rel)) {
    Ok(bytes) => Ok(bytes),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
    Err(e) => Err(format!("Could not read {rel} from the Tools source: {e}")),
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
  fn reads_only_the_two_icon_files_and_a_missing_one_is_empty() {
    let dir = temp_dir("site-icons");
    write(&dir.join("css/fontawesome.css"), "css");
    write(&dir.join("package.json"), "{}");
    assert_eq!(read_from(&dir, "css").unwrap(), b"css");
    assert!(read_from(&dir, "font").unwrap().is_empty());
    assert!(read_from(Path::new(""), "css").unwrap().is_empty());
    for name in ["package.json", "../css", "css/fontawesome.css"] {
      assert!(read_from(&dir, name).is_err(), "{name}");
    }
  }
}
