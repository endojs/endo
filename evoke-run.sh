#!/usr/bin/env bash

# Evoke Runner - run evoke.sh as an ephemeral one-shot background service
#
# Usage: ./evoke-run.sh
# - creates an ephemeral systemd unit in the user's background.slice
# - runs evoke.sh in isolation with automatic cleanup
# - check status with: systemctl --user status evoke
# - get full log with: journalctl --user -u evoke
#
# See evoke.md for detailed documentation and usage examples

set -x
set -e

# Change to the script's directory to ensure relative paths work correctly
cd "$(dirname "$0")" || {
  echo "Error: Unable to change to script directory: $(dirname "$0")"
  exit 1
}

# Main script to execute - created in user's home directory
MAIN_SCRIPT="./evoke.sh"

# Verify main script exists and is executable
if [ ! -f "$MAIN_SCRIPT" ]; then
    echo "Error: Main script not found at $MAIN_SCRIPT"
    exit 1
fi
if [ ! -x "$MAIN_SCRIPT" ]; then
    echo "Error: Main script not executable. Run: chmod +x $MAIN_SCRIPT"
    exit 1
fi

systemd-run --user \
  --slice background.slice \
  --unit evoke \
  --service-type=exec \
  --property=Type=exec \
  --send-sighup \
  --collect \
  "$MAIN_SCRIPT"
