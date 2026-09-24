#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "Set GH_TOKEN (GitHub PAT with repo scope for djh216/cellar-pulse)." >&2
  exit 1
fi

export GH_TOKEN
gh auth setup-git

REPO="${GITHUB_REPO:-djh216/Analytics}"

if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" \
    --public \
    --description "Cellar Pulse — account health for wine distribution"
fi

git remote set-url github "https://github.com/${REPO}.git"
git push -u github main
