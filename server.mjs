#!/usr/bin/env node
/**
 * server.mjs — Lightweight supervisor entrypoint for containerized / headless
 * production deployment (Option B architecture).
 *
 * 1. Spawns the Rust `hm-backend` child process (listening on 127.0.0.1:5059
 *    for internal JSON/SSE RPC, :5051 for Foundry bridge, :5050 for candidate
 *    preview, and :8080 for the live 5etools site).
 * 2. Waits for `http://127.0.0.1:5059/internal/health` to report ready.
 * 3. Serves the SvelteKit `@sveltejs/adapter-node` handler (`./build/handler.js`)
 *    on `0.0.0.0:5052` (or `HOST`/`PORT`). Without ORIGIN or a protocol header,
 *    adapter-node assumes https, which breaks same-origin checks and the bridge
 *    manifest URLs over plain HTTP, so a missing header defaults to `http`.
 * 4. Propagates `SIGTERM`/`SIGINT` cleanly with an 8-second graceful drain
 *    timeout and exits if `hm-backend` crashes unexpectedly.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.HOST ??= '0.0.0.0';
process.env.PORT ??= process.env.HBM_MANAGER_PORT ?? '5052';
process.env.HBM_BACKEND_BIND ??= '127.0.0.1:5059';
process.env.HBM_BACKEND_URL ??= `http://${process.env.HBM_BACKEND_BIND}`;
process.env.PROTOCOL_HEADER ??= 'x-forwarded-proto';
process.env.HOST_HEADER ??= 'x-forwarded-host';
process.env.BODY_SIZE_LIMIT ??= '50M';

function resolveBackendBinary() {
  if (
    process.env.HBM_BACKEND_BIN &&
    fs.existsSync(process.env.HBM_BACKEND_BIN)
  ) {
    return process.env.HBM_BACKEND_BIN;
  }
  const binName =
    process.platform === 'win32' ? 'hm-backend.exe' : 'hm-backend';
  const candidates = [
    '/usr/local/bin/hm-backend',
    path.join(__dirname, 'target', 'release', binName),
    path.join(__dirname, 'src-tauri', 'target', 'release', binName),
    path.join(__dirname, 'target', 'debug', binName),
    path.join(__dirname, 'src-tauri', 'target', 'debug', binName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'hm-backend';
}

async function waitForBackend(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/internal/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) return;
    } catch {
      // keep polling until deadline
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    `Timed out waiting for hm-backend at ${url}/internal/health`,
  );
}

let shuttingDown = false;
const backendBin = resolveBackendBinary();
console.log(`[supervisor] Starting hm-backend (${backendBin})...`);

const backend = spawn(backendBin, [], {
  stdio: 'inherit',
  env: process.env,
});

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(
    `[supervisor] Received ${signal}, draining services (8s timeout)...`,
  );
  if (!backend.killed) {
    backend.kill('SIGTERM');
  }
  const timer = setTimeout(() => {
    if (!backend.killed) backend.kill('SIGKILL');
    process.exit(exitCode);
  }, 8000);
  timer.unref();
  backend.once('exit', () => {
    clearTimeout(timer);
    process.exit(exitCode);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

backend.on('exit', (code, signal) => {
  if (!shuttingDown) {
    console.error(
      `[supervisor] hm-backend exited unexpectedly (code=${code}, signal=${signal}). Exiting container.`,
    );
    process.exit(code ?? 1);
  }
});

try {
  await waitForBackend(process.env.HBM_BACKEND_URL);
  console.log(
    `[supervisor] hm-backend ready. Starting SvelteKit manager UI on http://${process.env.HOST}:${process.env.PORT}...`,
  );
  const { handler } = await import(
    pathToFileURL(path.join(__dirname, 'build', 'handler.js')).href
  );
  const protocolHeader = process.env.PROTOCOL_HEADER.toLowerCase();
  const server = http.createServer((req, res) => {
    // This server only speaks plain HTTP; a TLS proxy in front sends its own value.
    if (protocolHeader && !req.headers[protocolHeader]) {
      req.headers[protocolHeader] = 'http';
    }
    handler(req, res, () => {
      res.statusCode = 404;
      res.end('Not found');
    });
  });
  server.listen(Number(process.env.PORT), process.env.HOST, () => {
    console.log(
      `[supervisor] Listening on http://${process.env.HOST}:${process.env.PORT}`,
    );
  });
} catch (err) {
  console.error('[supervisor] Startup failed:', err);
  shutdown('STARTUP_ERROR', 1);
}
