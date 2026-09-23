#!/usr/bin/env bash
# Nexus Forge — Linux/macOS launcher
# Requires: Bun (https://bun.sh) and (optional) pnpm for first install.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── NEXUS FORGE ──────────────────────────────"
if ! command -v bun >/dev/null 2>&1; then
  echo "✖ Bun not found. Install it first:"
  echo "   curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "· first run: installing dependencies (pnpm)…"
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "  pnpm not found — installing via bunx…"
    bunx --bun pnpm install
  else
    pnpm install
  fi
fi

if [ ! -f "apps/ui/dist/index.html" ]; then
  echo "· building UI…"
  (cd apps/ui && ../../node_modules/.bin/vite build 2>/dev/null || ./node_modules/.bin/vite build)
fi

echo "· starting studio → http://127.0.0.1:5180"
exec bun run packages/core/src/main.ts serve
