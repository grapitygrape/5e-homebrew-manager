# Docker & Synology Container Manager Deployment Guide

Homebrew Manager ships as a **self-contained single container** (prebuilt multi-arch image at `ghcr.io/grapitygrape/5e-homebrew-manager:latest` for `linux/amd64` and `linux/arm64`) that runs:

1. **Manager Web UI & API (`:5052`)** — Full GM interface (Homebrew editor, Sources & Blocklist, Shops & Prices, Theme Customizer, Setup & Git clone/pull wizard, Prepare & Publish pipeline, and Foundry VTT bridge proxy).
2. **Foundry VTT Bridge (`:5051` + `:5052/api/foundry/*`)** — Real-time SSE/POST bridge for syncing items, checking world compendiums, and sending items/shops directly to Foundry VTT.
3. **Candidate Preview Server (`:5050`)** — Live uncached preview of your working site checkout (`repo_5e`) with on-the-fly item pricing, service-worker neutralization, and in-page GM toolbar (`site-browser.js`) for adding items to the blocklist, adding items to shops, or sending items to Foundry VTT from any browser tab.
4. **Live Published Site (`:8080`)** — High-performance, read-only player-facing site server with Gzip/Brotli compression, tiered `Cache-Control`, and zero-copy `/img/*` and `/homebrew-img/*` mounts.

---

## 1. Quickstart (Any Linux, macOS, or Windows Docker Host)

1. Copy [`compose.yaml`](../compose.yaml) and [`.env.example`](../.env.example) into a folder (no git clone required):
   ```bash
   cp .env.example .env
   ```
2. _(Only if the GitHub package is private)_ Sign in to GHCR once with a GitHub PAT (`read:packages` scope):
   ```bash
   echo "<YOUR_GITHUB_PAT>" | docker login ghcr.io -u <YOUR_GITHUB_USERNAME> --password-stdin
   ```
   _(Or make the GHCR package public under GitHub → Packages → `5e-homebrew-manager` → Package settings for unauthenticated pulls.)_
3. Start the container:
   ```bash
   docker compose up -d
   ```
   _(To build locally from a git checkout instead of pulling from GHCR, run `docker compose -f compose.yaml -f compose.build.yaml up -d --build`.)_
4. Open **`http://<host>:5052`** in your browser.
5. On first boot, the **`/setup` wizard** opens automatically with container-ready defaults:
   - Repositories root: `/data/repos`
   - Live site deploy folder: `/data/site`
   - Homebrew deploy folder: `/data/site/homebrew`
6. Click through the Setup wizard to clone your source repositories into `/data/repos`.
7. Go to **Deploy Site** and run **Prepare & Publish**:
   - **Prepare** builds your candidate site in `/data/repos/5e`, immediately viewable on **`http://<host>:5050`**.
   - **Publish** mirrors the prepared site into `/data/site`, immediately live for players on **`http://<host>:8080`**.

---

## 2. Port & Trust Boundary Reference

| Port | Audience | Service | Auth / Protection |
| --- | --- | --- | --- |
| **`:5052`** | GM / Admin | Manager Web UI, REST/SSE API, `/api/foundry/*`, `/api/bridge/*` | Optional `HBM_AUTH_USER` / `HBM_AUTH_PASS` HTTP Basic Auth |
| **`:5051`** | GM / Foundry | Direct Foundry VTT bridge listener (same protocol as `:5052/api/foundry/*`) | Foundry origin allowlist + optional `HBM_BRIDGE_TOKEN` |
| **`:5050`** | GM / Admin | Candidate preview site (`repo_5e` + `site-browser.js` GM toolbar) | Optional `HBM_AUTH_USER` / `HBM_AUTH_PASS` HTTP Basic Auth |
| **`:8080`** | Players | Live published site (`/data/site` + `/img` + `/homebrew-img`) | Read-only static file server (no Manager APIs or config access) |

> **Security Tip:** If you expose the live site to players over the internet or a shared network, **only forward or reverse-proxy port `:8080`**. Keep `:5052`, `:5051`, and `:5050` on your private LAN/VPN or protect them with `HBM_AUTH_USER` / `HBM_AUTH_PASS`.

---

## 3. Persistent Volume Layout (`/data`)

The container stores all persistent state under a single `/data` volume:

```text
/data/
├── config/
│   ├── hbm-config.json          # Saved Settings, repo URLs, deploy targets, module toggles
│   ├── .env                     # Optional tokens for deploy scripts (Cloudflare, etc.)
│   ├── fonts/                   # Custom theme fonts (.woff2 / .ttf)
│   ├── scripts/                 # Post-deploy scripts (.mjs / .js)
│   ├── content/                 # Home page markdown, item-prices.json, shops/, patch-deploy/
│   └── homebrew/                # Local homebrew JSON working folder
├── repos/
│   ├── 5e/                      # Rules site checkout (candidate preview root)
│   ├── 5e-img/                  # Official images (mounted directly at :8080/img)
│   ├── 5e-homebrew/             # Community/partnered homebrew checkout
│   ├── homebrew-img/            # Homebrew images (mounted directly at :8080/homebrew-img)
│   └── 5e-utils/                # Homebrew schemas checkout
└── site/                        # Published live site root (served on :8080)
```

> **Zero-Duplicate Image Hosting:** You do **not** need to enable the heavy _"Copy 5e-img"_ deploy module when hosting the live site from this container. The live site server (`:8080`) mounts `/data/repos/5e-img` directly at `/img/*` and `/data/repos/homebrew-img` at `/homebrew-img/*`, saving 15–30+ GB of duplicate files and making **Publish** complete in seconds.

---

## 4. Synology DSM 7.2+ Container Manager Setup

### Step 1: Prepare the Shared Folder & Find Your `PUID` / `PGID`

1. In Synology DSM **File Station**, create the folder:
   ```text
   /docker/5e-homebrew-manager/data
   ```
   (On disk this is `/volume1/docker/5e-homebrew-manager/data`.)
2. Determine your Synology user's UID and GID (typically `PUID=1026` and `PGID=100` for the primary DSM administrator). You can verify over SSH with `id`.
3. _(Only if the GHCR package is private)_ Add `ghcr.io` under **Container Manager → Registry → Settings → Add** (or run `docker login ghcr.io` over SSH as root/admin). Making the GitHub package **Public** removes this step completely.

### Step 2: Create the Container Manager Project

1. Open **Container Manager** → **Project** → **Create**.
2. Set:
   - **Project name:** `5e-homebrew-manager`
   - **Path:** `/docker/5e-homebrew-manager`
   - **Source:** Choose _Create docker-compose.yml_ and paste [`compose.yaml`](../compose.yaml) (or upload it).
3. Create `.env` inside `/volume1/docker/5e-homebrew-manager` (or configure the environment in the Project wizard):
   ```dotenv
   HBM_IMAGE=ghcr.io/grapitygrape/5e-homebrew-manager:latest
   HBM_DATA_DIR=/volume1/docker/5e-homebrew-manager/data
   PUID=1026
   PGID=100
   TZ=America/Chicago
   HBM_SITE_URL=http://synology.local:8080
   HBM_AUTH_USER=gm
   HBM_AUTH_PASS=change-me
   ```
4. Start the project. Container Manager pulls the prebuilt image from GHCR and automatically monitors `/api/health`.
5. To update later: open the Project in Container Manager and click **Action → Build** (or **Update the image** / `docker compose pull && docker compose up -d` over SSH).

---

## 5. Synology DSM Reverse Proxy Configuration

If you use **DSM Control Panel → Login Portal → Advanced → Reverse Proxy** to put HTTPS domains in front of the Manager (`https://hbm.your-nas.local` → `localhost:5052`) or the Live Site (`https://5e.your-nas.local` → `localhost:8080`):

1. **Enable WebSocket / Custom Headers (for `:5052` Manager & Foundry Bridge SSE):**
   - In the Reverse Proxy rule for `:5052`, open the **Custom Header** tab → **Create → WebSocket**.
   - Make sure `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Accel-Buffering: no` are passed so Server-Sent Events (`/api/events` and `/api/foundry/stream`) stream immediately without nginx buffering.
2. **Increase Proxy Read Timeout:**
   - Set **Proxy Read Timeout** to `3600` seconds on the `:5052` rule so long-running `git clone` (especially `5e-img`) and long-lived Foundry SSE streams do not time out at 60 seconds.
3. **Subpath Hosting (`HBM_SITE_BASE_PATH`):**
   - We recommend **subdomain or dedicated port** hosting for the live site (`https://5e.your-nas.local` or `:8080`) because the site uses root-relative asset paths.
   - If you need subpath prefixing on `:8080`, set `HBM_SITE_BASE_PATH=/5e` in `.env`.

---

## 6. Connecting Foundry VTT to the Containerized Manager

Because Foundry VTT connects **from the GM's browser** to the Manager, Foundry VTT can run anywhere (on your desktop PC, in another container on your Synology NAS, or on a remote cloud host).

### Installing `foundry-homebrew-bridge` in Foundry VTT

- **Option A — Install via Manifest URL (Works Anywhere, Recommended for Docker):**
  1. Open **Settings** in Homebrew Manager (`http://<host>:5052/settings`) and click **Copy manifest URL** under _Foundry Data folder_ (or copy `http://<host>:5052/api/bridge/module.json`).
  2. In Foundry VTT Setup → **Add-on Modules** → **Install Module**, paste the Manifest URL into **Manifest URL** and click **Install**.
- **Option B — Bind-Mount Foundry's `Data` Folder (When Foundry Runs on the Same Host):**
  1. Uncomment the `/foundry-data` volume mount in `compose.yaml`:
     ```yaml
     volumes:
       - ${HBM_DATA_DIR:-./data}:/data
       - /volume1/docker/foundryvtt/Data:/foundry-data
     ```
  2. In Manager **Settings → Foundry Data folder**, set `/foundry-data` and click **Save** (or **Deploy bridge**).

### Configuring the Bridge in Your Foundry World

1. Enable **Homebrew Manager Bridge** in your Foundry world (**Game Settings → Manage Modules**).
2. Open **Game Settings → Configure Settings → Homebrew Manager Bridge**:
   - **Manager URL:** Set to `http://<manager-host>:5052` (or `http://<manager-host>:5051`).
   - **Bridge Token:** If you set `HBM_BRIDGE_TOKEN` in the container's `.env`, paste the same token here.
3. In Homebrew Manager **Settings → Foundry URL** (or by clicking **Allow** next to the Foundry badge on the **Homebrew Files** page), ensure your Foundry VTT origin (e.g., `http://synology.local:30000`) is listed in the allowlist.
