//! Embedded Axum HTTP servers:
//! - Candidate preview (`:5050`): serves `repo_5e` with on-the-fly item pricing,
//!   service-worker neutralizer, `no-store` cache headers, optional HTTP Basic Auth
//!   (`HBM_AUTH_USER` / `HBM_AUTH_PASS`), and web-mode `site-browser.js` injection
//!   + `/_hm-site-browser/*` endpoints.
//! - Live published 5etools site (`:8080`): serves the published site root
//!   (`siteDeployFolders[0]` or `/data/site`) with read-only isolation, direct
//!   zero-copy `/img` and `/homebrew-img` mounts, Gzip/Brotli compression,
//!   smart `Cache-Control`, `HBM_SITE_BASE_PATH` support, and a clean placeholder
//!   page before the first Publish.

use crate::config::{read_raw_config, resolve_paths};
use crate::{data_folder, item_prices, modules, site_browser};
use axum::body::Bytes;
use axum::extract::{Path as AxumPath, Request, State};
use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::oneshot;
use tower_http::compression::CompressionLayer;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalServerStatus {
  pub running: bool,
  pub port: u16,
  pub url: String,
  pub root_dir: String,
  pub error: Option<String>,
}

struct ServerHandle {
  status: LocalServerStatus,
  shutdown_tx: Option<oneshot::Sender<()>>,
}

static SERVER_STATE: OnceLock<Arc<Mutex<ServerHandle>>> = OnceLock::new();
static LIVE_SITE_STATE: OnceLock<Arc<Mutex<ServerHandle>>> = OnceLock::new();

/// The deploy modules folder. Set at startup, where the app handle that finds
/// a bundled copy is to hand; `modules_dir()` covers a dev or headless run without it.
static MODULES_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_modules_dir(dir: PathBuf) {
  let _ = MODULES_DIR.set(dir);
}

const B64_ALPHABET: &[u8; 64] =
  b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(input: &[u8]) -> String {
  let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
  for chunk in input.chunks(3) {
    let b0 = chunk[0] as u32;
    let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
    let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
    let triple = (b0 << 16) | (b1 << 8) | b2;
    out.push(B64_ALPHABET[((triple >> 18) & 0x3f) as usize] as char);
    out.push(B64_ALPHABET[((triple >> 12) & 0x3f) as usize] as char);
    if chunk.len() > 1 {
      out.push(B64_ALPHABET[((triple >> 6) & 0x3f) as usize] as char);
    } else {
      out.push('=');
    }
    if chunk.len() > 2 {
      out.push(B64_ALPHABET[(triple & 0x3f) as usize] as char);
    } else {
      out.push('=');
    }
  }
  out
}

pub(crate) fn check_preview_basic_auth(
  auth_header: Option<&str>,
  user: Option<&str>,
  pass: Option<&str>,
) -> bool {
  let user = user.map(str::trim).unwrap_or("");
  let pass = pass.map(str::trim).unwrap_or("");
  if user.is_empty() || pass.is_empty() {
    return true;
  }
  let expected = format!("Basic {}", base64_encode(format!("{user}:{pass}").as_bytes()));
  auth_header.map(str::trim) == Some(expected.as_str())
}

async fn enforce_preview_basic_auth(req: Request, next: Next) -> Response {
  let user = std::env::var("HBM_AUTH_USER").ok();
  let pass = std::env::var("HBM_AUTH_PASS").ok();
  let auth = req
    .headers()
    .get(header::AUTHORIZATION)
    .and_then(|v| v.to_str().ok());
  if !check_preview_basic_auth(auth, user.as_deref(), pass.as_deref()) {
    return (
      StatusCode::UNAUTHORIZED,
      [(
        header::WWW_AUTHENTICATE,
        "Basic realm=\"Homebrew Manager Preview\", charset=\"UTF-8\"",
      )],
      "Authentication required",
    )
      .into_response();
  }
  next.run(req).await
}

/// A request path as a file path under the root, or None for one that could
/// leave it or doesn't decode.
pub(crate) fn decode_path(path: &str) -> Option<String> {
  let bytes = path.trim_start_matches('/').as_bytes();
  let mut out = Vec::with_capacity(bytes.len());
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'%' {
      let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
      out.push(u8::from_str_radix(hex, 16).ok()?);
      i += 3;
    } else {
      out.push(bytes[i]);
      i += 1;
    }
  }
  let rel = String::from_utf8(out).ok()?;
  (!rel.split('/').any(|seg| seg == ".." || seg.contains('\\') || seg.contains(':'))).then_some(rel)
}

/// The served file with the current price list applied, read fresh so the
/// preview follows Shops > Prices and the module's on/off switch.
fn priced_body(root: &Path, rel: &str) -> Option<String> {
  let dir = MODULES_DIR.get().cloned().unwrap_or_else(modules::modules_dir);
  priced_body_with(root, rel, &dir, read_raw_config, data_folder::data_dir)
}

fn priced_body_with(
  root: &Path,
  rel: &str,
  modules_dir: &Path,
  load_config: impl FnOnce() -> serde_json::Map<String, serde_json::Value>,
  load_data_dir: impl FnOnce() -> PathBuf,
) -> Option<String> {
  let module_dir = modules_dir.join(item_prices::MODULE_ID);
  let cached = item_prices::cached_module_def(&module_dir)?;
  let (def, targets) = &*cached;
  if !item_prices::is_served_priced(rel, targets) {
    return None;
  }
  let config = load_config();
  let module = modules::build_module(module_dir, item_prices::MODULE_ID.to_string(), def.clone(), &config);
  let (list, _) = item_prices::module_price_list_for(&module, &load_data_dir())?;
  item_prices::serve_priced(root, rel, &list, targets)
}

async fn price_items(State(root): State<PathBuf>, req: Request, next: Next) -> Response {
  let rel = (req.method() == Method::GET).then(|| decode_path(req.uri().path())).flatten();
  let Some(rel) = rel.filter(|r| r.ends_with(".json")) else { return next.run(req).await };
  match tokio::task::spawn_blocking(move || priced_body(&root, &rel)).await {
    Ok(Some(body)) => ([(header::CONTENT_TYPE, "application/json")], body).into_response(),
    _ => next.run(req).await,
  }
}

/// Served in place of the site's service worker. The site's worker precaches
/// every file cache-first, and a new one waits until every tab on the origin
/// closes, so the preview kept showing old files after Apply or a price
/// change. This one deletes those caches, unregisters itself and reloads pages
/// the old worker served. The reload only happens when there were caches, so
/// the site's register call on the reloaded page can't start a loop.
const PREVIEW_SW: &str = r#"// 5e Homebrew Manager preview: no service worker, so pages always come from disk.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    if (!keys.length) return;
    const pages = await self.clients.matchAll({ type: "window" });
    pages.forEach((page) => page.navigate(page.url));
  })());
});
"#;

fn is_service_worker(path: &str) -> bool {
  path == "/sw.js" || path.ends_with("/sw.js")
}

async fn no_service_worker(req: Request, next: Next) -> Response {
  if req.method() != Method::GET || !is_service_worker(req.uri().path()) {
    return next.run(req).await;
  }
  ([(header::CONTENT_TYPE, "text/javascript")], PREVIEW_SW).into_response()
}

// --- Web-mode site-browser.js injection & /_hm-site-browser/* routes ----------

const SITE_BROWSER_TAG: &str = "<script src=\"/_hm-site-browser/site-browser.js\"></script>";

fn inject_site_browser_html(html: &str) -> String {
  if html.contains("/_hm-site-browser/site-browser.js") {
    return html.to_string();
  }
  if let Some(idx) = html.rfind("</body>") {
    let mut out = String::with_capacity(html.len() + SITE_BROWSER_TAG.len());
    out.push_str(&html[..idx]);
    out.push_str(SITE_BROWSER_TAG);
    out.push_str(&html[idx..]);
    out
  } else {
    format!("{html}\n{SITE_BROWSER_TAG}")
  }
}

async fn inject_site_browser(State(root): State<PathBuf>, req: Request, next: Next) -> Response {
  if req.method() != Method::GET {
    return next.run(req).await;
  }
  let raw_path = req.uri().path();
  if raw_path.starts_with("/_hm-site-browser/") {
    return next.run(req).await;
  }
  let target_rel = if raw_path == "/" || raw_path.is_empty() {
    Some("index.html".to_string())
  } else {
    decode_path(raw_path).filter(|r| r.ends_with(".html"))
  };
  let Some(rel) = target_rel else {
    return next.run(req).await;
  };
  let file_path = root.join(&rel);
  match tokio::fs::read_to_string(&file_path).await {
    Ok(html) => Html(inject_site_browser_html(&html)).into_response(),
    Err(_) => next.run(req).await,
  }
}

async fn serve_site_browser_js() -> Response {
  ([(header::CONTENT_TYPE, "text/javascript; charset=utf-8")], site_browser::SCRIPT).into_response()
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SiteBrowserArgs {
  #[serde(default)]
  packets: Value,
  target_uuid: Option<String>,
  #[serde(default)]
  entries: Vec<Value>,
  file: Option<String>,
  name: Option<String>,
}

async fn handle_site_browser_cmd(AxumPath(cmd): AxumPath<String>, body: Bytes) -> Response {
  let args: SiteBrowserArgs = if body.is_empty() {
    SiteBrowserArgs::default()
  } else {
    match serde_json::from_slice(&body) {
      Ok(a) => a,
      Err(e) => return (StatusCode::BAD_REQUEST, format!("Invalid JSON: {e}")).into_response(),
    }
  };

  let res: Result<Value, String> = match cmd.as_str() {
    "status" => Ok(site_browser::status()),
    "targets" => site_browser::targets(args.packets).await,
    "send" => site_browser::send(args.target_uuid, args.packets).await,
    "blocklist_add" => site_browser::blocklist_add(args.entries).map(|n| json!(n)),
    "shop_list" => Ok(site_browser::shop_list()),
    "shop_add" => site_browser::shop_add(args.file, args.name, args.entries),
    other => Err(format!("Unknown site-browser command: {other}")),
  };

  match res {
    Ok(val) => (StatusCode::OK, Json(val)).into_response(),
    Err(err) => (StatusCode::BAD_REQUEST, err).into_response(),
  }
}

fn state_handle() -> &'static Arc<Mutex<ServerHandle>> {
  SERVER_STATE.get_or_init(|| {
    let paths = resolve_paths();
    let port = paths.local_server_port;
    Arc::new(Mutex::new(ServerHandle {
      status: LocalServerStatus {
        running: false,
        port,
        url: paths.preview_url_for(port),
        root_dir: paths.repo_5e.to_string_lossy().to_string(),
        error: None,
      },
      shutdown_tx: None,
    }))
  })
}

/// The preview site: the checkout from disk, priced, with web-mode site-browser.js, never cached.
fn preview_router(root_dir: &Path) -> Router {
  Router::new()
    .route("/_hm-site-browser/site-browser.js", get(serve_site_browser_js))
    .route("/_hm-site-browser/{cmd}", post(handle_site_browser_cmd))
    .fallback_service(ServeDir::new(root_dir))
    .layer(middleware::from_fn_with_state(root_dir.to_path_buf(), inject_site_browser))
    .layer(middleware::from_fn_with_state(root_dir.to_path_buf(), price_items))
    .layer(middleware::from_fn(no_service_worker))
    .layer(middleware::from_fn(enforce_preview_basic_auth))
    .layer(CorsLayer::permissive())
    .layer(SetResponseHeaderLayer::overriding(
      axum::http::header::CACHE_CONTROL,
      HeaderValue::from_static("no-store, no-cache, must-revalidate"),
    ))
}

pub async fn start_or_restart_local_server(port_override: Option<u16>) -> LocalServerStatus {
  let paths = resolve_paths();
  let port = port_override.unwrap_or(paths.local_server_port);
  let url = paths.preview_url_for(port);
  let root_dir: PathBuf = paths.repo_5e.clone();

  // Shut down existing server if running
  {
    let mut guard = state_handle().lock().unwrap();
    if let Some(tx) = guard.shutdown_tx.take() {
      let _ = tx.send(());
    }
    guard.status.running = false;
  }

  let addr = SocketAddr::from((paths.bind_host, port));
  let listener = match tokio::net::TcpListener::bind(addr).await {
    Ok(l) => l,
    Err(e) => {
      let status = LocalServerStatus {
        running: false,
        port,
        url,
        root_dir: root_dir.to_string_lossy().to_string(),
        error: Some(format!("Port {port} busy or unavailable: {e}")),
      };
      state_handle().lock().unwrap().status = status.clone();
      return status;
    }
  };

  let (tx, rx) = oneshot::channel::<()>();

  let app = preview_router(&root_dir);

  tokio::spawn(async move {
    let _ = axum::serve(listener, app)
      .with_graceful_shutdown(async {
        let _ = rx.await;
      })
      .await;
  });

  let status = LocalServerStatus {
    running: true,
    port,
    url,
    root_dir: root_dir.to_string_lossy().to_string(),
    error: None,
  };

  {
    let mut guard = state_handle().lock().unwrap();
    guard.status = status.clone();
    guard.shutdown_tx = Some(tx);
  }

  status
}

pub async fn get_local_server_status() -> Result<LocalServerStatus, String> {
  Ok(state_handle().lock().unwrap().status.clone())
}

pub async fn restart_local_server(port: Option<u16>) -> Result<LocalServerStatus, String> {
  Ok(start_or_restart_local_server(port).await)
}

// --- Live 5etools Site Server (:8080) ------------------------------------------

const LIVE_SITE_PLACEHOLDER_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Site Not Published Yet — 5e Homebrew Manager</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #121318;
      color: #e5e2dc;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 1.5rem;
    }
    main {
      max-width: 34rem;
      padding: 2rem;
      border: 1px solid #2e313d;
      border-radius: 0.5rem;
      background: #1a1c23;
    }
    h1 { margin: 0 0 0.75rem; font-size: 1.35rem; color: #f0c76e; }
    p { margin: 0 0 0.75rem; line-height: 1.5; color: #b5b2ac; }
    code { color: #e5e2dc; background: #252833; padding: 0.15rem 0.35rem; border-radius: 0.25rem; }
  </style>
</head>
<body>
  <main>
    <h1>5e Homebrew Rules Site Not Published Yet</h1>
    <p>This live site server is running, but no published site was found in the deploy folder yet.</p>
    <p>Open <strong>Homebrew Manager</strong> (port <code>5052</code>), complete <strong>Setup</strong> if needed, and run <strong>Prepare &amp; Publish</strong> on the <strong>Deploy Site</strong> page.</p>
  </main>
</body>
</html>
"#;

/// Smart `Cache-Control` policy for the live player-facing 5etools site (`:8080`):
/// - `.html`, `sw.js`, `homebrew/*.json`: `no-cache`
/// - `.js`, `.css`, `.json`, `.woff2`: `public, max-age=3600`
/// - `/img/*`, `/homebrew-img/*`, image extensions: `public, max-age=86400`
pub(crate) fn live_site_cache_control(uri_path: &str) -> &'static str {
  let lower = uri_path.to_ascii_lowercase();
  if lower == "/"
    || lower.ends_with('/')
    || lower.ends_with(".html")
    || lower == "/sw.js"
    || lower.ends_with("/sw.js")
    || ((lower.starts_with("/homebrew/") || lower.contains("/homebrew/")) && lower.ends_with(".json"))
  {
    return "no-cache";
  }
  if lower.starts_with("/img/")
    || lower.contains("/img/")
    || lower.starts_with("/homebrew-img/")
    || lower.contains("/homebrew-img/")
    || lower.ends_with(".png")
    || lower.ends_with(".jpg")
    || lower.ends_with(".jpeg")
    || lower.ends_with(".webp")
    || lower.ends_with(".gif")
    || lower.ends_with(".svg")
    || lower.ends_with(".ico")
    || lower.ends_with(".avif")
  {
    return "public, max-age=86400";
  }
  if lower.ends_with(".js")
    || lower.ends_with(".mjs")
    || lower.ends_with(".css")
    || lower.ends_with(".json")
    || lower.ends_with(".woff2")
    || lower.ends_with(".woff")
    || lower.ends_with(".ttf")
  {
    return "public, max-age=3600";
  }
  "no-cache"
}

async fn apply_live_cache_headers(req: Request, next: Next) -> Response {
  let policy = live_site_cache_control(req.uri().path());
  let mut res = next.run(req).await;
  res.headers_mut().insert(
    header::CACHE_CONTROL,
    HeaderValue::from_static(policy),
  );
  res
}

async fn UnpublishedPlaceholder(State(site_root): State<PathBuf>, req: Request, next: Next) -> Response {
  if req.method() == Method::GET {
    let p = req.uri().path();
    if (p == "/" || p.ends_with("/index.html")) && !site_root.join("index.html").is_file() {
      return (
        StatusCode::SERVICE_UNAVAILABLE,
        [(header::CACHE_CONTROL, "no-store")],
        Html(LIVE_SITE_PLACEHOLDER_HTML),
      )
        .into_response();
    }
  }
  next.run(req).await
}

fn resolve_live_site_root(paths: &crate::config::ResolvedPaths) -> PathBuf {
  paths
    .site_deploy_folders
    .first()
    .map(|s| s.trim())
    .filter(|s| !s.is_empty())
    .map(PathBuf::from)
    .unwrap_or_else(|| PathBuf::from("/data/site"))
}

pub(crate) fn live_site_router(
  site_root: &Path,
  repo_img: &Path,
  repo_images: &Path,
  base_path: &str,
) -> Router {
  let img_dir = if repo_img.is_dir() {
    repo_img.to_path_buf()
  } else {
    site_root.join("img")
  };
  let homebrew_img_dir = if repo_images.is_dir() {
    repo_images.to_path_buf()
  } else {
    site_root.join("homebrew-img")
  };

  let inner = Router::new()
    .nest_service("/img", ServeDir::new(img_dir))
    .nest_service("/homebrew-img", ServeDir::new(homebrew_img_dir))
    .fallback_service(ServeDir::new(site_root))
    .layer(middleware::from_fn_with_state(site_root.to_path_buf(), UnpublishedPlaceholder))
    .layer(middleware::from_fn(apply_live_cache_headers))
    .layer(CompressionLayer::new());

  let norm_base = crate::config::normalize_base_path(Some(base_path));
  if norm_base == "/" {
    inner
  } else {
    Router::new().nest(&norm_base, inner)
  }
}

fn live_site_handle() -> &'static Arc<Mutex<ServerHandle>> {
  LIVE_SITE_STATE.get_or_init(|| {
    let paths = resolve_paths();
    let port = paths.site_port;
    let root_dir = resolve_live_site_root(&paths);
    Arc::new(Mutex::new(ServerHandle {
      status: LocalServerStatus {
        running: false,
        port,
        url: if !paths.site_url.is_empty() {
          paths.site_url.clone()
        } else {
          format!("http://localhost:{port}{}", if paths.site_base_path == "/" { "" } else { &paths.site_base_path })
        },
        root_dir: root_dir.to_string_lossy().to_string(),
        error: None,
      },
      shutdown_tx: None,
    }))
  })
}

pub async fn start_or_restart_live_site_server(port_override: Option<u16>) -> LocalServerStatus {
  let paths = resolve_paths();
  let port = port_override.unwrap_or(paths.site_port);
  let root_dir = resolve_live_site_root(&paths);
  let url = if !paths.site_url.is_empty() {
    paths.site_url.clone()
  } else {
    format!(
      "http://localhost:{port}{}",
      if paths.site_base_path == "/" { "" } else { &paths.site_base_path }
    )
  };

  {
    let mut guard = live_site_handle().lock().unwrap();
    if let Some(tx) = guard.shutdown_tx.take() {
      let _ = tx.send(());
    }
    guard.status.running = false;
  }

  let addr = SocketAddr::from((paths.bind_host, port));
  let listener = match tokio::net::TcpListener::bind(addr).await {
    Ok(l) => l,
    Err(e) => {
      let status = LocalServerStatus {
        running: false,
        port,
        url,
        root_dir: root_dir.to_string_lossy().to_string(),
        error: Some(format!("Port {port} busy or unavailable: {e}")),
      };
      live_site_handle().lock().unwrap().status = status.clone();
      return status;
    }
  };

  let (tx, rx) = oneshot::channel::<()>();
  let app = live_site_router(&root_dir, &paths.repo_img, &paths.repo_images, &paths.site_base_path);

  tokio::spawn(async move {
    let _ = axum::serve(listener, app)
      .with_graceful_shutdown(async {
        let _ = rx.await;
      })
      .await;
  });

  let status = LocalServerStatus {
    running: true,
    port,
    url,
    root_dir: root_dir.to_string_lossy().to_string(),
    error: None,
  };

  {
    let mut guard = live_site_handle().lock().unwrap();
    guard.status = status.clone();
    guard.shutdown_tx = Some(tx);
  }

  status
}

pub async fn get_live_site_server_status() -> Result<LocalServerStatus, String> {
  Ok(live_site_handle().lock().unwrap().status.clone())
}

#[cfg(test)]
mod tests {
  use super::{
    check_preview_basic_auth, decode_path, is_service_worker, live_site_cache_control,
    live_site_router, preview_router, priced_body_with,
  };
  use crate::modules;
  use crate::test_util::temp_dir;
  use serde_json::{json, Map, Value};
  use std::sync::atomic::{AtomicUsize, Ordering};

  #[tokio::test]
  async fn the_preview_replaces_the_sites_service_worker() {
    let root = temp_dir("preview-sw");
    std::fs::write(root.join("sw.js"), "precacheAndRoute(old)").unwrap();
    std::fs::write(root.join("sw-injector.js"), "injector").unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let serve_root = root.to_path_buf();
    tokio::spawn(async move { axum::serve(listener, preview_router(&serve_root)).await });

    let get = |path: &str| reqwest::get(format!("{url}{path}"));
    let sw = get("/sw.js").await.unwrap();
    assert!(sw.headers()["content-type"].to_str().unwrap().contains("javascript"));
    let sw = sw.text().await.unwrap();
    assert!(sw.contains("unregister()") && !sw.contains("precacheAndRoute"), "{sw}");
    assert_eq!(get("/sw-injector.js").await.unwrap().text().await.unwrap(), "injector");
  }

  #[tokio::test]
  async fn preview_injects_site_browser_script_and_handles_http_commands() {
    let root = temp_dir("preview-site-browser");
    std::fs::write(root.join("index.html"), "<html><body><h1>5etools</h1></body></html>").unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let serve_root = root.to_path_buf();
    tokio::spawn(async move { axum::serve(listener, preview_router(&serve_root)).await });

    let html = reqwest::get(format!("{url}/index.html")).await.unwrap().text().await.unwrap();
    assert!(html.contains("/_hm-site-browser/site-browser.js"), "{html}");

    let js = reqwest::get(format!("{url}/_hm-site-browser/site-browser.js"))
      .await
      .unwrap()
      .text()
      .await
      .unwrap();
    assert!(js.contains("/_hm-site-browser/"), "expected bundled site-browser.js");

    let client = reqwest::Client::new();
    let status_res = client
      .post(format!("{url}/_hm-site-browser/status"))
      .json(&json!({}))
      .send()
      .await
      .unwrap();
    assert_eq!(status_res.status(), 200);
    let status_json: Value = status_res.json().await.unwrap();
    assert!(status_json.get("connected").is_some());
  }

  #[tokio::test]
  async fn live_site_serves_placeholder_when_unpublished_and_mounts_external_images() {
    let site_root = temp_dir("live-site-root");
    let repo_img = temp_dir("live-repo-img");
    let repo_images = temp_dir("live-repo-images");
    std::fs::write(repo_img.join("token.png"), "png-bytes").unwrap();
    std::fs::write(repo_images.join("brew.webp"), "webp-bytes").unwrap();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let app = live_site_router(&site_root, &repo_img, &repo_images, "/");
    tokio::spawn(async move { axum::serve(listener, app).await });

    // Before index.html exists, GET / returns 503 with the clean placeholder page.
    let res = reqwest::get(format!("{url}/")).await.unwrap();
    assert_eq!(res.status(), 503);
    let text = res.text().await.unwrap();
    assert!(text.contains("Site Not Published Yet"));

    // External image directories are served directly at /img/* and /homebrew-img/* with 86400s cache.
    let img_res = reqwest::get(format!("{url}/img/token.png")).await.unwrap();
    assert_eq!(img_res.status(), 200);
    assert_eq!(img_res.headers()["cache-control"], "public, max-age=86400");
    assert_eq!(img_res.text().await.unwrap(), "png-bytes");

    let hb_img_res = reqwest::get(format!("{url}/homebrew-img/brew.webp")).await.unwrap();
    assert_eq!(hb_img_res.status(), 200);
    assert_eq!(hb_img_res.headers()["cache-control"], "public, max-age=86400");
    assert_eq!(hb_img_res.text().await.unwrap(), "webp-bytes");

    // Once index.html is published, GET / returns 200 with no-cache.
    std::fs::write(site_root.join("index.html"), "<html><body>Live 5etools</body></html>").unwrap();
    let live_res = reqwest::get(format!("{url}/")).await.unwrap();
    assert_eq!(live_res.status(), 200);
    assert_eq!(live_res.headers()["cache-control"], "no-cache");
    assert!(live_res.text().await.unwrap().contains("Live 5etools"));
  }

  #[test]
  fn preview_basic_auth_allows_unset_and_validates_credentials() {
    assert!(check_preview_basic_auth(None, None, None));
    assert!(check_preview_basic_auth(None, Some(""), Some("secret")));
    // "gm:secret" in base64 is "Z206c2VjcmV0"
    assert!(!check_preview_basic_auth(None, Some("gm"), Some("secret")));
    assert!(!check_preview_basic_auth(
      Some("Basic d3Jvbmc6cGFzcw=="),
      Some("gm"),
      Some("secret")
    ));
    assert!(check_preview_basic_auth(
      Some("Basic Z206c2VjcmV0"),
      Some("gm"),
      Some("secret")
    ));
  }

  #[test]
  fn live_site_cache_control_follows_asset_tiers() {
    assert_eq!(live_site_cache_control("/"), "no-cache");
    assert_eq!(live_site_cache_control("/items.html"), "no-cache");
    assert_eq!(live_site_cache_control("/sw.js"), "no-cache");
    assert_eq!(live_site_cache_control("/homebrew/index.json"), "no-cache");
    assert_eq!(live_site_cache_control("/js/parser.js"), "public, max-age=3600");
    assert_eq!(live_site_cache_control("/css/main.css"), "public, max-age=3600");
    assert_eq!(live_site_cache_control("/data/items.json"), "public, max-age=3600");
    assert_eq!(live_site_cache_control("/fonts/ custom.woff2"), "public, max-age=3600");
    assert_eq!(live_site_cache_control("/img/bestiary/MM/Goblin.webp"), "public, max-age=86400");
    assert_eq!(live_site_cache_control("/homebrew-img/map.png"), "public, max-age=86400");
  }

  #[test]
  fn only_the_service_worker_script_is_replaced() {
    assert!(is_service_worker("/sw.js"));
    assert!(is_service_worker("/bestiary/sw.js"));
    assert!(!is_service_worker("/sw-injector.js"));
    assert!(!is_service_worker("/js/sw.json"));
  }

  #[test]
  fn decode_path_reads_brew_names_and_refuses_to_leave_the_root() {
    assert_eq!(decode_path("/homebrew/A%3B%20B.json").as_deref(), Some("homebrew/A; B.json"));
    assert_eq!(decode_path("/data/items.json").as_deref(), Some("data/items.json"));
    assert_eq!(decode_path("/homebrew/%2E%2E/x.json"), None);
    assert_eq!(decode_path("/homebrew/..%5Cx.json"), None);
    assert_eq!(decode_path("/C:/x.json"), None);
    assert_eq!(decode_path("/bad%zz.json"), None);
  }

  #[test]
  fn priced_body_skips_config_read_for_non_priced_json_and_prices_targets() {
    let root = temp_dir("preview-price-fastpath");
    let data_dir = root.join("data-folder");
    std::fs::create_dir_all(data_dir.join("content")).unwrap();
    std::fs::write(
      data_dir.join("content/item-prices.json"),
      r#"{"prices": [{"name": "Potion of Healing", "cost": 42}]}"#,
    )
    .unwrap();
    std::fs::create_dir_all(root.join("data")).unwrap();
    std::fs::create_dir_all(root.join("homebrew")).unwrap();
    let item_doc = json!({"item": [{"name": "Potion of Healing", "source": "PHB", "value": 5000}]}).to_string();
    std::fs::write(root.join("data/items.json"), &item_doc).unwrap();
    std::fs::write(root.join("data/bestiary.json"), &item_doc).unwrap();
    std::fs::write(root.join("homebrew/index.json"), &item_doc).unwrap();

    let mods_dir = modules::modules_dir();
    let config_reads = AtomicUsize::new(0);
    let read_cfg = || {
      config_reads.fetch_add(1, Ordering::SeqCst);
      Map::new()
    };

    // Unpriced JSON paths return None without ever reading hbm-config.json.
    assert!(priced_body_with(&root, "data/bestiary.json", &mods_dir, &read_cfg, || data_dir.clone()).is_none());
    assert!(priced_body_with(&root, "homebrew/index.json", &mods_dir, &read_cfg, || data_dir.clone()).is_none());
    assert_eq!(config_reads.load(Ordering::SeqCst), 0);

    // A priced target reads hbm-config.json once and returns the priced JSON.
    let body = priced_body_with(&root, "data/items.json", &mods_dir, &read_cfg, || data_dir.clone()).unwrap();
    assert_eq!(config_reads.load(Ordering::SeqCst), 1);
    let parsed: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(parsed["item"][0]["value"], json!(4200));

    // When the module is turned off in config, None is returned.
    let disabled_cfg: Map<String, Value> =
      serde_json::from_value(json!({"deploy": {"modules": {"item-prices": {"enabled": false}}}})).unwrap();
    assert!(
      priced_body_with(&root, "data/items.json", &mods_dir, || disabled_cfg.clone(), || data_dir.clone()).is_none()
    );
  }
}
