#!/bin/bash
# Source an .env file and submit the LLM provider form.
# Reuses fae's submit-provider.js since the provider factory is shared.
#
# Usage:
#   ./provider-setup.sh            # reads .env in cwd
#   ./provider-setup.sh path/to/.env
set -euo pipefail

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  # Fall back to fae's .env
  FAE_ENV="$(dirname "$0")/../fae/.env"
  if [ -f "$FAE_ENV" ]; then
    ENV_FILE="$FAE_ENV"
    echo "Using fae .env: $FAE_ENV"
  else
    echo "Error: No .env found. Copy .env.example to .env and fill in your values." >&2
    exit 1
  fi
fi

set -a; source "$ENV_FILE"; set +a

endo run --UNCONFINED ../fae/submit-provider.js --powers @agent \
  -E PROVIDER_NAME="${PROVIDER_NAME:-default}" \
  -E LAL_HOST="${LAL_HOST:-https://api.anthropic.com}" \
  -E LAL_MODEL="${LAL_MODEL:-claude-sonnet-4-6-20250514}" \
  -E LAL_AUTH_TOKEN="$LAL_AUTH_TOKEN"
