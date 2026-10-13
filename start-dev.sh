#!/usr/bin/env bash
# Cloud Agent / local entrypoint — always resolves repo root (works from any cwd).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$ROOT/.cursor/start-dev.sh"
