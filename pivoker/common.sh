#!/usr/bin/env bash
#
# Common utilities and config for pivoker scripts.
# Source via: source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

# --- fundamentals

PIVOKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO_DIR="$(git rev-parse --show-toplevel)"

REPO_SUBDIR=${REPO_DIR#"$HOME"/}
REPO_NAME=${REPO_SUBDIR//\//-}

# shellcheck disable=SC2034 # used by run.sh, ctl.sh, vigil.sh
UNIT_NAME="evoke@${REPO_NAME}"

# --- systemd user env ---
# Ensure XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS are set so that
# `systemctl --user` works in non-interactive contexts (services, cron, SSH).
# Mirrors devoker/internal/systemd/systemd.go ensureUserEnv().

if [[ -z "${XDG_RUNTIME_DIR:-}" ]]; then
  XDG_RUNTIME_DIR="/run/user/$(id -u)"
  export XDG_RUNTIME_DIR
fi

if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
  DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
  export DBUS_SESSION_BUS_ADDRESS
fi

# --- utilities

notify() {
  local status=$1
  shift

  local level=info
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
    "$REPO_NAME — $*"
}

die() {
  notify 'error' "$*" || true
  echo "$@" >&2
  exit 1
}

check_killswitch() {
  if [[ -f "$REPO_DIR/$KILLSWITCH_FILE" ]]; then
    echo "Killswitch active ($KILLSWITCH_FILE exists), exiting." >&2
    exit 0
  fi
}

chase_file() {
  local file=$1
  while [[ -L "$file" ]]; do
    local file_dir
    file_dir=$(dirname "$file")
    file=$(readlink -f "$file")
    file=${file#"$file_dir"/}
  done
  echo "$file"
}

task_name() {
  local name=$1
  case "$name" in
    "$TASKS_IN"*)
      name=${name#"$TASKS_IN"}
      ;;
    "$TASKS_OUT"*)
      name=${name#"$TASKS_OUT"}
      ;;
  esac
  name=${name#/}
  name=${name%.md}
  name=${name//[^a-zA-Z0-9]/ }
  echo "$name"
}

# --- config defaults

# shellcheck disable=SC2034 # used by sourcing scripts
DEBUG_HOOK=${DEBUG_HOOK:-false}
# shellcheck disable=SC2034
DEBUG_EVOKE=${DEBUG_EVOKE:-true}
# shellcheck disable=SC2034
DEBUG_NOTIFY=${DEBUG_NOTIFY:-false}
# shellcheck disable=SC2034
DEBUG_RUN=${DEBUG_RUN:-false}
# shellcheck disable=SC2034
DEBUG_CTL=${DEBUG_CTL:-false}
# shellcheck disable=SC2034
DEBUG_VIGIL=${DEBUG_VIGIL:-false}
# shellcheck disable=SC2034
DEBUG_REMOTE_WEBHOOK=${DEBUG_REMOTE_WEBHOOK:-false}
# shellcheck disable=SC2034
DEBUG_SETUP_TELEGRAM=${DEBUG_SETUP_TELEGRAM:-false}

KILLSWITCH_FILE="evoke/NOPE"

# shellcheck disable=SC2034 # used by evoke.sh
SESSION_STORE="evoke/sessions"
# shellcheck disable=SC2034
SOUL_FILE="evoke/SOUL.md"

# shellcheck disable=SC2034
TASK_FILE=TODOs.md
TASKS_IN=TODO
TASKS_OUT=TADA

# shellcheck disable=SC2034
NEXT_TASK_DELAY=1m

# shellcheck disable=SC2034
NOTIFY=

# --- agent config

AGENT_IDENTITY="$(whoami)@$(hostname)"

# shellcheck disable=SC2034
AGENT_NAME='pi'
# shellcheck disable=SC2034
AGENT_ARGS=('pi')
# shellcheck disable=SC2034
AGENT_SESSIONS="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions"
# shellcheck disable=SC2034
AGENT_CURRENT_SESSION='evoke/running-session.jsonl'

# --- load per-project config overrides

if [[ -f "$REPO_DIR/evoke/config.sh" ]]; then
  # shellcheck source=/dev/null
  source "$REPO_DIR/evoke/config.sh"
fi

# --- environment variable overrides
#
# PIVOKER_* env vars override values set by config.sh (and the defaults above).
# Precedence: CLI flags > env vars > config file > defaults.
# Mirrors devoker/internal/config/env.go (DEVOKER_* prefix).

KILLSWITCH_FILE="${PIVOKER_KILLSWITCH_FILE:-$KILLSWITCH_FILE}"
# shellcheck disable=SC2034
SESSION_STORE="${PIVOKER_SESSION_STORE:-$SESSION_STORE}"
# shellcheck disable=SC2034
SOUL_FILE="${PIVOKER_SOUL_FILE:-$SOUL_FILE}"
# shellcheck disable=SC2034
TASK_FILE="${PIVOKER_TASK_FILE:-$TASK_FILE}"
TASKS_IN="${PIVOKER_TASKS_IN:-$TASKS_IN}"
TASKS_OUT="${PIVOKER_TASKS_OUT:-$TASKS_OUT}"
# shellcheck disable=SC2034
NEXT_TASK_DELAY="${PIVOKER_NEXT_TASK_DELAY:-$NEXT_TASK_DELAY}"
# shellcheck disable=SC2034
NOTIFY="${PIVOKER_NOTIFY:-$NOTIFY}"

AGENT_IDENTITY="${PIVOKER_AGENT_IDENTITY:-$AGENT_IDENTITY}"
# shellcheck disable=SC2034
AGENT_NAME="${PIVOKER_AGENT_NAME:-$AGENT_NAME}"
if [[ -n "${PIVOKER_AGENT_ARGS:-}" ]]; then
  # Split on whitespace (mirrors strings.Fields in devoker).
  # shellcheck disable=SC2034,SC2206
  AGENT_ARGS=($PIVOKER_AGENT_ARGS)
fi
# shellcheck disable=SC2034
AGENT_SESSIONS="${PIVOKER_AGENT_SESSIONS:-$AGENT_SESSIONS}"
# shellcheck disable=SC2034
AGENT_CURRENT_SESSION="${PIVOKER_AGENT_CURRENT_SESSION:-$AGENT_CURRENT_SESSION}"
