# syntax=docker/dockerfile:1.7

# ==============================================================================
# Stage 1: Build headless Rust backend (`hm-backend`)
# Runs on the host build architecture and cross-compiles cleanly for amd64/arm64
# (hm-backend has zero Linux C-library dependencies), avoiding slow QEMU builds.
# ==============================================================================
FROM --platform=$BUILDPLATFORM rust:1-bookworm AS rust-builder
ARG BUILDARCH
ARG TARGETARCH
WORKDIR /build

RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) RUST_TARGET="x86_64-unknown-linux-gnu" ;; \
      arm64) RUST_TARGET="aarch64-unknown-linux-gnu" ;; \
      *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    echo "$RUST_TARGET" > /tmp/rust-target; \
    : > /tmp/rust-env; \
    if [ "$TARGETARCH" != "$BUILDARCH" ]; then \
      apt-get update; \
      if [ "$TARGETARCH" = "arm64" ]; then \
        apt-get install -y --no-install-recommends gcc-aarch64-linux-gnu libc6-dev-arm64-cross; \
        echo "CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc" > /tmp/rust-env; \
      elif [ "$TARGETARCH" = "amd64" ]; then \
        apt-get install -y --no-install-recommends gcc-x86-64-linux-gnu libc6-dev-amd64-cross; \
        echo "CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=x86_64-linux-gnu-gcc" > /tmp/rust-env; \
      fi; \
      rm -rf /var/lib/apt/lists/*; \
      rustup target add "$RUST_TARGET"; \
    fi

COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY src-tauri ./src-tauri

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/build/target,id=cargo-target-${TARGETARCH},sharing=locked \
    set -eux; \
    RUST_TARGET="$(cat /tmp/rust-target)"; \
    if [ -s /tmp/rust-env ]; then export $(cat /tmp/rust-env); fi; \
    cargo build --release -p hm-backend --target "$RUST_TARGET" --locked; \
    install -Dm755 "target/${RUST_TARGET}/release/hm-backend" /out/hm-backend

# ==============================================================================
# Stage 2: Build SvelteKit `@sveltejs/adapter-node` bundle & export reskin seed
# All production Node outputs are pure JS/CSS/HTML (architecture-independent),
# so this stage runs once natively on $BUILDPLATFORM.
# ==============================================================================
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS node-builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN node --experimental-strip-types --no-warnings=ExperimentalWarning \
      customizer/shell/export.mjs --from-patch --no-licensed-fonts \
    && npm run build \
    && npm prune --omit=dev

# ==============================================================================
# Stage 3: Lean runtime image (Node 22 + hm-backend + git + rsync + gosu + tini)
# ==============================================================================
FROM node:22-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="5e Homebrew Manager" \
      org.opencontainers.image.description="Self-hosted 5e homebrew manager, site customizer, Foundry VTT bridge, and live rules site server" \
      org.opencontainers.image.source="https://github.com/grapitygrape/5e-homebrew-manager"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    gosu \
    openssh-client \
    rsync \
    tini \
    tzdata \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=rust-builder /out/hm-backend /usr/local/bin/hm-backend
COPY --from=node-builder /app/build /app/build
COPY --from=node-builder /app/node_modules /app/node_modules
COPY --from=node-builder /app/package.json /app/package.json
COPY --from=node-builder /app/server.mjs /app/server.mjs
COPY --from=node-builder /app/guides /app/guides
COPY --from=node-builder /app/deploy-modules /app/deploy-modules
COPY --from=node-builder /app/foundry-homebrew-bridge /app/foundry-homebrew-bridge
COPY --from=node-builder /app/customizer/patch-deploy /app/customizer/patch-deploy
COPY --from=node-builder /app/src-tauri/data-folder /app/src-tauri/data-folder
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/hm-backend

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5052 \
    HBM_CONTAINER=1 \
    HBM_APP_DIR=/app \
    HBM_BIND_HOST=0.0.0.0 \
    HBM_CONFIG_PATH=/data/config/hbm-config.json \
    PROTOCOL_HEADER=x-forwarded-proto \
    HOST_HEADER=x-forwarded-host \
    BODY_SIZE_LIMIT=50M

EXPOSE 5052 5051 5050 8080

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5052/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "/app/server.mjs"]
