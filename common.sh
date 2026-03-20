#!/usr/bin/env bash
#
# Common utilities and config for pivoker scripts.
# Source via: source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

# --- fundamentals

pivoker_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

repo_dir=$(git rev-parse --show-toplevel)

repo_name=${repo_dir#$HOME/}
repo_name=${repo_name//\//-}

unit_name="evoke@${repo_name}"

# --- utilities

die() {
  echo "$@" >&2
  exit 1
}

chase_file() {
  local file=$1
  while [ -L "$file" ]; do
    file=$(readlink -f "$file")
    file=${file#$task_dir/}
  done
  echo "$file"
}

# --- config defaults

SESSION_STORE="evoke/sessions"
SOUL_FILE="evoke/SOUL.md"

TASK_FILE=TODOs.md
TASKS_IN=TODO
TASKS_OUT=TADA

NEXT_TASK_DELAY=1m

# agent config

# agent_name='pi'
# agent_args=('pi')
# agent_sessions="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions"
# running_session_file='evoke/running-session.jsonl'

agent_name='claude'
agent_args=('claude' '--dangerously-skip-permissions')
agent_sessions="$HOME/.claude/projects/${PWD//\//-}"
running_session_file=

# --- load per-project config overrides

if [ -f "$repo_dir/evoke/config.sh" ]; then
  # shellcheck source=/dev/null
  source "$repo_dir/evoke/config.sh"
fi
