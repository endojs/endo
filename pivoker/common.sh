#!/usr/bin/env bash
#
# Common utilities and config for pivoker scripts.
# Source via: source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

# --- fundamentals

PIVOKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO_DIR=$(git rev-parse --show-toplevel)

REPO_NAME=${REPO_DIR#$HOME/}
REPO_NAME=${REPO_NAME//\//-}

UNIT_NAME="evoke@${REPO_NAME}"

# --- utilities

notify() {
  local status=$1
  shift

  level=info
  case "$status" in
    done)
      level=alert
      ;;

    error)
      level=error
      ;;
  esac

  "$PIVOKER_DIR/notify.sh" \
    --sender "$AGENT_IDENTITY" \
    --level "$level" \
    --status "$status" \
    "$REPO_NAME — $@"
}

die() {
  notify 'error' "$*" || true
  echo "$@" >&2
  exit 1
}

check_killswitch() {
  if [ -f "$REPO_DIR/$KILLSWITCH_FILE" ]; then
    echo "Killswitch active ($KILLSWITCH_FILE exists), exiting." >&2
    exit 0
  fi
}

chase_file() {
  local file=$1
  while [ -L "$file" ]; do
    local file_dir=$(dirname "$file")
    file=$(readlink -f "$file")
    file=${file#$file_dir/}
  done
  echo "$file"
}

task_name() {
  local name=$1
  case "$name" in
    $TASKS_IN*)
      name=${name#$TASKS_IN}
      ;;
    $TASKS_OUT*)
      name=${name#$TASKS_OUT}
      ;;
  esac
  name=${name#/}
  name=${name%.md}
  name=${name//[^a-zA-Z0-9]/ }
  echo "$name"
}

# --- config defaults

DEBUG_HOOK=false
DEBUG_EVOKE=false
DEBUG_NOTIFY=false
DEBUG_RUN=false

KILLSWITCH_FILE="evoke/NOPE"

SESSION_STORE="evoke/sessions"
SOUL_FILE="evoke/SOUL.md"

TASK_FILE=TODOs.md
TASKS_IN=TODO
TASKS_OUT=TADA

NEXT_TASK_DELAY=1m

NOTIFY=

# --- agent config

AGENT_IDENTITY="$(whoami)@$(hostname)"

# AGENT_NAME='pi'
# AGENT_ARGS=('pi')
# AGENT_SESSIONS="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions"
# AGENT_CURRENT_SESSION='evoke/running-session.jsonl'

AGENT_NAME='claude'
AGENT_ARGS=('claude' '--dangerously-skip-permissions')
AGENT_SESSIONS="$HOME/.claude/projects/${PWD//\//-}"
AGENT_CURRENT_SESSION=

# --- load per-project config overrides

if [ -f "$REPO_DIR/evoke/config.sh" ]; then
  # shellcheck source=/dev/null
  source "$REPO_DIR/evoke/config.sh"
fi
