//! Headless Rust backend for Homebrew Manager (`hm-backend`).
//!
//! Runs in container and `npm run dev:web` modes alongside the SvelteKit Node server:
//! - Internal JSON/SSE RPC server on `HBM_BACKEND_BIND` (default `127.0.0.1:5059`)
//! - Foundry SSE bridge server on `:5051` (`hm_core::foundry`)
//! - Candidate preview server on `:5050` (`hm_core::server`)
//! - Self-contained live 5etools site server on `:8080` (`hm_core::server`)

mod rpc;

use hm_core::{data_folder, foundry, modules, runtime, server};
use serde_json::Value;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::broadcast;

fn backend_bind_addr() -> SocketAddr {
  if let Ok(raw) = std::env::var("HBM_BACKEND_BIND") {
    if let Ok(addr) = raw.trim().parse::<SocketAddr>() {
      return addr;
    }
  }
  let port = std::env::var("HBM_BACKEND_PORT")
    .ok()
    .and_then(|s| s.trim().parse::<u16>().ok())
    .unwrap_or(5059);
  SocketAddr::from(([127, 0, 0, 1], port))
}

#[tokio::main]
async fn main() {
  let (tx, _rx) = broadcast::channel::<(String, Value)>(512);
  let sink_tx = tx.clone();
  runtime::set_event_sink(Arc::new(move |event, payload| {
    let _ = sink_tx.send((event.to_string(), payload));
  }));

  data_folder::prepare();
  server::set_modules_dir(modules::modules_dir());

  // Start the :5050 candidate preview server, :8080 live 5etools site server,
  // and :5051 Foundry SSE bridge.
  server::start_or_restart_local_server(None).await;
  server::start_or_restart_live_site_server(None).await;
  tokio::spawn(foundry::start_bridge_server());

  let addr = backend_bind_addr();
  let listener = TcpListener::bind(addr)
    .await
    .unwrap_or_else(|e| panic!("hm-backend failed to bind {addr}: {e}"));
  println!("hm-backend listening on http://{addr}");

  let app = rpc::router(tx);
  axum::serve(listener, app)
    .with_graceful_shutdown(shutdown_signal())
    .await
    .expect("hm-backend server error");
}

async fn shutdown_signal() {
  let ctrl_c = async {
    let _ = tokio::signal::ctrl_c().await;
  };

  #[cfg(unix)]
  let terminate = async {
    if let Ok(mut sig) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
      sig.recv().await;
    }
  };

  #[cfg(not(unix))]
  let terminate = std::future::pending::<()>();

  tokio::select! {
    _ = ctrl_c => {},
    _ = terminate => {},
  }
}
