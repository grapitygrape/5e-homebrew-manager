# 5e Homebrew Manager

A self-hosted Docker app (and Windows desktop app) for managing, validating, customizing, and hosting your own 5e rules reference site with the content you own, homebrew, integrate it all with Foundry VTT.

It helps you:

- Choose which content the site shows so that you can more easily limit the site to your content
- Write and validate homebrew JSON against the official schemas
- Point official entries at homebrew replacements
- Manage shop lists and custom item pricing
- Customize the site, preview changes safely, and publish to a built-in live server
- Publish homebrew to Foundry VTT and check your homebrew against a live Foundry world

---

## Quick Start: Docker Deployment (Recommended)

5e Homebrew Manager runs as a **single self-contained Docker container** that includes the Manager UI, the Foundry VTT bridge, a candidate preview server, and a read-only live site server for players.

Prebuilt multi-architecture images (`linux/amd64` and `linux/arm64`) are published automatically to **GitHub Container Registry (GHCR)**:

```text
ghcr.io/grapitygrape/5e-homebrew-manager:latest
```

You do **not** need to clone this repository or install Rust or Node on your server.

### Prerequisites

- Docker Engine with Docker Compose v2 (`docker compose`) — Linux, macOS, Windows Docker Desktop, or Synology DSM 7.2+ Container Manager.
- Enough disk space in `/data` for the source repositories you choose to clone (image repositories are optional and can be 15–30+ GB).

### 1. Create a folder with `compose.yaml` and `.env`

Download or copy [`compose.yaml`](compose.yaml) and [`.env.example`](.env.example) into a folder on your host, then rename `.env.example` to `.env`:

```bash
mkdir 5e-homebrew-manager && cd 5e-homebrew-manager
cp /path/to/compose.yaml .
cp /path/to/.env.example .env
```

> **Synology DSM users:** See [`SYNOLOGY-DEPLOYMENT.md`](SYNOLOGY-DEPLOYMENT.md) for a step-by-step Container Manager and Reverse Proxy walkthrough.

### 2. Sign in to GHCR (only if the package is private)

If the GitHub package is **private**, sign in once on your Docker host using a GitHub Personal Access Token (classic) with the `read:packages` scope:

```bash
echo "<YOUR_GITHUB_PAT>" | docker login ghcr.io -u <YOUR_GITHUB_USERNAME> --password-stdin
```

To allow unauthenticated pulls on any host (including Synology Container Manager without registry credentials), make the package **Public** on GitHub under **Packages → `5e-homebrew-manager` → Package settings → Change visibility**.

### 3. Configure `.env`

Open `.env` and set the values for your environment (defaults work out of the box on a standard Linux, macOS, or Windows host):

```dotenv
HBM_IMAGE=ghcr.io/grapitygrape/5e-homebrew-manager:latest
HBM_DATA_DIR=./data
PUID=1000
PGID=1000
TZ=America/Chicago

# Public or LAN URL players use to reach the live site (:8080)
HBM_SITE_URL=http://your-host:8080

# Recommended if the Manager is reachable beyond localhost
HBM_AUTH_USER=gm
HBM_AUTH_PASS=change-me
```

### 4. Start the container

```bash
docker compose up -d
```

Verify the container is healthy:

```bash
docker compose ps
curl http://localhost:5052/api/health
```

Expected response: `{"ok":true,"name":"5e-homebrew-manager","version":"...","runtime":"container",...}`.

### 5. Complete First-Run Setup

1. Open **`http://<your-host>:5052`** in your browser.
2. On first boot, the **Setup** wizard opens automatically with container-ready defaults:
   - Repositories root: `/data/repos`
   - Live site deploy folder: `/data/site`
   - Homebrew deploy folder: `/data/site/homebrew`
3. Enter the GitHub URLs for your source repositories and click **Download / update all**:

| In Setup               | What it's used for                      |
| ---------------------- | --------------------------------------- |
| **Tools source**       | The rules site itself and official data |
| **Homebrew files**     | Partnered and community homebrew        |
| **Homebrew utilities** | The official homebrew JSON schemas      |
| **Images source**      | Official site artwork (optional)        |
| **Homebrew images**    | Homebrew artwork (optional)             |

You can re-run Setup any time from _Settings → Run setup again_.

### 6. Build and Publish Your Live Site

1. Go to **Deploy Site**.
2. Click **Prepare** to sync your repos and apply your homebrew, blocklist, item prices, and customizations to the working checkout (`/data/repos/5e`).
   - Preview the result immediately at **`http://<your-host>:5050`** (includes the in-page GM toolbar to block items, add items to shops, or send items to Foundry).
3. Check the **Review** list for any blocking issues.
4. Click **Publish** to mirror the prepared site into `/data/site`.
   - The read-only player site is immediately live at **`http://<your-host>:8080`**.

---

## Docker Reference

### Ports & Security

| Port        | Audience     | Service                                                               | Protection                                                 |
| ----------- | ------------ | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| **`:5052`** | GM / Admin   | Manager Web UI, REST/SSE API, `/api/foundry/*`, `/api/bridge/*`       | Optional `HBM_AUTH_USER` / `HBM_AUTH_PASS` HTTP Basic Auth |
| **`:5051`** | GM / Foundry | Direct Foundry VTT bridge listener                                    | Foundry origin allowlist + optional `HBM_BRIDGE_TOKEN`     |
| **`:5050`** | GM / Admin   | Preview rules and tools site (`repo_5e` + GM toolbar)               | Optional `HBM_AUTH_USER` / `HBM_AUTH_PASS` HTTP Basic Auth |
| **`:8080`** | Players      | Live published rules and tools site (`/data/site` + `/img` + `/homebrew-img`) | Read-only static server (no Manager API or config access)  |

> **Security tip:** If you expose the site to players over the internet or a shared network, **only reverse-proxy or forward port `:8080`**. Keep `:5052`, `:5051`, and `:5050` on your private LAN/VPN or protect them with `HBM_AUTH_USER` / `HBM_AUTH_PASS`.

When `HBM_AUTH_USER` and `HBM_AUTH_PASS` are set, `/api/health`, `/api/foundry/{stream,result,state,status}`, and `/api/bridge/*` remain exempt so Docker healthchecks and Foundry VTT continue working without Basic Auth prompts (Foundry bridge requests are protected by the origin allowlist and optional `HBM_BRIDGE_TOKEN`).

### Persistent Volume Layout (`/data`)

All configuration, cloned repositories, custom assets, and the published site live under a single host-mounted `/data` directory (`HBM_DATA_DIR`):

```text
/data/
├── config/
│   ├── hbm-config.json          # Settings, repo URLs/locks, deploy targets, module toggles
│   ├── .env                     # Optional tokens for post-deploy scripts (e.g. Cloudflare)
│   ├── fonts/                   # Optional licensed theme fonts (.woff2 / .ttf)
│   ├── scripts/                 # Optional post-deploy scripts (.mjs / .js)
│   ├── content/                 # content-replacement.json, home-page.html, item-prices.json, shops/
│   └── homebrew/                # Your homebrew JSON working folder
├── repos/
│   ├── 5e/                      # Homebrew rules and tools site checkout (candidate preview root on :5050)
│   ├── 5e-img/                  # Official images (mounted directly at :8080/img)
│   ├── 5e-homebrew/             # Community/partnered homebrew checkout
│   ├── homebrew-img/            # Homebrew images (mounted directly at :8080/homebrew-img)
│   └── 5e-utils/                # Homebrew schemas checkout
└── site/                        # Live published site (served read-only on :8080)
```

> **Zero-duplicate image hosting:** When serving the live site from this container, you do **not** need to enable the heavy _"Copy 5e-img"_ deploy module. Port `:8080` mounts `/data/repos/5e-img` directly at `/img/*` and `/data/repos/homebrew-img` at `/homebrew-img/*`, saving 15–30+ GB of disk space and making **Publish** complete in seconds.

### Environment Variables (`.env`)

| Variable                          | Default                                        | Description                                                                                 |
| --------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `HBM_IMAGE`                       | `ghcr.io/grapitygrape/5e-homebrew-manager:latest` | Docker image and tag to run (pin a release like `:0.7.0` if desired).                       |
| `HBM_DATA_DIR`                    | `./data`                                       | Host path mounted to `/data` inside the container.                                          |
| `PUID` / `PGID`                   | `1000` / `1000`                                | UID/GID that owns files inside `/data` (e.g. `1026` / `100` on Synology DSM).               |
| `TZ`                              | `UTC`                                          | Container timezone (e.g. `America/Chicago`).                                                |
| `HBM_MANAGER_PORT`                | `5052`                                         | Host port mapped to the Manager UI (`:5052`).                                               |
| `HBM_BRIDGE_PORT`                 | `5051`                                         | Host port mapped to the direct Foundry bridge (`:5051`).                                    |
| `HBM_PREVIEW_PORT`                | `5050`                                         | Host port mapped to the candidate preview server (`:5050`).                                 |
| `HBM_SITE_PORT`                   | `8080`                                         | Host port mapped to the live site (`:8080`).                                                |
| `HBM_SITE_URL`                    | _(empty)_                                      | Public/LAN URL of the live site (`http://nas.local:8080` or `https://5e.example.com`).      |
| `HBM_SITE_BASE_PATH`              | `/`                                            | Optional subpath mount on `:8080` (e.g. `/5e`). Subdomain or dedicated port is recommended. |
| `HBM_PREVIEW_URL`                 | _(auto)_                                       | Public/LAN URL override for the `:5050` preview server.                                     |
| `HBM_AUTH_USER` / `HBM_AUTH_PASS` | _(empty)_                                      | Enables HTTP Basic Auth on `:5052` (Manager UI) and `:5050` (Preview).                      |
| `HBM_BRIDGE_TOKEN`                | _(empty)_                                      | Shared secret required by Foundry bridge requests when set.                                 |
| `HBM_FOUNDRY_URLS`                | _(empty)_                                      | Comma-separated allowed Foundry VTT origins for CORS (can also be managed in Settings).     |

### Updating or Pinning Versions

Pull the latest image and recreate the container (your `/data` volume is preserved):

```bash
docker compose pull
docker compose up -d
```

To pin a specific release instead of tracking `latest`, set `HBM_IMAGE` in `.env`:

```dotenv
HBM_IMAGE=ghcr.io/grapitygrape/5e-homebrew-manager:0.8.0
```

### Reverse Proxies & Synology NAS

If you put Nginx, Caddy, Traefik, or Synology DSM Reverse Proxy in front of `:5052`:

- Pass `X-Forwarded-Proto` and `X-Forwarded-Host` (honored automatically).
- Disable proxy buffering (`X-Accel-Buffering: no`) and enable WebSocket/SSE headers so live progress streams (`/api/events` and `/api/foundry/stream`) arrive immediately.
- Raise the proxy read timeout (e.g. `3600s`) so long-running `git clone` jobs and persistent Foundry SSE connections don't time out.

Full Synology DSM 7.2+ instructions live in [`SYNOLOGY-DEPLOYMENT.md`](SYNOLOGY-DEPLOYMENT.md).

---

## Desktop App (Windows)

If you prefer running locally instead of Docker, each GitHub Release has a portable Windows `.zip`. There's no installer: unzip it anywhere and run `homebrew-manager.exe`.

- Keeps its config and data in a `data/` folder next to the executable. To update, unzip the new version and copy your `data/` folder into it.
- Requires **git** on your machine to clone and update the source repositories during Setup.

---

## Connecting Foundry VTT

In **Homebrew Files**, the Foundry button checks whether your open Foundry world already has each item, spell, feat, and feature—plus whether it has artwork, a description, and Activities—and lets you send items or shops directly into Foundry.

Because Foundry connects from the **GM's browser**, Foundry VTT can run anywhere (your desktop PC, another container on the same NAS, or a remote host).

### 1. Install `foundry-homebrew-bridge` in Foundry VTT

- **Option A — Install via Manifest URL (Recommended for Docker):**
  1. Open **Settings** in Homebrew Manager (`http://<host>:5052/settings`) and copy the manifest URL (`http://<host>:5052/api/bridge/module.json`).
  2. In Foundry VTT **Add-on Modules → Install Module**, paste the Manifest URL and click **Install**.
- **Option B — Direct Folder Install (Desktop or same-host Docker):**
  - On Desktop: set **Settings → Foundry Data folder** to your Foundry `Data` folder and the app installs/updates the module automatically.
  - On Docker (same host as Foundry): uncomment the `/foundry-data` volume mount in `compose.yaml` and set **Settings → Foundry Data folder** to `/foundry-data`.

### 2. Configure the Bridge

1. Enable **Homebrew Manager Bridge** in your Foundry world (**Game Settings → Manage Modules**).
2. Under **Game Settings → Configure Settings → Homebrew Manager Bridge**, set:
   - **Manager URL:** `http://<manager-host>:5052` (or `http://<manager-host>:5051`)
   - **Bridge Token:** matching `HBM_BRIDGE_TOKEN`, if you set one in `.env`
3. In Homebrew Manager **Settings → Foundry URL** (or by clicking **Allow** next to the Foundry badge on **Homebrew Files**), make sure your Foundry origin (e.g. `http://nas.local:30000`) is allowed.

See [`foundry-homebrew-bridge/README.md`](foundry-homebrew-bridge/README.md) for troubleshooting and [`docs/FOUNDRY-BRIDGE.md`](docs/FOUNDRY-BRIDGE.md) for protocol details.

---

## The Views

| View                    | What it's for                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **Dashboard**           | What's loaded, whether anything needs attention, and links to your preview and live sites.     |
| **Choose Content**      | Hide official or partnered sources, or single entries, from the site.                          |
| **Homebrew Files**      | Your homebrew files: scan for errors, open in the Parser, check against Foundry, deploy.       |
| **Replace Content**     | Redirect links from an official entry to your homebrew replacement.                            |
| **Shops & Item Prices** | Manage custom item pricing and build shop lists to send to Foundry or embed in the site.       |
| **Conversion Guides**   | How to write each kind of homebrew entry, with a paste-to-check validator.                     |
| **Schema Reference**    | Every homebrew type's properties, generated from the schema, with a validator.                 |
| **Homebrew Parser**     | A JSON editor with a live outline, schema errors, and link checks for one file.                |
| **Customize Site**      | Turn the bundled site customizations and Reskin on and off.                                    |
| **Deploy Site**         | Build the next version of the site, review checks, preview on `:5050`, and publish to `:8080`. |
| **Source Data**         | The repo checkouts: current versions, updates, and version locking.                            |
| **Settings**            | Folders, URLs, Foundry bridge configuration, and deploy targets.                               |

---

## Updating Your Site

The upstream homebrew site updates frequently. **Deploy Site** pulls updated repo versions, builds each update into your working checkout, and checks it before anything goes live.

1. **Prepare.** Moves the repos to the versions configured in Source Data, refreshes homebrew, blocks any newly added sources (see below), applies your customizations, and rebuilds the offline cache. Nothing is published yet—preview the result on port `:5050`.
2. **Review.** Lists anything that needs attention:
   - _Blocking_ items could break the published site (Prepare warnings, broken customizations, or homebrew that fails to parse).
   - _Tidying_ items are non-blocking checks for homebrew collisions, guide coverage, and schema alignment.
   - **Roll back to the live version** returns every repo to the version you last published.
3. **Publish.** Mirrors the prepared site to your deploy folders (`/data/site` in Docker) and runs any configured post-deploy scripts.

**Prepare and publish if the checks pass** runs all three steps and pauses at Review if anything is blocking.

### New Sources Are Blocked Automatically

Each Prepare records known official books and partnered brews in `known-sources.json` beside `hbm-config.json`. On subsequent runs, newly introduced sources are automatically added to `content-blocklist.json` unless your own homebrew references them. Unblock them in **Choose Content**, or delete `known-sources.json` to start fresh.

### Keeping Homebrew in Step with the Site

The homebrew repo normally tracks its latest commit even when the site is pinned. Enable **Match commit date on Prepare** on its card in **Source Data** to keep them aligned in time.

---

## Configuration & Data Folder

Settings live in `hbm-config.json`, a plain human-editable JSON file resolved in this order:

1. `HBM_CONFIG_PATH` environment variable (`/data/config/hbm-config.json` in Docker),
2. OS app config folder (`%APPDATA%\Homebrew Manager\` on Windows, `~/.config/Homebrew Manager/` on Linux, `~/Library/Application Support/Homebrew Manager/` on macOS),
3. the application folder.

The folder holding `hbm-config.json` is the app's **data folder** (`/data/config/` in Docker). On startup the app creates these subfolders with a README in each explaining what goes there:

| Folder     | What goes in it                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `fonts/`   | Optional licensed fonts used by the site theme and Reskin (Modesto Condensed, Majesty). Nodesto Caps Condensed is bundled as fallback. |
| `scripts/` | Optional post-deploy scripts managed on the Deploy Site page (reads API tokens from a `.env` file placed in this data folder).         |
| `content/` | `content-replacement.json`, `home-page.html`, `item-prices.json`, and `shops/*.json`.                                                  |

---

## Development & Contributing

Building from source, running locally, maintaining upstream site updates, CI/CD, and releasing are documented in **[`CONTRIBUTING.md`](CONTRIBUTING.md)**.
