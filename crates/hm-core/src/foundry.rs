//! The Foundry bridge for the desktop and headless builds, on its own embedded axum server.
//!
//! The `foundry-homebrew-bridge` module opens an SSE stream here and POSTs its
//! answers back; the UI pushes queries with `foundry_ask`, actions
//! (open a sheet) with `foundry_command`, and reads `foundry_status`. Same wire
//! contract as the Node routes under src/routes/api/foundry (see
//! src/lib/engine/foundry/types.ts). The module connects to this port and the
//! dev server's by default, so neither needs configuring.
//!
//! It isn't mounted on the :5050 site server: that one sends permissive CORS
//! and gets restarted from the sidebar, which would drop every world. Here the
//! allowed origins are exactly Settings → Foundry URL, as in hooks.server.ts.
//!
//! This only carries messages. Building candidates and the report stays in TS
//! (services/foundry-check-service.ts), shared with the Node route.

use crate::config::{read_raw_config, resolve_paths};
use axum::body::Bytes;
use axum::extract::{Query, Request};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_core::Stream;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::task::{Context, Poll};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::{mpsc, oneshot};

/// Keepalive cadence. Proxies commonly cull idle connections around 60s.
const PING_SECS: u64 = 25;
/// How long `ask` waits for a bridge to answer before giving up.
const ASK_TIMEOUT_SECS: u64 = 90;
/// Opening a sheet is instant; waiting longer only hides a module too old to answer.
const COMMAND_TIMEOUT_SECS: u64 = 15;
/// A pile of loot imports one item at a time.
const SEND_TIMEOUT_SECS: u64 = 180;
/// A live world answers a ping at once; a short wait means "gone" shows quickly.
const PING_TIMEOUT_SECS: u64 = 5;
/// A refusal older than this has stopped retrying, so it's no longer news.
const REFUSED_TTL_MS: u64 = 10 * 60 * 1000;
const DISCONNECTED: &str = "The Foundry bridge disconnected mid-check.";
const GONE: &str = "That Foundry world is no longer connected.";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
  client_id: String,
  world: String,
  world_id: String,
  system: String,
  system_version: String,
  foundry_version: String,
  user: String,
  /// Epoch ms.
  connected_at: u64,
  origin: String,
  module_version: String,
  features: Vec<String>,
  /// What the world enforces, once its module reports it (1.3.0+).
  #[serde(skip_serializing_if = "Option::is_none")]
  enforcement: Option<Value>,
}

struct Client {
  info: ClientInfo,
  tx: mpsc::UnboundedSender<Event>,
}

struct Pending {
  client_id: String,
  tx: oneshot::Sender<Result<Value, String>>,
}

#[derive(Default)]
struct Bridge {
  clients: HashMap<String, Client>,
  pending: HashMap<String, Pending>,
}

static BRIDGE: OnceLock<Mutex<Bridge>> = OnceLock::new();

fn bridge() -> MutexGuard<'static, Bridge> {
  BRIDGE.get_or_init(Default::default).lock().unwrap()
}

/// Where the server ended up, for the status command: (url, bind error).
static SERVER: OnceLock<Mutex<(String, Option<String>)>> = OnceLock::new();

fn server_info() -> MutexGuard<'static, (String, Option<String>)> {
  SERVER.get_or_init(Default::default).lock().unwrap()
}

fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

fn new_id() -> String {
  uuid::Uuid::new_v4().to_string()
}

// --- the registry -------------------------------------------------------------

/// The SSE body for one bridge. Dropping it (the tab closed, the network went)
/// removes the client and fails whatever was waiting on it.
struct ClientStream {
  client_id: String,
  rx: mpsc::UnboundedReceiver<Event>,
}

impl Stream for ClientStream {
  type Item = Result<Event, Infallible>;

  fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
    self.rx.poll_recv(cx).map(|event| event.map(Ok))
  }
}

impl Drop for ClientStream {
  fn drop(&mut self) {
    drop_client(&self.client_id);
  }
}

fn drop_client(client_id: &str) {
  let mut b = bridge();
  b.clients.remove(client_id);
  let waiting: Vec<String> = b
    .pending
    .iter()
    .filter(|(_, p)| p.client_id == client_id)
    .map(|(id, _)| id.clone())
    .collect();
  for id in waiting {
    if let Some(p) = b.pending.remove(&id) {
      let _ = p.tx.send(Err(DISCONNECTED.to_string()));
    }
  }
}

/// Every connected world, newest first.
fn list_clients() -> Vec<ClientInfo> {
  let mut clients: Vec<ClientInfo> = bridge().clients.values().map(|c| c.info.clone()).collect();
  clients.sort_by(|a, b| b.connected_at.cmp(&a.connected_at));
  clients
}

/// Push a query to a connected world and wait for its BridgeResult.
pub async fn ask(client_id: &str, query: Value) -> Result<Value, String> {
  request(client_id, "query", query, ASK_TIMEOUT_SECS).await
}

/// Push one event to a world and wait for the BridgeResult carrying its requestId.
async fn request(client_id: &str, event: &str, mut payload: Value, timeout_secs: u64) -> Result<Value, String> {
  let request_id = new_id();
  let Some(map) = payload.as_object_mut() else {
    return Err("A Foundry request must be a JSON object.".to_string());
  };
  map.insert("requestId".to_string(), Value::String(request_id.clone()));

  let rx = {
    let mut b = bridge();
    let Some(sender) = b.clients.get(client_id).map(|c| c.tx.clone()) else {
      return Err(GONE.to_string());
    };
    let (tx, rx) = oneshot::channel();
    b.pending.insert(
      request_id.clone(),
      Pending {
        client_id: client_id.to_string(),
        tx,
      },
    );
    if sender.send(Event::default().event(event).data(payload.to_string())).is_err() {
      b.pending.remove(&request_id);
      return Err(GONE.to_string());
    }
    rx
  };

  match tokio::time::timeout(Duration::from_secs(timeout_secs), rx).await {
    Ok(Ok(result)) => result,
    Ok(Err(_)) => Err(DISCONNECTED.to_string()),
    Err(_) => {
      bridge().pending.remove(&request_id);
      Err(format!("Foundry did not answer within {timeout_secs}s."))
    }
  }
}

/// Hand a POSTed answer to whoever is waiting. False when it already timed out.
fn deliver(request_id: &str, result: Value) -> bool {
  match bridge().pending.remove(request_id) {
    Some(p) => p.tx.send(Ok(result)).is_ok(),
    None => false,
  }
}

// --- allowed origins ------------------------------------------------------------

/// Settings → Foundry URL: the stored list, else HBM_FOUNDRY_URLS, as the TS
/// config resolves it.
fn foundry_urls() -> Vec<String> {
  let raw = read_raw_config();
  if let Some(list) = raw.get("app").and_then(|a| a.get("foundryUrls")).and_then(Value::as_array) {
    return list.iter().filter_map(Value::as_str).map(str::to_string).collect();
  }
  std::env::var("HBM_FOUNDRY_URLS")
    .map(|v| {
      v.split(|c: char| c == ',' || c.is_whitespace())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
    })
    .unwrap_or_default()
}

/// `http://localhost:30000/game/` → `http://localhost:30000`; junk → None.
pub fn to_origin(value: &str) -> Option<String> {
  let origin = url::Url::parse(value.trim()).ok()?.origin();
  origin.is_tuple().then(|| origin.ascii_serialization())
}

fn allowed_origins() -> HashSet<String> {
  foundry_urls().iter().filter_map(|u| to_origin(u)).collect()
}

/// Worlds the allowlist turned away: origin → (world from the handshake, epoch ms).
static REFUSED: OnceLock<Mutex<HashMap<String, (String, u64)>>> = OnceLock::new();

fn refused() -> MutexGuard<'static, HashMap<String, (String, u64)>> {
  REFUSED.get_or_init(Default::default).lock().unwrap()
}

/// Remember a refusal so the UI can offer Allow. Keeps the last known world name.
fn note_refused(origin: &str, world: &str) {
  let mut map = refused();
  let world = if world.is_empty() {
    map.get(origin).map(|(w, _)| w.clone()).unwrap_or_default()
  } else {
    world.to_string()
  };
  map.insert(origin.to_string(), (world, now_ms()));
}

/// Recent refusals that are still refused, newest first.
fn list_refused(allowed: &HashSet<String>) -> Vec<Value> {
  let now = now_ms();
  let mut map = refused();
  map.retain(|origin, (_, at)| !allowed.contains(origin) && now.saturating_sub(*at) <= REFUSED_TTL_MS);
  let mut list: Vec<(&String, &(String, u64))> = map.iter().collect();
  list.sort_by(|a, b| b.1 .1.cmp(&a.1 .1));
  list
    .into_iter()
    .map(|(origin, (world, at))| json!({ "origin": origin, "world": world, "at": at }))
    .collect()
}

/// The `world` handshake param, if this is a stream request.
fn query_world(req: &Request) -> String {
  req
    .uri()
    .query()
    .and_then(|q| url::form_urlencoded::parse(q.as_bytes()).find(|(k, _)| k == "world"))
    .map(|(_, v)| v.into_owned())
    .unwrap_or_default()
}

fn cors_headers(origin: &str) -> [(header::HeaderName, HeaderValue); 5] {
  let value = HeaderValue::from_str(origin).unwrap_or(HeaderValue::from_static("null"));
  [
    (header::ACCESS_CONTROL_ALLOW_ORIGIN, value),
    (header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET, POST, OPTIONS")),
    (header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("Content-Type, Authorization")),
    (header::ACCESS_CONTROL_MAX_AGE, HeaderValue::from_static("600")),
    (header::VARY, HeaderValue::from_static("Origin")),
  ]
}

fn header_string(headers: &HeaderMap, name: header::HeaderName) -> Option<String> {
  headers.get(name).and_then(|v| v.to_str().ok()).map(str::to_string)
}

fn message(status: StatusCode, text: &str) -> Response {
  (status, Json(json!({ "message": text }))).into_response()
}

fn first_header_token(headers: &HeaderMap, name: &str) -> Option<String> {
  headers
    .get(name)
    .and_then(|v| v.to_str().ok())
    .and_then(|s| s.split(',').next())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn is_same_origin(headers: &HeaderMap) -> bool {
  let Some(origin) = header_string(headers, header::ORIGIN) else {
    return true;
  };
  let host = first_header_token(headers, "x-forwarded-host")
    .or_else(|| header_string(headers, header::HOST));
  let Some(host) = host else {
    return false;
  };
  let proto = first_header_token(headers, "x-forwarded-proto").unwrap_or_else(|| "http".to_string());
  origin == format!("{proto}://{host}")
}

/// Optional shared secret (`HBM_BRIDGE_TOKEN`) for authenticating Foundry bridge
/// connections (`?token=` on SSE `/api/foundry/stream`, `Authorization: Bearer <token>`
/// or `?token=` on `/api/foundry/{result,state}`).
fn check_bridge_token(req: &Request) -> bool {
  let Ok(expected) = std::env::var("HBM_BRIDGE_TOKEN") else {
    return true;
  };
  let expected = expected.trim();
  if expected.is_empty() {
    return true;
  }
  if req.uri().path() == "/api/foundry/status" {
    return true;
  }
  if let Some(auth) = header_string(req.headers(), header::AUTHORIZATION) {
    let bearer = auth.trim().strip_prefix("Bearer ").unwrap_or(auth.trim());
    if bearer == expected {
      return true;
    }
  }
  if let Some(query) = req.uri().query() {
    for (k, v) in url::form_urlencoded::parse(query.as_bytes()) {
      if k == "token" && v == expected {
        return true;
      }
    }
  }
  false
}

/// Same rules as hooks.server.ts: no Origin or our own is fine, anything else
/// must be listed under Settings → Foundry URL.
async fn cors(req: Request, next: Next) -> Response {
  let origin = header_string(req.headers(), header::ORIGIN);
  let same_origin = is_same_origin(req.headers());
  let allowed = same_origin || origin.as_ref().is_some_and(|o| allowed_origins().contains(o));

  if req.method() == Method::OPTIONS {
    return match (&origin, allowed) {
      (Some(o), true) => (StatusCode::NO_CONTENT, cors_headers(o)).into_response(),
      (None, true) => StatusCode::NO_CONTENT.into_response(),
      _ => StatusCode::FORBIDDEN.into_response(),
    };
  }
  if !allowed {
    let o = origin.unwrap_or_default();
    note_refused(&o, &query_world(&req));
    // CORS headers only make the refusal readable, so the module can say
    // "refused" instead of "not running"; nothing else is exposed.
    let mut res = message(
      StatusCode::FORBIDDEN,
      &format!(
        "Origin {o} is not allowed. Click Allow next to the Foundry badge on the manager's Files page, or add it to Settings → Foundry URL."
      ),
    );
    res.headers_mut().extend(cors_headers(&o));
    return res;
  }

  if !check_bridge_token(&req) {
    let mut res = message(
      StatusCode::UNAUTHORIZED,
      "Invalid or missing Foundry bridge token (HBM_BRIDGE_TOKEN).",
    );
    if let (Some(o), false) = (&origin, same_origin) {
      res.headers_mut().extend(cors_headers(o));
    }
    return res;
  }

  let mut res = next.run(req).await;
  if let (Some(o), false) = (&origin, same_origin) {
    res.headers_mut().extend(cors_headers(o));
  }
  res
}

// --- endpoints ------------------------------------------------------------------

/// GET /api/foundry/stream — the bridge's inbound connection. Query params are
/// the handshake and are display-only.
async fn stream(headers: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Response {
  let p = |key: &str| q.get(key).cloned().unwrap_or_default();
  let client_id = new_id();
  let (tx, rx) = mpsc::unbounded_channel();
  let world = p("world");
  let info = ClientInfo {
    client_id: client_id.clone(),
    world: if world.is_empty() { "unknown world".to_string() } else { world },
    world_id: p("worldId"),
    system: p("system"),
    system_version: p("systemVersion"),
    foundry_version: p("foundryVersion"),
    user: p("user"),
    connected_at: now_ms(),
    origin: header_string(&headers, header::ORIGIN).unwrap_or_default(),
    module_version: p("moduleVersion"),
    features: p("features").split(',').filter(|s| !s.is_empty()).map(str::to_string).collect(),
    enforcement: None,
  };
  let _ = tx.send(Event::default().event("hello").data(json!({ "clientId": client_id }).to_string()));
  bridge().clients.insert(client_id.clone(), Client { info, tx });

  let keep_alive = KeepAlive::new()
    .interval(Duration::from_secs(PING_SECS))
    .event(Event::default().event("ping").data("{}"));
  let sse = Sse::new(ClientStream { client_id, rx }).keep_alive(keep_alive);
  // Tells nginx et al. not to buffer the stream until it's "big enough".
  ([("x-accel-buffering", "no")], sse).into_response()
}

/// POST /api/foundry/result — the bridge's answer to a pushed query.
async fn result(body: Bytes) -> Response {
  let Ok(value) = serde_json::from_slice::<Value>(&body) else {
    return message(StatusCode::BAD_REQUEST, "Body must be JSON.");
  };
  let Some(request_id) = value.get("requestId").and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string) else {
    return message(StatusCode::BAD_REQUEST, "Missing requestId.");
  };
  let delivered = deliver(&request_id, value);
  let status = if delivered { StatusCode::OK } else { StatusCode::ACCEPTED };
  (status, Json(json!({ "delivered": delivered }))).into_response()
}

/// POST /api/foundry/state — what a world enforces. The switches are module
/// settings in Foundry; it reports them after hello and on every change.
async fn state(body: Bytes) -> Response {
  let Ok(value) = serde_json::from_slice::<Value>(&body) else {
    return message(StatusCode::BAD_REQUEST, "Body must be JSON.");
  };
  let (Some(client_id), Some(reported)) = (value.get("clientId").and_then(Value::as_str), value.get("state")) else {
    return message(StatusCode::BAD_REQUEST, "Missing \"clientId\" or \"state\".");
  };
  let enforcement = json!({
    "imports": reported.get("imports").and_then(Value::as_bool).unwrap_or(false),
    "banner": reported.get("banner").and_then(Value::as_bool).unwrap_or(false),
    "rules": reported.get("rules").and_then(Value::as_u64).unwrap_or(0),
  });
  match bridge().clients.get_mut(client_id) {
    Some(client) => {
      client.info.enforcement = Some(enforcement);
      Json(json!({ "ok": true })).into_response()
    }
    None => message(StatusCode::CONFLICT, GONE),
  }
}

fn status_json() -> Value {
  let allowed = foundry_urls();
  let clients = list_clients();
  let pending = bridge().pending.len();
  json!({
    "connected": !clients.is_empty(),
    "stats": { "clients": clients.len(), "pending": pending },
    "clients": clients,
    // Echoed so the UI can explain a 403 without a second round trip.
    "allowedOrigins": allowed,
    "refused": list_refused(&allowed_origins()),
  })
}

/// GET /api/foundry/status — the module's "Test connection" probe.
async fn status() -> Json<Value> {
  Json(status_json())
}

pub fn router() -> Router {
  Router::new()
    .route("/api/foundry/stream", get(stream))
    .route("/api/foundry/result", post(result))
    .route("/api/foundry/state", post(state))
    .route("/api/foundry/status", get(status))
    .layer(middleware::from_fn(cors))
}

/// Bind and serve until the app exits. A busy port is recorded, not fatal.
pub async fn start_bridge_server() {
  let paths = resolve_paths();
  let port = paths.bridge_port;
  let url = std::env::var("HBM_BRIDGE_URL")
    .ok()
    .or_else(|| std::env::var("HBM_MANAGER_URL").ok())
    .map(|s| s.trim().trim_end_matches('/').to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| format!("http://localhost:{port}"));
  match tokio::net::TcpListener::bind(SocketAddr::from((paths.bind_host, port))).await {
    Ok(listener) => {
      *server_info() = (url, None);
      let _ = axum::serve(listener, router()).await;
    }
    Err(e) => *server_info() = (url, Some(format!("Port {port} busy or unavailable: {e}"))),
  }
}

// --- commands -------------------------------------------------------------------

/// The HTTP status, plus where Foundry should point and any bind error.
pub async fn foundry_status() -> Result<Value, String> {
  let mut value = status_json();
  let (url, error) = server_info().clone();
  value["managerUrl"] = Value::String(url);
  value["error"] = error.map(Value::String).unwrap_or(Value::Null);
  Ok(value)
}

pub async fn foundry_ask(client_id: String, query: Value) -> Result<Value, String> {
  ask(&client_id, query).await
}

/// Push an action (open a sheet) and wait briefly for the module to confirm.
pub async fn foundry_command(client_id: String, command: Value) -> Result<Value, String> {
  let timeout = command_timeout(command["action"].as_str());
  request(&client_id, "command", command, timeout).await
}

/// A scan walks every actor in the world; opening a sheet is instant.
fn command_timeout(action: Option<&str>) -> u64 {
  match action {
    Some("scan") => ASK_TIMEOUT_SECS,
    Some("send") => SEND_TIMEOUT_SECS,
    Some("ping") => PING_TIMEOUT_SECS,
    _ => COMMAND_TIMEOUT_SECS,
  }
}

// --- the site browser -----------------------------------------------------------

/// Which world takes sends: the newest one whose module can.
fn send_client(clients: &[ClientInfo]) -> Option<&ClientInfo> {
  clients.iter().find(|c| c.features.iter().any(|f| f == "send"))
}

/// What the site browser needs to enable its send buttons. `connected` without
/// `canSend` means the world's module is too old.
pub fn send_status() -> Value {
  let clients = list_clients();
  let target = send_client(&clients);
  json!({
    "connected": !clients.is_empty(),
    "canSend": target.is_some(),
    "world": target.map(|c| c.world.clone()),
  })
}

/// Push a command to the world taking sends. A world's refusal becomes an error.
pub async fn send_command(command: Value) -> Result<Value, String> {
  let client_id = send_client(&list_clients())
    .map(|c| c.client_id.clone())
    .ok_or_else(|| GONE.to_string())?;
  let result = foundry_command(client_id, command).await?;
  if result["ok"] == Value::Bool(true) {
    Ok(result)
  } else {
    Err(result["error"].as_str().unwrap_or("Foundry could not do that.").to_string())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn client(id: &str, connected_at: u64, features: &[&str]) -> ClientInfo {
    ClientInfo {
      client_id: id.to_string(),
      world: id.to_string(),
      world_id: String::new(),
      system: String::new(),
      system_version: String::new(),
      foundry_version: String::new(),
      user: String::new(),
      connected_at,
      origin: String::new(),
      module_version: String::new(),
      features: features.iter().map(|f| f.to_string()).collect(),
      enforcement: None,
    }
  }

  #[test]
  fn sends_go_to_the_newest_world_that_can_take_them() {
    let clients = [
      client("too-old", 3, &["open"]),
      client("newest", 2, &["open", "send"]),
      client("older", 1, &["send"]),
    ];
    assert_eq!(send_client(&clients).map(|c| c.client_id.as_str()), Some("newest"));
    assert!(send_client(&clients[..1]).is_none());
  }

  #[test]
  fn a_send_gets_longer_than_opening_a_sheet() {
    assert_eq!(command_timeout(Some("send")), SEND_TIMEOUT_SECS);
    assert_eq!(command_timeout(Some("open")), COMMAND_TIMEOUT_SECS);
    assert!(SEND_TIMEOUT_SECS > ASK_TIMEOUT_SECS);
  }

  #[test]
  fn origins_drop_paths_and_default_ports() {
    assert_eq!(to_origin("http://localhost:30000/game/").as_deref(), Some("http://localhost:30000"));
    assert_eq!(to_origin("https://vtt.example:443/").as_deref(), Some("https://vtt.example"));
    assert_eq!(to_origin("not a url"), None);
  }

  #[test]
  fn same_origin_honors_forwarded_https_headers() {
    let mut headers = HeaderMap::new();
    headers.insert(header::ORIGIN, HeaderValue::from_static("https://bridge.example.com"));
    headers.insert(header::HOST, HeaderValue::from_static("127.0.0.1:5051"));
    headers.insert("x-forwarded-proto", HeaderValue::from_static("https"));
    headers.insert("x-forwarded-host", HeaderValue::from_static("bridge.example.com"));
    assert!(is_same_origin(&headers));

    headers.insert("x-forwarded-proto", HeaderValue::from_static("http"));
    assert!(!is_same_origin(&headers));
  }

  /// One test for the whole round trip, since HBM_CONFIG_PATH is process-wide.
  #[tokio::test]
  async fn bridge_round_trip_over_http() {
    let dir = std::env::temp_dir().join(format!("hbm-bridge-{}", new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let config = dir.join("hbm-config.json");
    std::fs::write(&config, r#"{"app":{"foundryUrls":["http://localhost:30000/game"]}}"#).unwrap();
    std::env::set_var("HBM_CONFIG_PATH", &config);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router()).await.unwrap() });
    let http = reqwest::Client::new();

    // A listed origin passes the preflight; an unlisted one is refused.
    let preflight = http
      .request(Method::OPTIONS, format!("{base}/api/foundry/result"))
      .header("origin", "http://localhost:30000")
      .send()
      .await
      .unwrap();
    assert_eq!(preflight.status(), StatusCode::NO_CONTENT);
    assert_eq!(preflight.headers()["access-control-allow-origin"], "http://localhost:30000");
    let refused = http
      .get(format!("{base}/api/foundry/status"))
      .header("origin", "http://evil.example")
      .send()
      .await
      .unwrap();
    assert_eq!(refused.status(), StatusCode::FORBIDDEN);
    // Readable by the refused page, so the module can tell refused from offline.
    assert_eq!(refused.headers()["access-control-allow-origin"], "http://evil.example");

    // A refused stream is remembered with its world, for the UI's Allow button.
    let refused_stream = http
      .get(format!("{base}/api/foundry/stream?world=Other%20World"))
      .header("origin", "http://evil.example")
      .send()
      .await
      .unwrap();
    assert_eq!(refused_stream.status(), StatusCode::FORBIDDEN);
    let listed = status_json()["refused"].clone();
    assert_eq!(listed[0]["origin"], "http://evil.example");
    assert_eq!(listed[0]["world"], "Other World");

    // Connect a world and read its hello.
    let mut stream = http
      .get(format!(
        "{base}/api/foundry/stream?world=Test%20World&moduleVersion=1.1.0&features=open"
      ))
      .header("origin", "http://localhost:30000")
      .send()
      .await
      .unwrap();
    assert_eq!(stream.headers()["content-type"], "text/event-stream");
    let hello = String::from_utf8(stream.chunk().await.unwrap().unwrap().to_vec()).unwrap();
    assert!(hello.starts_with("event: hello"), "{hello}");
    let clients = list_clients();
    assert_eq!(clients.len(), 1);
    assert_eq!(clients[0].world, "Test World");
    assert_eq!(clients[0].module_version, "1.1.0");
    assert_eq!(clients[0].features, vec!["open".to_string()]);
    let client_id = clients[0].client_id.clone();
    assert!(clients[0].enforcement.is_none());

    // The world reports what it enforces; the status carries it.
    let reported = http
      .post(format!("{base}/api/foundry/state"))
      .header("origin", "http://localhost:30000")
      .json(&json!({ "clientId": client_id, "state": { "imports": true, "banner": false, "rules": 12 } }))
      .send()
      .await
      .unwrap();
    assert_eq!(reported.status(), StatusCode::OK);
    assert_eq!(status_json()["clients"][0]["enforcement"], json!({ "imports": true, "banner": false, "rules": 12 }));
    let stale = http
      .post(format!("{base}/api/foundry/state"))
      .json(&json!({ "clientId": "gone", "state": {} }))
      .send()
      .await
      .unwrap();
    assert_eq!(stale.status(), StatusCode::CONFLICT);

    // Ask, answer from the "module", and get the answer back.
    let command_client = client_id.clone();
    let asking = tokio::spawn(async move { ask(&client_id, json!({ "candidates": [] })).await });
    let query = String::from_utf8(stream.chunk().await.unwrap().unwrap().to_vec()).unwrap();
    assert!(query.starts_with("event: query"), "{query}");
    let data: Value = serde_json::from_str(query.lines().nth(1).unwrap().trim_start_matches("data: ")).unwrap();
    let request_id = data["requestId"].as_str().unwrap().to_string();
    let posted = http
      .post(format!("{base}/api/foundry/result"))
      .header("origin", "http://localhost:30000")
      .json(&json!({ "requestId": request_id, "ok": true, "results": [] }))
      .send()
      .await
      .unwrap();
    assert_eq!(posted.status(), StatusCode::OK);
    assert_eq!(asking.await.unwrap().unwrap()["ok"], true);

    // A command travels the same way, as its own event.
    let opening = tokio::spawn(async move {
      foundry_command(command_client, json!({ "action": "open", "uuid": "Item.abc" })).await
    });
    let pushed = String::from_utf8(stream.chunk().await.unwrap().unwrap().to_vec()).unwrap();
    assert!(pushed.starts_with("event: command"), "{pushed}");
    let data: Value = serde_json::from_str(pushed.lines().nth(1).unwrap().trim_start_matches("data: ")).unwrap();
    assert_eq!(data["uuid"], "Item.abc");
    http
      .post(format!("{base}/api/foundry/result"))
      .header("origin", "http://localhost:30000")
      .json(&json!({ "requestId": data["requestId"], "ok": true, "name": "Abc" }))
      .send()
      .await
      .unwrap();
    assert_eq!(opening.await.unwrap().unwrap()["name"], "Abc");

    // A late answer is accepted but goes nowhere.
    let late = http
      .post(format!("{base}/api/foundry/result"))
      .json(&json!({ "requestId": "gone" }))
      .send()
      .await
      .unwrap();
    assert_eq!(late.status(), StatusCode::ACCEPTED);

    // Closing the stream drops the client.
    drop(stream);
    for _ in 0..50 {
      if list_clients().is_empty() {
        break;
      }
      tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(list_clients().is_empty());
    let _ = std::fs::remove_dir_all(&dir);
  }
}
