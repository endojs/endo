#!/usr/bin/env bash
# @endo/genie integration test
#
# Boots an isolated Endo daemon, provisions the genie guest via
# setup.js (auto-submitting the configuration form), sends a test
# message, and verifies that the agent responds.
#
# Usage:
#   ./test/integration.sh [-f <env-file>] [-E KEY=VAL ...]
#
# Options:
#   -f <env-file>   Source an env-file (export KEY=value lines)
#   -E KEY=VAL      Set an environment variable directly (repeatable)
#
# Environment variables (override via -f, -E, or export):
#   GENIE_MODEL       - LLM model spec (e.g. ollama/llama3.2)
#   GENIE_WORKSPACE   - workspace directory for genie tools
#
# The script creates a temporary directory under packages/genie/tmp/
# for daemon state and cleans it up on exit.

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
ENDO_BIN="$REPO_ROOT/packages/cli/bin/endo.cjs"

# ---------------------------------------------------------------------------
# Parse options: -f <env-file>, -E KEY=VAL
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in

    -f)
      shift
      if [[ -z "${1:-}" || ! -f "$1" ]]; then
        echo "[integration] ERROR: -f requires a readable env-file path." >&2
        exit 1
      fi
      echo "[integration] Loading env from $1"
      # shellcheck disable=SC1090
      set -a
      source "$1"
      set +a
      shift
      ;;

    -E)
      shift
      if [[ -z "${1:-}" || "$1" != *=* ]]; then
        echo "[integration] ERROR: -E requires KEY=VAL argument." >&2
        exit 1
      fi
      export "$1"
      echo "[integration] Set ${1%%=*}"
      shift
      ;;

    *)
      echo "[integration] ERROR: Unknown option: $1" >&2
      echo "Usage: $0 [-f <env-file>] [-E KEY=VAL ...]" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate required configuration
# ---------------------------------------------------------------------------

if [[ -z "${GENIE_MODEL:-}" ]]; then
  echo "[integration] ERROR: GENIE_MODEL is not set." >&2
  echo "  Set it via environment, -f <env-file>, or -E GENIE_MODEL=<spec>." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Isolated daemon environment
# ---------------------------------------------------------------------------

TEST_DIR="$PACKAGE_DIR/tmp/integration-$$"
mkdir -p "$TEST_DIR"

export ENDO_STATE_PATH="$TEST_DIR/state"
export ENDO_EPHEMERAL_STATE_PATH="$TEST_DIR/run"
export ENDO_SOCK_PATH="$TEST_DIR/endo.sock"
export ENDO_CACHE_PATH="$TEST_DIR/cache"
export ENDO_ADDR="127.0.0.1:0" # OS-assigned port; CLI uses Unix socket so this is fine
export GENIE_WORKSPACE="${GENIE_WORKSPACE:-$TEST_DIR/workspace}"
export GENIE_MODEL

mkdir -p "$ENDO_STATE_PATH" "$ENDO_EPHEMERAL_STATE_PATH" \
         "$ENDO_CACHE_PATH" "$GENIE_WORKSPACE"

echo "[integration] Test directory: $TEST_DIR"
echo "[integration] GENIE_MODEL=$GENIE_MODEL"
echo "[integration] GENIE_TEST=${GENIE_TEST:-}"
echo "[integration] GENIE_WORKSPACE=$GENIE_WORKSPACE"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

endo() {
  node "$ENDO_BIN" "$@"
}

current_max_msg() {
  endo inbox 2>/dev/null | grep -oE '^[0-9]+' | sort -n | tail -1 || echo 0
}

# Poll the host inbox until a message from the genie agent appears
# that is NOT one of the setup/config messages.
# Returns 0 when a substantive agent reply is found, 1 on timeout.
wait_for() {
  local max_wait="${1:-120}"
  shift

  expect=$1
  shift
  [ -n "$expect" ]

  local interval=1
  local deadline=$(( $(date +%s) + max_wait ))

  echo "[integration] Waiting up to ${max_wait}s for ${expect}..." >&2

  while (( $(date +%s) < deadline )); do
    if endo inbox 2>/dev/null | grep -i "$expect"; then
      return 0
    fi
    sleep "$interval"
  done

  return 1
}

# Poll inbox for a substantive agent reply after message number $1.
# Prints the extracted reply text (metadata stripped) to stdout.
# Returns 0 on success, 1 on timeout.
#
# Endo inbox message verbs by type:
#   "sent"      → package messages (includes agent text replies)
#   "requested" → request messages (tool calls / capability requests)
#   "proposed"  → definition proposals
#   "form"      → form submissions
# We only care about substantive "sent" replies, skipping all others.
trace_reply() {
  local after_msg="${1:-0}"
  local max_wait="${2:-180}"
  local interval=1
  local deadline=$(( $(date +%s) + max_wait ))

  echo "[integration] Waiting up to ${max_wait}s for reply after message #${after_msg}..." >&2

  while (( $(date +%s) < deadline )); do
    echo "are you still there" >&2
    endo inbox \
    | grep -E '^[0-9]+\.' \
    | while IFS= read -r line; do
      msg_num="${line%%.*}"
      if (( msg_num <= after_msg )); then
        continue
      fi

      echo "  ??? $after_msg $msg_num $line" >&2
      after_msg=$msg_num

      # Classify each line using shell builtins; echo skipped
      # (insubstantive) lines to stderr so the TTY-repl shows
      # live progress while callers can still discard noise via
      # 2>/dev/null.

      # Skip messages we sent (". sent " from us)
      if [[ "$line" == "[0-9]*. sent *" ]]; then
        echo "  (skip sent) $line" >&2
        continue

      # Skip "Thinking..." status messages (case-insensitive via extglob)
      elif [[ "$line" == "*[Tt][Hh][Ii][Nn][Kk][Ii][Nn][Gg]...*" ]]; then
        echo "  (skip thinking) $line" >&2
        continue

      # Skip request/tool-call messages ("requested")
      elif [[ "$line" == "[0-9]* requested*" ]]; then
        echo "  (skip requested) $line" >&2
        continue

      # Skip definition proposals
      elif [[ "$line" == "[0-9]* proposed*" ]]; then
        echo "  (skip proposed) $line" >&2
        continue

      # This is a substantive reply from the agent
      else
        echo "$line"

        echo "[integration] Got reply: $line" >&2
        # Strip inbox metadata: remove leading "N. <verb> <agent> " prefix
        # to get the raw message content.
        echo "$line" | sed 's/^[0-9]*\. [^ ]* [^ ]* //'
        return 0

      fi

      echo "  ??? next" >&2

    done

    sleep "$interval"
  done

  echo "[integration] Timed out waiting for reply." >&2
  endo inbox 2>/dev/null || true
  return 1
}

# Convenience wrapper: wait for a reply, printing status but discarding
# the extracted text.  Preserves the original wait_for_reply() contract
# (returns 0/1, no stdout payload).
wait_for_reply() {
  trace_reply "$@" >/dev/null 2>&1
}

# Helper: assert the latest reply contains a substring (case-insensitive).
# Usage: assert_reply_contains "substring"
assert_reply_contains() {
  local expected="$1"
  local inbox
  inbox="$(endo inbox 2>/dev/null || true)"

  if echo "$inbox" | grep -qi "$expected"; then
    echo "[integration] ✓ Reply contains '$expected'"
    return 0
  else
    echo "[integration] ✗ Reply does NOT contain '$expected'" >&2
    echo "[integration] Inbox dump:" >&2
    echo "$inbox" >&2
    return 1
  fi
}

# Helper: send a message and wait for the reply.
# Usage: send_and_wait "prompt text" [timeout]
send_and_wait() {
  local prompt="$1"
  local timeout="${2:-180}"

  CURRENT_MAX="$(current_max_msg)"
  echo "[integration] Sending: $prompt"
  endo send "$GENIE_NAME" "$prompt"
  echo "[integration] Message sent (inbox was at #${CURRENT_MAX:-0}). Waiting for reply..."
  # wait_for_reply
  trace_reply "${CURRENT_MAX:-0}" "$timeout"
}

# ---------------------------------------------------------------------------
# Cleanup trap
# ---------------------------------------------------------------------------

cleanup() {
  echo "[integration] Cleaning up..."
  endo purge -f 2>/dev/null || true
  # Kill any leftover daemon processes for this test dir.
  pkill -f "daemon-node.*$TEST_DIR" 2>/dev/null || true
  rm -rf "$TEST_DIR"
  echo "[integration] Done."
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Phase 1: Start daemon
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 1: Start daemon ==="
endo purge -f 2>/dev/null || true
endo start

# The daemon starts asynchronously;
# wait until it is responsive before proceeding.
echo "[integration] Waiting for daemon to become ready..."
daemon_ready=0
for i in $(seq 1 30); do
  if endo ping 2>/dev/null; then
    daemon_ready=1
    break
  fi
  sleep 1
done

if [[ "$daemon_ready" -ne 1 ]]; then
  echo "[integration] ERROR: Daemon failed to become ready after 30s." >&2
  endo log 2>/dev/null | tail -20
  exit 1
fi

# TODO concretify $ENDO_ADDR -- if ends in :0 we need the real running ephemeral port -- does ping have it?

# TODO get access to the genie worker log and show it when we're hanging
#
echo "[integration] Daemon started and ready."

# ---------------------------------------------------------------------------
# Phase 2: Run genie setup (auto-submits config form from env vars)
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 2: Run genie setup ==="

# NOTE: ENDO_EXTRA could run setup.js at daemon boot (it already exports
# main(host)), but filterEnv() only passes ENDO_* and LOCKDOWN_* vars,
# so GENIE_MODEL / GENIE_WORKSPACE would need to be renamed or filterEnv
# extended.  For now, the explicit `endo run` approach is clearer.

# setup.js auto-submits the form using GENIE_MODEL and GENIE_WORKSPACE.
# It exits after the form is submitted.
endo run --UNCONFINED \
  "$PACKAGE_DIR/setup.js" --powers @agent \
  -E "GENIE_MODEL=$GENIE_MODEL" \
  -E "GENIE_WORKSPACE=$GENIE_WORKSPACE"

echo "[integration] Setup completed."

# ---------------------------------------------------------------------------
# Phase 3: Wait for agent to become ready
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 3: Wait for agent ready ==="
# The agent sends `N. "name" sent "Genie agent ready ..." once configured.
agent_ready=$(wait_for 120 'Genie agent ready')
agent_ready=${agent_ready#* }
agent_ready=${agent_ready%% *}
agent_ready=${agent_ready//\"/}
GENIE_NAME="${agent_ready}"
echo "[integration] Agent ${GENIE_NAME} is ready."
export GENIE_NAME

# ---------------------------------------------------------------------------
# Phase 4: Run test scenario
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 4: Test scenario ==="

# Export test harness to scenario (or interactive repl)
export -f endo wait_for trace_reply wait_for_reply send_and_wait \
          assert_reply_contains current_max_msg
export ENDO_BIN TEST_DIR GENIE_WORKSPACE

# echo "[integration] Commands: /quit to exit, /inbox to dump full inbox, /shell to drop to debug bash"
#
# while true; do
#   printf 'genie> '
#   IFS= read -r user_input || break
#
#   # Skip blank lines
#   if [[ -z "$user_input" ]]; then
#     continue
#   fi
#
#   # Special commands
#   case "$user_input" in
#     /quit)
#       echo "[integration] Exiting REPL."
#       break
#       ;;
#
#     /inbox)
#       endo inbox 2>/dev/null || true
#       continue
#       ;;
#
#     /shell)

echo "[integration] Spawning debug sub-shell, exit to return to genie test loop"
bash

#       continue
#       ;;
#
#   esac
#
#   # Send and wait for reply
#   CURRENT_MAX="$(current_max_msg)"
#   endo send "$GENIE_NAME" "$user_input"
#
#   # TODO filter from $GENIE_NAME
#   agent_reply="$(trace_reply "$CURRENT_MAX" 180)" || true
#
#   if [[ -n "$agent_reply" ]]; then
#     echo "$agent_reply"
#   else
#     echo "[integration] (no reply within 180s)"
#   fi
#
# done

# ---------------------------------------------------------------------------
# Phase 5: Final inbox dump and result
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 5: Results ==="
echo "[integration] Final inbox state:"
endo inbox 2>/dev/null || true
