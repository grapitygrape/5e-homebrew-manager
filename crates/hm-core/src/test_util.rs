//! Helpers shared by the unit tests.

use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

static NEXT: AtomicUsize = AtomicUsize::new(0);

/// An owned temporary directory that removes itself when dropped.
#[derive(Debug)]
pub struct TempDir(PathBuf);

impl Deref for TempDir {
  type Target = Path;

  fn deref(&self) -> &Path {
    &self.0
  }
}

impl AsRef<Path> for TempDir {
  fn as_ref(&self) -> &Path {
    &self.0
  }
}

impl Drop for TempDir {
  fn drop(&mut self) {
    let _ = std::fs::remove_dir_all(&self.0);
  }
}

/// A fresh, empty directory under the system temp folder. Tests in one run
/// share a process id, so the counter is what keeps their folders apart.
pub fn temp_dir(name: &str) -> TempDir {
  let n = NEXT.fetch_add(1, Ordering::Relaxed);
  let dir = std::env::temp_dir().join(format!("hbm-{name}-{}-{n}", std::process::id()));
  let _ = std::fs::remove_dir_all(&dir);
  std::fs::create_dir_all(&dir).unwrap();
  TempDir(dir)
}
