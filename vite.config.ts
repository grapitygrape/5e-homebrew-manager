// vite.config.ts — Vite 8 + SvelteKit, with Vitest wired in.
//
// `defineConfig` comes from vitest/config so the `test` block is typed. The
// engine's *.test.ts files import from 'vitest' and use explicit `.ts` relative
// imports — Vite resolves both. `npm test` runs them; CI can gate on coverage.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

// Bring-your-own-data folders that must NOT be watched. If they live inside the
// project (e.g. ./guides) Vite's HMR watcher tries to watch every file; a large,
// network-mounted, or locked file throws EBUSY and crashes the dev server on
// Windows. Data is read on demand by the server, never watched.
//
// These are ROOT-ANCHORED absolute paths, not `**/name/**` globs. An unanchored
// glob matches any path segment anywhere — `**/guides/**` silently un-watched
// `src/routes/guides/`, so edits to that route (including its <style> block)
// never triggered HMR. Anchoring is the whole point; don't revert to `**/`.
const UNWATCHED = [
  '.cache',
  'guides',
  'homebrew',
  'lists',
  'data-sources',
  'hbm-config.json',
  // Cargo's crates and output. A .pdb the linker holds open throws the same EBUSY.
  'crates',
  'target',
  'src-tauri',
].map((p) => resolve(root, p).replace(/\\/g, '/'));

/** True for the data folders above and anything inside them. Windows-safe: both
 *  sides are normalised to forward slashes before comparing. */
const isUnwatched = (file: string): boolean => {
  const f = file.replace(/\\/g, '/');
  return UNWATCHED.some((u) => f === u || f.startsWith(`${u}/`));
};

// Opt-in polling escape hatch: `HBM_POLL=1 npm run dev`. Native filesystem
// events are the fast path and the default, but they can be swallowed on
// Windows by antivirus/indexing, by editors that save atomically (write-temp
// then rename), or on any network/virtualised mount. Polling always works; it
// just costs CPU. If HBM_POLL=1 fixes your HMR, the cause was event delivery.
const poll = process.env.HBM_POLL === '1';

export default defineConfig({
  plugins: [sveltekit(), watchDiagnostics()],
  server: {
    watch: {
      ignored: [isUnwatched],
      ...(poll ? { usePolling: true, interval: 300 } : {}),
    },
  },
  css: {
    // Source maps make the browser point at app.css / the real <style> block
    // instead of an injected blob, so you can confirm a hot update actually
    // landed rather than guessing from the rendered result.
    devSourcemap: true,
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.test.ts'],
    // The engine is pure (no DOM); a node environment keeps these tests fast.
    environment: 'node',
    // Env first: config modules read HBM_* when they load.
    // Services read through lib/fs; tests use the real disk via Node.
    setupFiles: [
      'src/lib/server/__tests__/setup-env.ts',
      'src/lib/server/__tests__/setup-fs.ts',
    ],
  },
});

/**
 * Dev-only instrumentation. Prints every file event the watcher delivers and
 * every HMR payload pushed to the browser, so a failure to refresh can be
 * attributed rather than guessed at:
 *
 *   [watch] change src/app.css   → OS event arrived; watcher is healthy.
 *   [hmr]   update src/app.css   → server sent the update; fault is client-side
 *                                  (dead websocket, service worker, hard cache).
 *   neither line on save         → the OS event never arrived. Retry with
 *                                  HBM_POLL=1; if that fixes it, it was event
 *                                  delivery, not Vite.
 *
 * Set HBM_WATCH_DEBUG=0 to silence. Costs nothing in build/preview — `apply`
 * restricts this plugin to `vite dev`.
 */
function watchDiagnostics() {
  return {
    name: 'hbm:watch-diagnostics',
    apply: 'serve' as const,
    configureServer(server: {
      watcher: { on: (e: string, cb: (f: string) => void) => void };
      ws: {
        send: (p: unknown) => void;
        on: (e: string, cb: () => void) => void;
        clients: Set<unknown>;
      };
      config: { root: string };
    }) {
      if (process.env.HBM_WATCH_DEBUG === '0') return;

      // Normalise slashes BEFORE stripping the root: chokidar hands back
      // backslashes on Windows while config.root uses forward slashes, so
      // stripping first silently no-ops and prints the full absolute path.
      const norm = (f: string) => f.replace(/\\/g, '/');
      const rootDir = norm(server.config.root);
      const rel = (f: string) =>
        norm(f).replace(rootDir, '').replace(/^\//, '');

      for (const event of ['add', 'change', 'unlink'] as const) {
        server.watcher.on(event, (file: string) => {
          console.log(`\x1b[2m[watch]\x1b[0m ${event} ${rel(file)}`);
        });
      }

      // The decisive signal. `clients` is the set of live HMR websockets. If a
      // update goes out with clients=0, the browser never opened the socket and
      // no server-side change will ever reach it — look at the browser, not Vite.
      server.ws.on('connection', () =>
        console.log(
          `\x1b[32m[ws]\x1b[0m    client connected (${server.ws.clients.size})`,
        ),
      );

      const send = server.ws.send.bind(server.ws);
      server.ws.send = (payload: unknown) => {
        const p = payload as { type?: string; updates?: { path: string }[] };
        const n = server.ws.clients.size;
        if (p?.type === 'update') {
          console.log(
            `\x1b[36m[hmr]\x1b[0m   update ${p.updates?.map((u) => rel(u.path)).join(', ')} \x1b[2m→ clients=${n}\x1b[0m`,
          );
        } else if (p?.type === 'full-reload') {
          console.log(
            `\x1b[33m[hmr]\x1b[0m   full-reload \x1b[2m→ clients=${n}\x1b[0m`,
          );
        }
        return send(payload);
      };
    },
  };
}
