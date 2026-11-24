//! Internal JSON/SSE RPC router for `hm-backend` (`127.0.0.1:5059`).
//!
//! Exposes:
//! - `GET /internal/health` & `GET /api/health`
//! - `GET /internal/events` & `GET /api/events` (SSE stream for `pipeline-event`, `setup-progress`, `site-blocklist-added`, `site-shops-changed`)
//! - `POST /api/rpc/{command}` & `POST /internal/rpc/{command}` (unified command dispatcher mirroring Tauri invoke commands)
//! - REST aliases under `/api/{repos,modules,pipeline,setup,server}/*` and `/internal/{config,repos,modules,pipeline,setup,server}/*`
//! - `.merge(hm_core::foundry::router())` so `/api/foundry/{stream,result,state,status}` share the exact same bridge registry as `:5051`.

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use hm_core::{
  config, deploy_scripts, foundry, modules, patch_runner, pipeline, repos, run_history,
  script_names, server, setup, site_browser, upstream,
};
use futures_core::Stream;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::convert::Infallible;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};

const PING_SECS: u64 = 25;

pub type EventTx = broadcast::Sender<(String, Value)>;

struct SseEventStream {
  rx: mpsc::UnboundedReceiver<Event>,
}

impl Stream for SseEventStream {
  type Item = Result<Event, Infallible>;

  fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
    self.rx.poll_recv(cx).map(|opt| opt.map(Ok))
  }
}

fn ok_json<T: serde::Serialize>(val: T) -> Response {
  match serde_json::to_value(val) {
    Ok(v) => (StatusCode::OK, Json(v)).into_response(),
    Err(e) => err_json(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
  }
}

fn err_json(status: StatusCode, msg: &str) -> Response {
  (
    status,
    Json(json!({
      "message": msg,
      "error": {
        "code": if status == StatusCode::BAD_REQUEST { "BAD_REQUEST" } else { "BACKEND_ERROR" },
        "message": msg,
      }
    })),
  )
    .into_response()
}

fn result_json<T: serde::Serialize>(res: Result<T, String>) -> Response {
  match res {
    Ok(val) => ok_json(val),
    Err(msg) => err_json(StatusCode::BAD_REQUEST, &msg),
  }
}

fn parse_body<T: for<'de> Deserialize<'de>>(bytes: &Bytes) -> Result<T, Response> {
  let slice = if bytes.is_empty() { b"{}" as &[u8] } else { bytes.as_ref() };
  serde_json::from_slice::<T>(slice)
    .map_err(|e| err_json(StatusCode::BAD_REQUEST, &format!("Invalid JSON payload: {e}")))
}

async fn health() -> Json<Value> {
  Json(json!({ "ok": true }))
}

async fn events(State(tx): State<EventTx>) -> Response {
  let mut bcast_rx = tx.subscribe();
  let (mpsc_tx, mpsc_rx) = mpsc::unbounded_channel::<Event>();
  tokio::spawn(async move {
    loop {
      match bcast_rx.recv().await {
        Ok((name, payload)) => {
          let ev = Event::default().event(name).data(payload.to_string());
          if mpsc_tx.send(ev).is_err() {
            break;
          }
        }
        Err(broadcast::error::RecvError::Lagged(_)) => continue,
        Err(broadcast::error::RecvError::Closed) => break,
      }
    }
  });
  let keep_alive = KeepAlive::new()
    .interval(Duration::from_secs(PING_SECS))
    .event(Event::default().event("ping").data("{}"));
  let sse = Sse::new(SseEventStream { rx: mpsc_rx }).keep_alive(keep_alive);
  ([("x-accel-buffering", "no")], sse).into_response()
}

async fn get_config_handler() -> Response {
  ok_json(config::read_config())
}

async fn put_config_handler(body: Bytes) -> Response {
  let patch: Map<String, Value> = match parse_body(&body) {
    Ok(v) => v,
    Err(r) => return r,
  };
  result_json(config::save_config(patch))
}

// --- argument structs for RPC / REST handlers ----------------------------------

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SaveConfigArgs {
  #[serde(default)]
  patch: Map<String, Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FoundryAskArgs {
  client_id: String,
  query: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FoundryCommandArgs {
  client_id: String,
  command: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetRepoLockArgs {
  repo_id: String,
  locked: bool,
  #[serde(default)]
  pin_current: bool,
  follow5e_package_json: Option<bool>,
  follow5e_date: Option<bool>,
  note: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LockAllArgs {
  note: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckoutRepoRefArgs {
  repo_id: String,
  target_ref: String,
  #[serde(default)]
  lock_after: bool,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CheckUpstreamArgs {
  fetch: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetDeployModuleArgs {
  module_id: String,
  enabled: bool,
  options: Option<Map<String, Value>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveDeployScriptArgs {
  script: deploy_scripts::DeployScriptInput,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteDeployScriptArgs {
  script_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunPipelineArgs {
  action: String,
  #[serde(default)]
  dry_run: bool,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RestartServerArgs {
  port: Option<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InspectSetupFolderArgs {
  path: String,
  url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncSetupRepoArgs {
  id: String,
  url: String,
  path: String,
  lock_id: Option<String>,
}

async fn dispatch_command(cmd: &str, body: Bytes) -> Response {
  match cmd {
    "get_config_path" => ok_json(config::get_config_path()),
    "read_config" => ok_json(config::read_config()),
    "save_config" => {
      let args: SaveConfigArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(config::save_config(args.patch))
    }
    "get_installed_setup" => ok_json(config::get_installed_setup()),
    "import_installed_setup" => result_json(config::import_installed_setup()),
    "foundry_status" => result_json(foundry::foundry_status().await),
    "foundry_ask" => {
      let args: FoundryAskArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(foundry::foundry_ask(args.client_id, args.query).await)
    }
    "foundry_command" => {
      let args: FoundryCommandArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(foundry::foundry_command(args.client_id, args.command).await)
    }
    "get_repos_overview" => result_json(repos::get_repos_overview().await),
    "fetch_all_repos" => result_json(repos::fetch_all_repos().await),
    "set_repo_lock" => {
      let args: SetRepoLockArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(
        repos::set_repo_lock(
          args.repo_id,
          args.locked,
          args.pin_current,
          args.follow5e_package_json,
          args.follow5e_date,
          args.note,
        )
        .await,
      )
    }
    "lock_all_at_current" => {
      let args: LockAllArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(repos::lock_all_at_current(args.note).await)
    }
    "unlock_all_repos" => result_json(repos::unlock_all_repos().await),
    "checkout_repo_ref" => {
      let args: CheckoutRepoRefArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(repos::checkout_repo_ref(args.repo_id, args.target_ref, args.lock_after).await)
    }
    "sync_utils_to_5e" => result_json(repos::sync_utils_to_5e().await),
    "sync_homebrew_to_5e_date" => result_json(repos::sync_homebrew_to_5e_date().await),
    "roll_back_to_published" => result_json(repos::roll_back_to_published().await),
    "check_upstream_updates" => {
      let args: CheckUpstreamArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(upstream::check_upstream_updates(args.fetch).await)
    }
    "check_deploy_modules" => result_json(patch_runner::check_deploy_modules().await),
    "check_script_names" => result_json(script_names::check_script_names().await),
    "list_deploy_modules" => result_json(modules::list_deploy_modules()),
    "set_deploy_module" => {
      let args: SetDeployModuleArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(modules::set_deploy_module(args.module_id, args.enabled, args.options))
    }
    "list_deploy_images" => ok_json(run_history::list_deploy_images()),
    "get_last_deploy_run" => ok_json(run_history::get_last_deploy_run()),
    "get_last_prepare" => ok_json(run_history::get_last_prepare()),
    "list_deploy_scripts" => ok_json(deploy_scripts::list_deploy_scripts()),
    "save_deploy_script" => {
      if let Ok(wrapped) = serde_json::from_slice::<SaveDeployScriptArgs>(&body) {
        result_json(deploy_scripts::save_deploy_script(wrapped.script))
      } else {
        let direct: deploy_scripts::DeployScriptInput = match parse_body(&body) {
          Ok(v) => v,
          Err(r) => return r,
        };
        result_json(deploy_scripts::save_deploy_script(direct))
      }
    }
    "delete_deploy_script" => {
      let args: DeleteDeployScriptArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(deploy_scripts::delete_deploy_script(args.script_id))
    }
    "run_pipeline" => {
      let args: RunPipelineArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(pipeline::run_pipeline(args.action, args.dry_run).await)
    }
    "get_local_server_status" => result_json(server::get_local_server_status().await),
    "restart_local_server" => {
      let args: RestartServerArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(server::restart_local_server(args.port).await)
    }
    "take_site_blocklist_rules" => ok_json(site_browser::take_site_blocklist_rules()),
    "git_version" => ok_json(setup::git_version()),
    "inspect_setup_folder" => {
      let args: InspectSetupFolderArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(setup::inspect_setup_folder(args.path, args.url).await)
    }
    "sync_setup_repo" => {
      let args: SyncSetupRepoArgs = match parse_body(&body) {
        Ok(v) => v,
        Err(r) => return r,
      };
      result_json(setup::sync_setup_repo(args.id, args.url, args.path, args.lock_id).await)
    }
    "get_bundled_guides_dir" => ok_json(setup::get_bundled_guides_dir()),
    "get_bundled_bridge_dir" => ok_json(setup::get_bundled_bridge_dir()),
    other => err_json(StatusCode::NOT_FOUND, &format!("Unknown RPC command: {other}")),
  }
}

async fn rpc_handler(Path(command): Path<String>, body: Bytes) -> Response {
  dispatch_command(&command, body).await
}

async fn delete_script_by_id(Path(id): Path<String>) -> Response {
  result_json(deploy_scripts::delete_deploy_script(id))
}

fn api_subrouter() -> Router<EventTx> {
  Router::new()
    .route("/health", get(health))
    .route("/events", get(events))
    .route("/config", get(get_config_handler).put(put_config_handler))
    .route("/rpc/{command}", post(rpc_handler))
    // Repos REST routes
    .route(
      "/repos/overview",
      get(|| async { dispatch_command("get_repos_overview", Bytes::new()).await }),
    )
    .route(
      "/repos/fetch",
      post(|| async { dispatch_command("fetch_all_repos", Bytes::new()).await }),
    )
    .route(
      "/repos/lock",
      post(|body: Bytes| async move { dispatch_command("set_repo_lock", body).await }),
    )
    .route(
      "/repos/lock-all",
      post(|body: Bytes| async move { dispatch_command("lock_all_at_current", body).await }),
    )
    .route(
      "/repos/unlock-all",
      post(|| async { dispatch_command("unlock_all_repos", Bytes::new()).await }),
    )
    .route(
      "/repos/checkout",
      post(|body: Bytes| async move { dispatch_command("checkout_repo_ref", body).await }),
    )
    .route(
      "/repos/sync-utils",
      post(|| async { dispatch_command("sync_utils_to_5e", Bytes::new()).await }),
    )
    .route(
      "/repos/sync-homebrew",
      post(|| async { dispatch_command("sync_homebrew_to_5e_date", Bytes::new()).await }),
    )
    .route(
      "/repos/rollback",
      post(|| async { dispatch_command("roll_back_to_published", Bytes::new()).await }),
    )
    .route(
      "/repos/upstream",
      post(|body: Bytes| async move { dispatch_command("check_upstream_updates", body).await }),
    )
    // Modules & deploy scripts REST routes
    .route(
      "/modules",
      get(|| async { dispatch_command("list_deploy_modules", Bytes::new()).await }),
    )
    .route(
      "/modules/set",
      post(|body: Bytes| async move { dispatch_command("set_deploy_module", body).await }),
    )
    .route(
      "/modules/check",
      get(|| async { dispatch_command("check_deploy_modules", Bytes::new()).await }),
    )
    .route(
      "/modules/script-names",
      get(|| async { dispatch_command("check_script_names", Bytes::new()).await }),
    )
    .route(
      "/modules/images",
      get(|| async { dispatch_command("list_deploy_images", Bytes::new()).await }),
    )
    .route(
      "/modules/last-run",
      get(|| async { dispatch_command("get_last_deploy_run", Bytes::new()).await }),
    )
    .route(
      "/modules/last-prepare",
      get(|| async { dispatch_command("get_last_prepare", Bytes::new()).await }),
    )
    .route(
      "/modules/scripts",
      get(|| async { dispatch_command("list_deploy_scripts", Bytes::new()).await })
        .post(|body: Bytes| async move { dispatch_command("save_deploy_script", body).await }),
    )
    .route("/modules/scripts/{id}", delete(delete_script_by_id))
    // Pipeline REST routes
    .route(
      "/pipeline/run",
      post(|body: Bytes| async move { dispatch_command("run_pipeline", body).await }),
    )
    // Setup REST routes
    .route(
      "/setup/git-version",
      get(|| async { dispatch_command("git_version", Bytes::new()).await }),
    )
    .route(
      "/setup/inspect",
      post(|body: Bytes| async move { dispatch_command("inspect_setup_folder", body).await }),
    )
    .route(
      "/setup/sync",
      post(|body: Bytes| async move { dispatch_command("sync_setup_repo", body).await }),
    )
    // Preview server REST routes
    .route(
      "/server/status",
      get(|| async { dispatch_command("get_local_server_status", Bytes::new()).await }),
    )
    .route(
      "/server/restart",
      post(|body: Bytes| async move { dispatch_command("restart_local_server", body).await }),
    )
    // Config PUT shortcut
    .route("/config/save", put(put_config_handler))
}

pub fn router(tx: EventTx) -> Router {
  Router::new()
    .nest("/api", api_subrouter())
    .nest("/internal", api_subrouter())
    .with_state(tx)
    .merge(foundry::router())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::net::SocketAddr;
  use tokio::net::TcpListener;

  async fn spawn_test_rpc() -> (String, EventTx) {
    let (tx, _rx) = broadcast::channel(64);
    let app = router(tx.clone());
    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
      .await
      .unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
      let _ = axum::serve(listener, app).await;
    });
    (format!("http://{addr}"), tx)
  }

  #[tokio::test]
  async fn health_and_rpc_commands_respond_over_http() {
    let (base, _tx) = spawn_test_rpc().await;
    let client = reqwest::Client::new();

    let health_res: Value = client
      .get(format!("{base}/internal/health"))
      .send()
      .await
      .unwrap()
      .json()
      .await
      .unwrap();
    assert_eq!(health_res["ok"], true);

    let git_res = client
      .post(format!("{base}/api/rpc/git_version"))
      .json(&json!({}))
      .send()
      .await
      .unwrap();
    assert_eq!(git_res.status(), 200);

    let unknown_res = client
      .post(format!("{base}/api/rpc/does_not_exist"))
      .json(&json!({}))
      .send()
      .await
      .unwrap();
    assert_eq!(unknown_res.status(), 404);
  }

  #[tokio::test]
  async fn sse_events_stream_broadcasts_emitted_events() {
    let (base, tx) = spawn_test_rpc().await;
    let client = reqwest::Client::new();

    let mut res = client
      .get(format!("{base}/api/events"))
      .send()
      .await
      .unwrap();
    assert_eq!(res.status(), 200);
    assert_eq!(
      res.headers().get("x-accel-buffering").and_then(|v| v.to_str().ok()),
      Some("no")
    );

    let _ = tx.send((
      "pipeline-event".to_string(),
      json!({ "step": "build", "phase": "prepare", "level": "info", "message": "Hello SSE" }),
    ));

    let chunk = tokio::time::timeout(Duration::from_secs(3), res.chunk())
      .await
      .unwrap()
      .unwrap()
      .unwrap();
    let text = String::from_utf8_lossy(&chunk);
    assert!(text.contains("event: pipeline-event"), "{text}");
    assert!(text.contains("Hello SSE"), "{text}");
  }
}
