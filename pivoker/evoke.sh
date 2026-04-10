#!/usr/bin/env bash
#
# evoke.sh — invoke an AI coding agent on the next task or an ad-hoc prompt.
#
# Usage: evoke.sh [arguments...]
#   No arguments: prompt the agent to work on next task file
#   With arguments: pass as verbatim as user prompt to the agent.
#
# After agent ran any session transcripts from it are copied into SESSION_STORE.
#
# If more tasks remain, a systemd timer is scheduled to run the next one after
# NEXT_TASK_DELAY.
#
# Sends notifications around agent run via notify() from common.sh.
#
# Configuration lives in common.sh (defaults) and evoke/config.sh (overrides).

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

DRY_RUN=

task_prompt()  {
  task_file=$1
  echo "Your task is specified in ${task_file}, update it as you go, respond simply here with a one word status indicator once done."
}

next_task()  {
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
  local mess="$*"
  if git commit --porcelain; then
    git commit -m "$mess"
  fi
}

run_agent() {
  if [ -f "$SOUL_FILE" ]; then
    AGENT_ARGS+=("--system-prompt" "$SOUL_FILE")
  fi
  if [ -n "$AGENT_CURRENT_SESSION" ]; then
    AGENT_ARGS+=("--session" "$AGENT_CURRENT_SESSION")
  fi
  if ! [ -t 0 ]; then
    AGENT_ARGS+=("--print")
  fi

  if [ -n "$DRY_RUN" ]; then
    echo "!!! would run:" "${AGENT_ARGS[@]}" "$@"
    exit 42
  fi

  start_time=$(date -Iseconds)

  git add -A
  may_commit "WIP($AGENT_NAME) pre leftovers"

  "${AGENT_ARGS[@]}" "$@" </dev/null |& cat

  for tp in "$TASK_FILE" "$TASKS_IN" "$TASKS_OUT"; do
    if [ -e "$tp" ]; then
      git add "$tp"
    fi
  done
  may_commit "WIP($AGENT_NAME) task update"

  git add -A
  may_commit "WIP($AGENT_NAME) post leftovers"

  if [ -n "$SESSION_STORE" ]; then
    session_substore="$SESSION_STORE/$start_time"
    [ -d "$session_substore" ] || mkdir -p "$session_substore"

    if [ -n "$AGENT_CURRENT_SESSION" ]; then
      session_id=$(<$AGENT_CURRENT_SESSION jq -r 'select(.type == "session") | .id + ".jsonl"' | head -n1)
      store_file="$session_substore/$session_id"
      mv "$AGENT_CURRENT_SESSION" "$store_file"
      git add "$store_file"

    elif [ -d "$AGENT_SESSIONS" ]; then
      for session_file in $(
        find "$AGENT_SESSIONS" -type f -newermt "$start_time" || true
      ); do
        store_file="$session_substore/${session_file#$AGENT_SESSIONS/}"
        store_subdir=$(dirname "$store_file")
        [ -d "$store_subdir" ] || mkdir -p "$store_subdir"
        cp "$session_file" "$store_file"
        git add "$store_file"
      done
    fi

    git add -A
    may_commit "evoke($AGENT_NAME) record $session_substore"
  fi
}

if $DEBUG_EVOKE; then
  set -x
fi

if [ $# -gt 0 ]; then

  notify 'running' 'direct invocation'

  run_agent "$@"

  notify 'done' 'direct invocation'

else
  check_killswitch

  if ! task_file=$(next_task) || [[ -z "$task_file" ]]; then
    notify 'done' Noop-Idle
    exit 0
  fi

  notify 'running' "$task_file"

  run_agent "$(task_prompt "$task_file")"

  if [[ $task_file == $TASKS_IN/* ]]; then
    task_base=${task_file#$TASKS_IN/}
    task_out_file="$TASKS_OUT/$task_base"
    [ -d "$TASKS_OUT" ] || mkdir -p "$TASKS_OUT"
    git mv "$task_file" "$task_out_file"
    git commit -m "$TASKS_OUT($task_base) evoked $AGENT_NAME"
    task_file="$task_out_file"
  fi

  if task_file=$(next_task) && [[ -n "$task_file" ]]; then
    "$PIVOKER_DIR/run.sh" --after "$NEXT_TASK_DELAY"
    notify 'next' "will evoke $(task_name "$task_file")"
  else
    notify 'done' "Evoker idle"
  fi
fi
