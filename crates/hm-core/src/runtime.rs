//! Runtime abstractions decoupling `hm-core` from Tauri (`AppHandle` / `resource_dir`).
//!
//! - `EventSink`: callback invoked whenever `hm-core` emits live events
//!   (`pipeline-event`, `setup-progress`, `site-blocklist-added`, `site-shops-changed`).
//!   `src-tauri` forwards to `app.emit(...)`; `hm-backend` broadcasts over SSE.
//! - `ResourcePaths`: runtime resolution for bundled directories (`deploy-modules/`,
//!   `guides/`, `foundry-homebrew-bridge/`, and `{manager}` root), replacing both
//!   `app.path().resource_dir()` and compile-time `CARGO_MANIFEST_DIR` lookups.

use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock, RwLock};

/// Thread-safe callback for emitting named JSON events to the active shell (Tauri IPC or SSE).
pub type EventSink = Arc<dyn Fn(&str, Value) + Send + Sync>;

static EVENT_SINK: OnceLock<RwLock<Option<EventSink>>> = OnceLock::new();
static BUNDLED_RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

fn sink_slot() -> &'static RwLock<Option<EventSink>> {
  EVENT_SINK.get_or_init(|| RwLock::new(None))
}

/// Register the process-wide default event sink (`src-tauri` or `hm-backend`).
pub fn set_event_sink(sink: EventSink) {
  if let Ok(mut guard) = sink_slot().write() {
    *guard = Some(sink);
  }
}

/// Returns the currently registered process-wide event sink, if any.
pub fn current_event_sink() -> Option<EventSink> {
  sink_slot().read().ok().and_then(|g| g.clone())
}

/// Emit a serializable payload to an explicit `sink` if provided, falling back to
/// the process-wide event sink registered via [`set_event_sink`].
pub fn emit_with<T: Serialize>(sink: Option<&EventSink>, event: &str, payload: &T) {
  let Ok(val) = serde_json::to_value(payload) else {
    return;
  };
  if let Some(s) = sink {
    s(event, val);
  } else if let Some(global) = current_event_sink() {
    global(event, val);
  }
}

/// Emit a serializable payload to the process-wide event sink.
pub fn emit_event<T: Serialize>(event: &str, payload: &T) {
  emit_with(None, event, payload);
}

/// Record the bundled resource directory at startup (e.g. `app.path().resource_dir()` in Tauri).
pub fn set_bundled_resource_dir(dir: impl Into<PathBuf>) {
  let _ = BUNDLED_RESOURCE_DIR.set(dir.into());
}

/// The bundled resource directory registered at startup, if any.
pub fn bundled_resource_dir() -> Option<&'static Path> {
  BUNDLED_RESOURCE_DIR.get().map(PathBuf::as_path)
}

fn non_empty_env_path(var: &str) -> Option<PathBuf> {
  std::env::var_os(var)
    .filter(|v| !v.is_empty())
    .map(PathBuf::from)
}

/// Workspace root in a source checkout (two levels above `crates/hm-core`), when present.
pub(crate) fn source_repo_root() -> PathBuf {
  Path::new(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .and_then(Path::parent)
    .map(Path::to_path_buf)
    .unwrap_or_default()
}

/// Choose between a bundled directory and the live repo directory.
/// Debug builds prefer the live repo directory when it exists so edits to
/// `deploy-modules/` or `foundry-homebrew-bridge/` take effect without a Rust rebuild.
pub(crate) fn pick_bundled_or_repo(bundled: Option<PathBuf>, repo: PathBuf, is_debug: bool) -> PathBuf {
  if is_debug && repo.exists() {
    return repo;
  }
  bundled.filter(|d| d.exists()).unwrap_or(repo)
}

/// Resolve a named resource directory (`deploy-modules`, `guides`, `foundry-homebrew-bridge`):
/// 1. Explicit per-directory env var (`HBM_MODULES_DIR`, `HBM_GUIDES_DIR`, `HBM_BRIDGE_DIR`)
/// 2. `HBM_APP_DIR/<name>`
/// 3. Registered `bundled_resource_dir()/<name>` vs source repo `<root>/<name>`
/// 4. `<cwd>/<name>` fallback for headless runs started from the app folder
pub fn resolve_resource_dir(env_var: &str, name: &str) -> PathBuf {
  if let Some(explicit) = non_empty_env_path(env_var).filter(|p| p.exists()) {
    return explicit;
  }
  if let Some(app_dir) = non_empty_env_path("HBM_APP_DIR") {
    let candidate = app_dir.join(name);
    if candidate.exists() {
      return candidate;
    }
  }
  let bundled = bundled_resource_dir().map(|d| d.join(name));
  let repo = source_repo_root().join(name);
  let chosen = pick_bundled_or_repo(bundled, repo, cfg!(debug_assertions));
  if chosen.exists() {
    return chosen;
  }
  if let Ok(cwd) = std::env::current_dir() {
    let cwd_cand = cwd.join(name);
    if cwd_cand.exists() {
      return cwd_cand;
    }
  }
  chosen
}

/// The `deploy-modules/` directory.
pub fn modules_dir() -> PathBuf {
  resolve_resource_dir("HBM_MODULES_DIR", "deploy-modules")
}

/// The bundled `guides/` directory, if it exists on disk.
pub fn guides_dir() -> Option<PathBuf> {
  let dir = resolve_resource_dir("HBM_GUIDES_DIR", "guides");
  dir.exists().then_some(dir)
}

/// The bundled `foundry-homebrew-bridge/` directory, if it exists on disk.
pub fn bridge_dir() -> Option<PathBuf> {
  let dir = resolve_resource_dir("HBM_BRIDGE_DIR", "foundry-homebrew-bridge");
  dir.exists().then_some(dir)
}

/// The app/repo root behind `{manager}`:
/// 1. `HBM_APP_DIR` when set (container/headless)
/// 2. In release builds, the parent of `deploy-modules/` when `module_dir` lives inside one
/// 3. Registered `bundled_resource_dir()` in release builds
/// 4. Source repo root fallback
pub fn manager_dir_for(module_dir: &Path, is_debug: bool) -> PathBuf {
  if let Some(env_dir) = non_empty_env_path("HBM_APP_DIR") {
    return env_dir;
  }
  if !is_debug {
    if let Some(root) = module_dir
      .parent()
      .filter(|p| p.file_name().is_some_and(|n| n == "deploy-modules"))
      .and_then(Path::parent)
    {
      return root.to_path_buf();
    }
    if let Some(res) = bundled_resource_dir() {
      return res.to_path_buf();
    }
  }
  source_repo_root()
}
