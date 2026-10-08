#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x node_modules/.bin/next ]]; then
  npm ci
fi
exec npm run dev
