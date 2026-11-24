# Contributing & Development Guide

This guide covers building the Homebrew Manager from source, running it locally, handling upstream site updates, GitHub Actions CI/CD, and publishing releases.

For user installation and Docker deployment instructions, see [`README.md`](README.md).

---

## Tech Stack & Architecture

- **Frontend (`src/`):** Svelte 5 (runes), SvelteKit 2 (`@sveltejs/adapter-node` for Docker/web, `@sveltejs/adapter-static` for Tauri desktop), TypeScript, Vite 8, CodeMirror 6.
- **Shared Rust Core (`crates/hm-core/`):** Tauri-free Rust library powering config, git operations, customization patching, Prepare/Review/Publish pipeline, Foundry VTT bridge (`:5051`), candidate preview server (`:5050`), and live site server (`:8080`).
- **Headless Backend (`crates/hm-backend/`):** Axum RPC/SSE server wrapping `hm-core`, supervised by [`server.mjs`](server.mjs) in Docker and `npm run dev:web`.
- **Desktop Shell (`src-tauri/`):** Tauri v2 desktop wrapper around `hm-core`.
- **Config & State:** Plain human-editable JSON/text files on disk (`hbm-config.json`, `deploy-modules/*/module.json`, `fonts/`, `scripts/`, `content/`). Never store user rules solely in memory or an opaque database.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for architecture details and [`docs/FOUNDRY-BRIDGE.md`](docs/FOUNDRY-BRIDGE.md) for the Foundry VTT SSE protocol.

---

## Prerequisites

- **Node.js 22.12 or later**
- **git**
- **Rust** toolchain (for `hm-backend`, `hm-core`, and Tauri desktop builds)
- **Windows only:** Visual Studio **MSVC Build Tools** (for `cargo` / `tauri`)
- **Optional:** Docker Engine + Docker Compose v2 for local container builds

---

## Running Locally

Install Node dependencies first:

```powershell
npm install
```

### Full Web Mode (Matches Docker)

Starts both the headless `hm-backend` Rust server and the Vite dev server with all views active (Source Data, Customize Site, Deploy Site, Preview `:5050`, Live Site `:8080`, and Foundry Bridge `:5051`):

```powershell
npm run dev:web        # http://localhost:5173
```

### Frontend-Only Dev Server

Runs Vite without spawning `hm-backend` (homebrew, content, guides, schema, and Foundry views):

```powershell
npm run dev            # http://localhost:5173
```

### Desktop App (Tauri v2)

On Windows, run from a shell with Cargo and MSVC build tools loaded:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cmd /c "`"C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat`" && npm run tauri:dev"
```

### Building & Running the Docker Image Locally

To build from your local working tree instead of pulling from GHCR, use [`compose.build.yaml`](compose.build.yaml):

```bash
cp .env.example .env
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

---

## Commands

| Command                                   | What it does                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                          | Runs bundle check, `svelte-check`, Vitest, mimic check, guide audit, and enum check. Run before committing.                        |
| `npm test`                                | Frontend & engine unit tests (Vitest).                                                                                             |
| `npm run check`                           | Type-check (`svelte-check`).                                                                                                       |
| `npm run dev:web`                         | Runs headless `hm-backend` + Vite dev server together.                                                                            |
| `npm run dev`                             | Runs Vite dev server only.                                                                                                         |
| `npm run build`                           | Builds the production Node web bundle (`build/`, run via `node server.mjs`).                                                       |
| `npm run tauri:dev`                       | Runs the Tauri desktop app in dev mode.                                                                                            |
| `npm run tauri:build`                     | Builds the release desktop exe (`src-tauri\target\release`). There are no installers.                                             |
| `npm run release`                         | Bumps versions, builds the portable zip, pushes tag (triggering GHCR Docker build), and creates a GitHub Release.                  |
| `npm run audit`                           | Guide coverage check (fails if any guide is below 100%; accepts `-- --json` or `-- --quiet`). Needs local schema/guides folders.   |
| `npm run guides:enums`                    | Regenerates generated enum lists in `guides/`.                                                                                     |
| `npm run scripts:bundle -- --check`       | Verifies bundled injected scripts are up to date.                                                                                  |
| `npm run upstream:check`                  | Checks for a new upstream site release before updating.                                                                            |
| `npm run upstream:update`                 | Moves the customizer site and Reskin package to the new release.                                                                   |
| `npm run format` / `npm run format:check` | Formats or checks formatting with Prettier.                                                                                        |
| `npm run lint:css`                        | Lints CSS/Svelte styles with Stylelint.                                                                                            |
| `cargo test -p hm-core -p hm-backend`   | Runs the Rust backend unit tests.                                                                                                  |
| `cargo check --workspace`                 | Type-checks all Rust crates (`hm-core`, `hm-backend`, `src-tauri`).                                                              |

---

## Project Structure

```text
crates/hm-core/       Shared Tauri-free Rust core (config, git, pipeline, patches,
                       publish, Foundry bridge, preview & live servers).
crates/hm-backend/    Headless Rust backend binary for Docker and `npm run dev:web`.
src-tauri/             Tauri v2 desktop shell wrapping `hm-core`.
src/lib/engine/        Pure homebrew logic: merging, _copy, rendering, schema,
                       validation, guide audit (no file or network access).
src/lib/data/          Reads data from local folders or URLs.
src/lib/services/      Service layer called by the Svelte views.
src/lib/ui/            Shared UI primitives (View, Panel, Card, Button, ...).
src/routes/            SvelteKit pages and server API routes.
server.mjs             Production supervisor starting `hm-backend` + SvelteKit Node server.
Dockerfile             Multi-stage, multi-arch (`amd64`/`arm64`) container build.
compose.yaml           Pick-up-and-go Docker Compose file pulling from GHCR.
compose.build.yaml     Docker Compose override for building locally from source.
docker-entrypoint.sh   Container startup script (PUID/PGID, `/data` layout, git safe.directory).
deploy-modules/        Bundled site customizations shown in Customize Site.
customizer/            Site shell/reskin customizer & patch exporter.
foundry-homebrew-bridge/   Companion Foundry VTT module.
guides/                Homebrew conversion guides.
scripts/               Automation scripts (release, audit, upstream checks, dev:web).
docs/                  Architecture, deployment, and design notes.
.github/workflows/     CI (`ci.yml`) and multi-arch Docker image build (`docker.yml`).
```

---

## Upstream Site Updates (Maintainers)

Before preparing a new upstream site release:

1. **`npm run upstream:check`** runs Review's checks against the new upstream versions without touching your checkouts, plus checks Review can't run:
   - hand-typed guide lists missing values the schemas gained,
   - whether the Reskin package still applies,
   - whether the customizer site would rebase cleanly,
   - which upstream styling changes need a theme review.

   Use `--site-ref=` / `--utils-ref=` to check a particular release, or `--no-fetch` to skip fetching. With `--if-new`, it prints nothing unless there is a new release (useful for scheduled checks).

2. **`npm run upstream:update`** moves the customizer site and the Reskin package to the new release when no manual merge is needed:
   - Stops before changing anything if the site has uncommitted changes or if a source file needs a manual merge.
   - Rebases the site, builds it (taking upstream's side on generated-file conflicts and regenerating them), commits, saves `customizer/upstream.patch`, exports `customizer/patch-deploy`, and verifies it applies.
   - Pushes the site to its `origin` (pass `--no-push` to keep changes local).

3. Fix anything `upstream:check` still reports, then run **Prepare** in the app.

A Claude Code skill in `.claude/skills/` walks Claude Code through the entire process, including steps that require judgment.

### Fixing What Review Finds

- **A guide is below 100% coverage:** The schema gained a property. Document it in that guide (a `prop-card` or a row in its _Complete Property Index_). Check how upstream data and `js/` use it rather than guessing from the name.
- **A list in a guide is out of date:** Review can't see hand-typed lists; `upstream:check` flags ones that quote an enum's values. Search `guides/` for newly added values (sources, campaigns, environments, creature types) and update them—or make the list generated by adding its schema path to `ENUMS` in `src/lib/engine/audit/guide-enums.ts`.
- **A customization has no match:** Update its anchor text in `deploy-modules/<id>/module.json` to match the new upstream text, then run Prepare again.

Do this guide work during Review, while the checkouts are on the new versions, so `npm run verify` passes when you commit.

---

## Testing First-Run Setup Locally

1. **As a new user:** Set `$env:HBM_CONFIG_PATH = "$env:TEMP\hbm-test\hbm-config.json"` before running `npm run dev:web` or `npm run tauri:dev`, and pick a scratch folder to save under. The downloads are real and the homebrew repos are large; _Homebrew utilities_ is the quick one to watch. Delete `%TEMP%\hbm-test` to start over.
2. **With your own config:** Start in a new shell without `HBM_CONFIG_PATH`. Setup opens prefilled. _Download / update all_ runs `git pull --ff-only` on your real checkouts, so lock them in **Source Data** first, or skip that step.
3. **The portable build:** Run `npm run release -- --dry-run`, unzip `dist\5e-Homebrew-Manager_…-portable.zip` somewhere outside the repo and run the exe. Only the zipped copy shows that the guides and modules sit beside the exe. It keeps its settings in its own `data\` folder, so it never touches your dev config. Don't run the bare `.exe` in `target\release`: without the `portable` file it starts as a new user, and its setup writes the config your local web app will then read.

---

## GitHub Builds, CI & Releases

### Continuous Integration ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))

Runs automatically on pushes to `main`, pull requests to `main`, and manual `workflow_dispatch`:

- **Frontend job:** `npm ci`, `npm run scripts:bundle -- --check`, `npm run check`, `npm test`, `customizer/shell/export.mjs --from-patch --no-licensed-fonts`, and `npm run build`.
- **Rust job:** `cargo test -p hm-core -p hm-backend --locked`.

### Docker Multi-Arch Builds ([`.github/workflows/docker.yml`](.github/workflows/docker.yml))

Builds the multi-stage [`Dockerfile`](Dockerfile) and publishes to `ghcr.io/grapitygrape/5e-homebrew-manager`:

- **Fast multi-arch builds:** `rust-builder` runs on `$BUILDPLATFORM` and cross-compiles `hm-backend` natively (`x86_64-unknown-linux-gnu` and `aarch64-unknown-linux-gnu` via `gcc-aarch64-linux-gnu`) with BuildKit cache mounts; `node-builder` runs once on `$BUILDPLATFORM` since its JS/CSS/HTML outputs are architecture-independent.
- **Every run:** Builds `linux/amd64` without pushing and boots the container to check `GET /api/health`, the bridge manifest URLs, and the `/api/foundry` origin check.
- **Push tag `vX.Y.Z`:** Only then pushes `linux/amd64` + `linux/arm64`, tagged `:X.Y.Z`, `:X.Y` and `:latest`. Pushes to `main` and pull requests publish nothing.
- **Manual trigger:** Run on demand from GitHub → **Actions → Docker Multi-Arch Image → Run workflow**.

### Cutting a Release (`npm run release`)

```powershell
npm run release            # interactive patch / minor / major prompt
npm run release -- minor   # or exact version like 1.2.0
npm run release -- --dry-run
```

`scripts/release.ts` verifies `npm run verify`, updates `release-notes.md`, bumps versions across `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `crates/hm-core/Cargo.toml`, and `crates/hm-backend/Cargo.toml`, builds the Windows portable zip and the Foundry bridge zip, commits `"Release vX.Y.Z"`, pushes `main`, and creates the `vX.Y.Z` GitHub Release—which automatically triggers the tagged GHCR Docker build as well.

---

## Conventions & PR Checklist

- 2-space indentation in TypeScript, Svelte, and Rust.
- Reuse UI primitives from `src/lib/ui/` (`View`, `Panel`, `PanelHead`, `CardGrid`, `Card`, `Badge`, `Button`, `Bar`, `EmptyState`, `Link`) and CSS custom properties from `src/app.css`.
- Keep shell scripts (`*.sh`) and `Dockerfile` using LF line endings (enforced via `.gitattributes`).
- Do not hand-edit `customizer/upstream.patch` (regenerate via `customizer`'s `npm run save-patch`).
- Before committing or opening a PR, run:
  ```powershell
  npm run verify
  npm run build
  cargo test -p hm-core -p hm-backend
  ```
