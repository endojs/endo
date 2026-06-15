#!/bin/bash
# Source an .env file and provision the Floot factory + default pinned agent.
#
# Usage:
#   ./setup-factory.sh            # reads .env in cwd
#   ./setup-factory.sh path/to/.env
set -euo pipefail

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Copy .env.example to .env and fill in your values." >&2
  exit 1
fi

set -a; source "$ENV_FILE"; set +a

endo run --UNCONFINED floot-factory-setup.js --powers @agent \
  -E FACTORY_NAME="${FACTORY_NAME:-floot-factory}" \
  -E FLOOT_PROVIDER="${FLOOT_PROVIDER:-anthropic}" \
  -E FLOOT_MODEL="${FLOOT_MODEL:-}" \
  -E ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
