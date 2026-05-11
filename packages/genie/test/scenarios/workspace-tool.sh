#!/usr/bin/env bash
# Scenario: workspace tool use
#
# Verifies that the genie can read files from $GENIE_WORKSPACE using
# its file tools.
#
# This script is sourced by integration.sh and has access to:
#   endo, wait_for, wait_for_reply, send_and_wait,
#   assert_reply_contains, current_max_msg,
#   CURRENT_MAX, GENIE_WORKSPACE

set -euo pipefail

# Create a file with distinctive content in the workspace.
TEST_CONTENT="The secret passphrase is BANANA_UMBRELLA_7"
echo "$TEST_CONTENT" > "$GENIE_WORKSPACE/test-artifact.txt"

echo "[workspace-tool] Created $GENIE_WORKSPACE/test-artifact.txt"
echo "[workspace-tool] Asking genie to read the file..."

set -x

send_and_wait "Please read the file test-artifact.txt and tell me what the secret passphrase is." 180

assert_reply_contains "BANANA_UMBRELLA_7"

echo "[workspace-tool] ✓ Workspace tool scenario passed."
