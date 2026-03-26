#!/bin/bash
# Reload Jaine after code changes.
# Restarts the daemon and re-provisions the agent while preserving
# the provider config (no need to re-enter API keys).
#
# Usage:  ./reload.sh
set -euo pipefail

ENDO="$(dirname "$0")/../cli/bin/endo"

echo "==> Stopping daemon..."
"$ENDO" stop 2>/dev/null || true

echo "==> Starting daemon..."
"$ENDO" start

echo "==> Provisioning LLM provider factory..."
"$ENDO" run --UNCONFINED setup.js --powers @agent

echo "==> Registering provider (reuses existing .env)..."
# Source env vars
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

"$ENDO" run --UNCONFINED ../fae/submit-provider.js --powers @agent \
  -E PROVIDER_NAME="${PROVIDER_NAME:-default}" \
  -E LAL_HOST="${LAL_HOST:-https://api.anthropic.com}" \
  -E LAL_MODEL="${LAL_MODEL:-claude-sonnet-4-6-20250514}" \
  -E LAL_AUTH_TOKEN="$LAL_AUTH_TOKEN"

echo "==> Creating Jaine factory + default agent..."
"$ENDO" run --UNCONFINED jaine-factory-setup.js --powers @agent \
  -E PROVIDER_NAME="${PROVIDER_NAME:-default}" \
  -E FACTORY_NAME="${FACTORY_NAME:-jaine-factory}"

echo "==> Jaine reloaded."
