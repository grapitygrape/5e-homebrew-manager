# Architecture

Overview of how 5e Homebrew Manager is structured across the Svelte 5 frontend,
pure TypeScript engine, Rust/Tauri desktop backend, and companion packages.

For the Foundry VTT SSE bridge design, see [`docs/FOUNDRY-BRIDGE.md`](./FOUNDRY-BRIDGE.md).

---

## 1. Dual runtime

`svelte.config.js` builds the same SvelteKit 2 + Svelte 5 codebase in two modes:

- **Desktop app (`npm run tauri:build` / `npm run tauri:dev`, primary):**
  `@sveltejs/adapter-static` SPA hosted in Tauri v2 (`src-tauri/`). Views call
  `src/lib/api/*`, which dispatches to Tauri commands and local filesystem I/O
  (`src-tauri/src/`). Two embedded Axum servers run inside the desktop process:
  - **`:5050`** (`server.rs`) — local preview server for the prepared 5etools
    site, with live item-price overrides and an injected site-browser toolbar
    (`site_browser.rs`).
  - **`:5051`** (`foundry.rs`) — Foundry VTT SSE bridge, allowlisted to
    _Settings → Foundry URL_.
- **Web mode (`npm run dev` / `npm run build`):** `@sveltejs/adapter-node` with
  SvelteKit server routes under `src/routes/api/*` and a Node Foundry bridge
  (`src/lib/server/foundry-bridge.ts`). Covers the homebrew, content, and
  Foundry views over LAN; desktop-only views (`/deploy`, `/customize`,
  `/sources`, `/setup`) require Tauri.

## 2. TypeScript layers (`src/`)

```
routes/ (Svelte 5 UI) -> lib/api/ (Tauri or HTTP) -> lib/services/ -> lib/data/ -> lib/engine/
```

- **`src/lib/engine/`** — pure, total functions (no `fs`, no DOM, no `fetch`).
  Organized by domain: `audit/` (schema introspection, validation, guide
  coverage, content links, collisions, submission lint, generated enums),
  `merge/` (`_copy`/`_mod` copy-applier, merge pipeline), `render/` (`{@tag}`
  enricher, entry renderer, entity sheets), `blocklist/`, `supersession/`,
  `foundry/` (wire types, candidates, report, replacements), `deploy-modules/`,
  and `item-prices.ts`. Relative imports keep their `.ts` extension so the
  engine runs directly under Node's type-stripping (`scripts/`) as well as Vite
  and Vitest.
- **`src/lib/data/`** — I/O seam (`DataSource` / `FsDataSource`) and config
  types/loaders (`config.ts`). Reads local folders or `https://` URLs.
- **`src/lib/services/`** — orchestration layer combining `DataSource` and
  `engine/` (validation, scanning, blocklist/content index, replacements, item
  prices, guides, Foundry checks, bridge deployment).
- **`src/lib/api/`** — transport facade used by routes; selects Tauri commands
  in desktop mode or `/api/*` `fetch` in web mode.
- **`src/lib/ui/`** — shared UI primitives (`View`, `Panel`, `Card`, `Button`,
  `Badge`, `Banner`, `RowCard`, etc.) and synced `mimic/` theme tokens.
- **`src/routes/`** — Svelte 5 views: Dashboard (`/`), Choose Content
  (`/blocklist`), Homebrew Files (`/files`), Replace Content (`/replacement`),
  Item Prices (`/shops/prices`; `/shops` redirects here), Conversion Guides
  (`/guides`), Schema Reference (`/reference`), Homebrew Parser (`/parser`),
  Customize Site (`/customize`), Deploy Site (`/deploy`), Source Data
  (`/sources`), Settings (`/settings`), and First-Run Setup (`/setup`).

## 3. Rust desktop backend (`src-tauri/src/`)

- **`config.rs` & `data_folder.rs`** — resolves `hbm-config.json`
  (`HBM_CONFIG_PATH` → app data dir → repo root) and manages the sibling data
  folder (`fonts/`, `scripts/`, `content/`, `.env`).
- **`repos.rs`** — git inspection, fetching, locking, and checkout management
  for the configured 5etools/homebrew/utils/image repositories.
- **`modules.rs`** — loads and validates `deploy-modules/*/module.json`
  manifests and user module settings.
- **`pipeline.rs` & `new_sources.rs`** — Prepare / Review / Publish pipeline:
  repo sync, auto-blocking newly added upstream sources (`known-sources.json`),
  applying enabled deploy modules, rebuilding the service worker, checking
  upstream script symbols, and publishing via robocopy + user deploy scripts.
- **`item_prices.rs`** — applies item price overrides to served/deployed JSON
  (kept in sync with `src/lib/engine/item-prices.ts` via shared fixtures).
- **`server.rs` & `site_browser.rs`** — local preview Axum server (`:5050`)
  and embedded site-browser bridge (send to Foundry, quick blocklist).
- **`foundry.rs`** — embedded Foundry bridge Axum server (`:5051`) and Tauri
  commands (`foundry_status`, `foundry_ask`, `foundry_command`).
- **`fs_cmds.rs` & `setup.rs`** — scoped filesystem commands for the frontend
  and first-run repository cloning / portable setup import.

## 4. Companion directories

- **`deploy-modules/`** — declarative site customizations (`module.json` +
  scripts/CSS/HTML patches) toggled in _Customize Site_ and bundled into desktop
  installers.
- **`customizer/`** — tooling for maintaining the Reskin theme patch
  (`upstream.patch` / `patch-deploy/`) against upstream 5etools releases.
- **`foundry-homebrew-bridge/`** — Foundry VTT companion module installed from
  _Settings_; its pure `scripts/lib/*.js` helpers are unit-tested directly by
  Vitest alongside the manager.
- **`guides/`** — entity conversion guides and reference docs bundled into the
  app and audited against the 5etools brew schemas by `npm run audit` and
  `npm run guides:enums`.
- **`scripts/`** — Node CLI utilities (`audit.ts`, `guide-enums.ts`,
  `upstream-check.ts`, `upstream-update.ts`, `release.ts`).

## 5. Key invariants

- **Bring-your-own data:** No copyrighted 5etools data or user homebrew is
  committed to the repo. All data folders (`5e/`, `homebrew/`, `data-sources/`)
  are gitignored and supplied by the user via `hbm-config.json`.
- **Plain files on disk:** All settings, blocklists, replacement maps, price
  overrides, and module manifests live as human-editable JSON/text files — never
  in an opaque database.
- **Verification:** `npm run verify` runs `svelte-check`, Vitest, `mimic:check`,
  guide coverage audit, and guide enum checks; Rust changes are verified with
  `cargo check` and `cargo test` under `src-tauri/`.
