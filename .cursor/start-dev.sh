#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ ! -x node_modules/.bin/next ]]; then
  npm ci
fi
PORT="${PORT:-43123}"
if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/" 2>/dev/null; then
  echo "Next.js already responding on port ${PORT}"
  exit 0
fi
exec npm run dev
