#!/usr/bin/env bash
set -euo pipefail

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

export HBM_CONTAINER="${HBM_CONTAINER:-1}"
export HBM_APP_DIR="${HBM_APP_DIR:-/app}"
export HBM_CONFIG_PATH="${HBM_CONFIG_PATH:-/data/config/hbm-config.json}"
export HBM_BIND_HOST="${HBM_BIND_HOST:-0.0.0.0}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-5052}"

# Ensure persistent volume subdirectories exist
mkdir -p \
  /data/config \
  /data/config/fonts \
  /data/config/scripts \
  /data/config/content \
  /data/config/content/shops \
  /data/config/homebrew \
  /data/repos \
  /data/site

# Seed data-folder READMEs and .env.example if missing
if [ -d /app/src-tauri/data-folder ]; then
  cp -rn /app/src-tauri/data-folder/. /data/config/ 2>/dev/null || true
fi

# Adjust user/group to match host PUID/PGID (e.g. Synology DSM 1026:100)
if [ "$(id -u)" = "0" ]; then
  if ! getent group hbm >/dev/null 2>&1; then
    groupadd -o -g "$PGID" hbm
  else
    groupmod -o -g "$PGID" hbm
  fi

  if ! id -u hbm >/dev/null 2>&1; then
    useradd -o -u "$PUID" -g "$PGID" -d /data -s /bin/bash -M hbm
  else
    usermod -o -u "$PUID" -g "$PGID" -d /data hbm
  fi

  # Only touch files with the wrong owner: a full chown -R of a large site
  # on NAS disks can outlast the healthcheck grace period on every start.
  find /data/config /data/site \( ! -user "$PUID" -o ! -group "$PGID" \) \
    -exec chown -h "$PUID:$PGID" {} + 2>/dev/null || true
  chown "$PUID:$PGID" /data /data/repos 2>/dev/null || true

  # Ensure git trusts mounted repo checkouts even if host UID differs
  gosu "$PUID:$PGID" git config --global --add safe.directory '*' || true

  exec gosu "$PUID:$PGID" "$@"
fi

git config --global --add safe.directory '*' || true
exec "$@"
