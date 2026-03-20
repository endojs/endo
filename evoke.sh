#!/usr/bin/env bash
#
# Usage: evoke.sh [arguments...]
#   - If no arguments: processes TODOs.md for systematic task completion
#   - With arguments: passes them directly to D'Anna

set -euo pipefail
set -x

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

DRY_RUN=

task_prompt()  {
  task_file=$1
  echo "Your task is specified in ${task_file}, update it as you go, respond simply here with a one word status indicator once done."
}

next_task()  {
  task_dir=$(dirname "$TASK_FILE")
  task_file=$(chase_file "$TASK_FILE")

  if [ -f "$task_file" ]; then
    echo "$task_file"
    return 0
  fi

  if [ -d "$TASKS_IN" ]; then
    # TODO dependencies via tsort
    first=$(find "$TASKS_IN" -type f -not -name '.*' | sort | head -n1)
    if [ -n "$first" ]; then
      echo "$first"
      return 0
    fi
  fi

  return 1
}

may_commit() {
  mess="$@"
  git add -A
  if git commit --porcelain; then
    git commit -m "$mess"
  fi
}

run_agent() {
  if [ -f "$SOUL_FILE" ]; then
    agent_args+=("--system-prompt" "$SOUL_FILE")
  fi
  if [ -n "$running_session_file" ]; then
    agent_args+=("--session" "$running_session_file")
  fi
  if ! [ -t 0 ]; then
    agent_args+=("--print")
  fi

  if [ -n "$DRY_RUN" ]; then
    echo "!!! would run:" "${agent_args[@]}" "$@"
    exit 42
  fi

  start_time=$(date -Iseconds)

  may_commit "WIP($agent_name) pre leftovers"
  "${agent_args[@]}" "$@" </dev/null |& cat
  may_commit "WIP($agent_name) post leftovers"

  if [ -n "$SESSION_STORE" ]; then
    session_substore="$SESSION_STORE/$start_time"
    [ -d "$session_substore" ] || mkdir -p "$session_substore"

    if [ -n "$running_session_file" ]; then
      session_id=$(<$running_session_file jq -r 'select(.type == "session") | .id + ".jsonl"' | head -n1)
      store_file="$session_substore/$session_id"
      mv "$running_session_file" "$store_file"
      git add "$store_file"

    elif [ -d "$agent_sessions" ]; then
      for session_file in $(
        find "$agent_sessions" -type f -newermt "$start_time" || true
      ); do
        store_file="$session_substore/${session_file#$agent_sessions/}"
        store_subdir=$(dirname "$store_file")
        [ -d "$store_subdir" ] || mkdir -p "$store_subdir"
        cp "$session_file" "$store_file"
        git add "$store_file"
      done
    fi

    may_commit "evoke($agent_name) record $session_substore"
  fi
}

if [ $# -gt 0 ]; then
  run_agent "$@"
else
  if ! task_file=$(next_task); then
    echo "Unable to resolve next task"
    exit 2
  fi
  [ -n "$task_file" ] || exit 1
  run_agent "$(task_prompt "$task_file")"
  if [[ $task_file =~ $TASKS_IN/* ]]; then
    task_name=${task_file#$TASKS_IN/}
    task_out_file="$TASKS_OUT/$task_name"
    [ -d "$TASKS_OUT" ] || mkdir -p "$TASKS_OUT"
    git mv "$task_file" "$task_out_file"
    git commit -m "$TASKS_OUT($task_name) evoked $agent_name"
  fi
fi

if next_task>/dev/null; then
  systemd-run --user --on-unit-inactive="$NEXT_TASK_DELAY" --unit="$unit_name"
fi

# TODO notify
