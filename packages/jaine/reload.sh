#!/bin/bash
# Reload Jaine after code changes.
# The pinned driver auto-starts with new code on daemon restart.
# Full setup only runs if the driver isn't already pinned.
#
# Usage:  ./reload.sh
#         ./reload.sh --full   # force full re-provision
set -euo pipefail

ENDO="$(dirname "$0")/../cli/bin/endo"

echo "==> Stopping daemon..."
"$ENDO" stop 2>/dev/null || true

echo "==> Starting daemon..."
"$ENDO" start

# The pinned driver auto-starts on daemon boot with current code.
# Only run full setup if --full flag is passed or driver doesn't exist.
if [ "${1:-}" = "--full" ]; then
  echo "==> Full re-provision requested..."
  # Remove old driver so createAgent re-launches it
  "$ENDO" remove jaine-driver 2>/dev/null || true
  "$ENDO" remove jaine-factory 2>/dev/null || true
  RUN_SETUP=true
else
  # Check if jaine-driver exists (auto-started from pin)
  if "$ENDO" list 2>/dev/null | grep -q "jaine-driver"; then
    echo "==> Pinned driver auto-started. Skipping setup."
    RUN_SETUP=false
  else
    echo "==> No pinned driver found. Running full setup..."
    RUN_SETUP=true
  fi
fi

if [ "$RUN_SETUP" = true ]; then
  echo "==> Loading .env..."
  ENV_FILE=".env"
  if [ ! -f "$ENV_FILE" ]; then
    FAE_ENV="$(dirname "$0")/../fae/.env"
    if [ -f "$FAE_ENV" ]; then
      ENV_FILE="$FAE_ENV"
    else
      echo "Error: No .env found." >&2
      exit 1
    fi
  fi
  set -a; source "$ENV_FILE"; set +a

  echo "==> Running comprehensive Jaine setup..."
  "$ENDO" run --UNCONFINED setup.js --powers @agent \
    -E ENDO_LLM_NAME="${PROVIDER_NAME:-default}" \
    -E ENDO_LLM_HOST="${LAL_HOST:-https://api.anthropic.com}" \
    -E ENDO_LLM_MODEL="${LAL_MODEL:-claude-sonnet-4-6-20250514}" \
    -E ENDO_LLM_AUTH_TOKEN="${LAL_AUTH_TOKEN:-$ENDO_LLM_AUTH_TOKEN}"
fi

echo "==> Jaine reloaded."
