#!/usr/bin/env sh
# Deploy the relay server to fly.io.
# Run from the packages/relay-server directory.
#
# First-time setup:
#   fly launch --no-deploy
#   fly secrets set RELAY_DOMAIN=<your-app>.fly.dev
#
# Subsequent deploys:
#   ./scripts/deploy.sh

set -e

cd "$(dirname "$0")/.."

fly deploy --ha=false
