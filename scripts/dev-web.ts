/**
 * scripts/dev-web.ts — starts the headless `hm-backend` Rust server alongside
 * the Vite dev server (`vite dev`), forwarding SIGINT/SIGTERM to both.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BACKEND_BIND = process.env.HBM_BACKEND_BIND ?? '127.0.0.1:5059';
const BACKEND_URL = process.env.HBM_BACKEND_URL ?? `http://${BACKEND_BIND}`;

function spawnBackend(): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HBM_BACKEND_BIND: BACKEND_BIND,
    CARGO_INCREMENTAL: process.env.CARGO_INCREMENTAL ?? '0',
    PATH: `${path.join(os.homedir(), '.cargo', 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
  };

  if (process.platform === 'win32') {
    const vcvars =
      'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat';
    if (fs.existsSync(vcvars)) {
      return spawn(
        'cmd.exe',
        ['/c', `"${vcvars}" >nul && cargo run -p hm-backend`],
        { stdio: 'inherit', env },
      );
    }
  }

  return spawn('cargo', ['run', '-p', 'hm-backend'], {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
}

function spawnVite(): ChildProcess {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return spawn(npx, ['vite', 'dev'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      HBM_BACKEND_URL: BACKEND_URL,
    },
    shell: process.platform === 'win32',
  });
}

const backend = spawnBackend();
const vite = spawnVite();

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!vite.killed) vite.kill('SIGTERM');
  if (!backend.killed) backend.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

backend.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`[dev:web] hm-backend exited with code ${code ?? 0}`);
    shutdown(code ?? 1);
  }
});

vite.on('exit', (code) => {
  if (!shuttingDown) {
    shutdown(code ?? 0);
  }
});
