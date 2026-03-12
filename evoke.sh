#!/usr/bin/env bash
#
# Evoke - Trigger D'Anna for task execution
#
# Usage: evoke.sh [arguments...]
#   - If no arguments: processes TODOs.md for systematic task completion
#   - With arguments: passes them directly to D'Anna
#
# Documentation: See evoke.md for usage, configuration, and troubleshooting

set -x
set -e

# Script start time for session reference
START_TIME=$(date -Iminutes)

# If non-empty, any Pi sessions since start will be copied and committed into git when done
SESSION_STORE="evoke/sessions"

# Alternate Pi system prompt
SOUL_FILE="SOUL.md"

# Change to the script's directory to ensure relative paths work correctly
cd "$(dirname "$0")" || {
  echo "Error: Unable to change to script directory: $(dirname "$0")"
  exit 1
}

may_commit() {
  mess="$@"
  git add -A
  if git commit --porcelain; then
    git commit -m "$mess"
  fi
}

# Run pi
pi_args=""
if [ -f "$SOUL_FILE" ]; then
  pi_args+=" --system-prompt $SOUL_FILE"
fi
if ! [ -t 0 ]; then
  pi_args+=" --print"
fi
if [ $# -eq 0 ]; then
  pi $pi_args '@TODOs.md' "Work on your TODOs; do not respond here, but update the TODOs.md file instead"
else
  pi $pi_args "$@"
fi

# Commit any leftover working tree changes from the evoke run
may_commit '[evoke] leftovers'

# Capture any new session files and commit them
if [ -n "$SESSION_STORE" ]; then
  SESSION_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions"
  if [ -d "$SESSION_DIR" ]; then
    [ -d "$SESSION_STORE" ] || mkdir -p "$SESSION_STORE"
    # Find files created after start time
    for session_file in $(find "$SESSION_DIR" -type f -newermt "$START_TIME" | sort -r 2>/dev/null || true); do
      cp "$session_file" "$SESSION_STORE/${session_file##*/}"
    done

    # Add and commit new session files
    may_commit "[evoke] sessions since $(echo $START_TIME | tr -d ':')"
  fi
fi
