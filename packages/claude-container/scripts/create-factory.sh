#!/bin/bash
# Create (or re-create) the Claude Container factory caplet on @host.
#
# Once installed, a "Create Claude Container" form lands in @host's inbox.
# Each submission of that form must include `filesystem`, the pet name of
# an FS capability already in @host's petstore — the factory will project
# that filesystem into a new microVM, start Claude Code inside it, and
# store a ClaudeClient exo under the chosen pet name.
#
# Usage:
#   ./scripts/create-factory.sh
#   FACTORY_NAME=my-claude-factory ./scripts/create-factory.sh
#   ORCHESTRATOR_SOCKET=/tmp/orch.sock ./scripts/create-factory.sh
#
# Idempotent: re-running after a daemon restart re-attaches the name.
set -euo pipefail

FACTORY_NAME="${FACTORY_NAME:-claude-container-factory}"
ORCHESTRATOR_SOCKET="${ORCHESTRATOR_SOCKET:-/run/claude-orch/api.sock}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -S "$ORCHESTRATOR_SOCKET" ]; then
  echo "Warning: ORCHESTRATOR_SOCKET=$ORCHESTRATOR_SOCKET does not exist or is not a socket." >&2
  echo "         The factory will register, but form submissions will fail until the" >&2
  echo "         claude-orch daemon (see DESIGN.md) is running and listening there." >&2
fi

endo run --UNCONFINED "$PACKAGE_DIR/setup.js" --powers @agent \
  -E FACTORY_NAME="$FACTORY_NAME" \
  -E ORCHESTRATOR_SOCKET="$ORCHESTRATOR_SOCKET"

echo "Factory \"$FACTORY_NAME\" provisioned."
echo "Submit the \"Create Claude Container\" form in @host's inbox to spawn a sandbox."
