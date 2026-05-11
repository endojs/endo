#!/usr/bin/env bash
#
# Git post-receive hook: triggers evocation when task files change.
#
# Install by symlinking into a non-bare repo's hooks directory:
#   ln -s /path/to/pivoker/hook.sh <repo>/.git/hooks/post-receive
#
# On each push to the current HEAD branch:
# - updates the worktree
# - diffs the old..new revisions for changes to TASK_FILE or TASKS_IN/
# - if any changed delegates, runs evoke.sh as a background service via run.sh

# --- git environment setup
# IMPORTANT: this needs to happen before strict mode engagement, since git-sh-setup is not `set -u` safe

# shellcheck disable=2034
SUBDIRECTORY_OK=true

# shellcheck source=/dev/null
. "$(git --exec-path)/git-sh-setup"

[[ "$(git rev-parse --is-bare-repository)" == "true" ]] &&
  die "fatal: $0 cannot be used without a working tree"

set -euo pipefail

# Resolve the source path of the script (may be a symlink)
hook_source="${BASH_SOURCE[0]}"
while [[ -L "$hook_source" ]]; do
  target=$(readlink "$hook_source")
  if [[ $target != /* ]]; then
    hook_source="$(dirname "$hook_source")/$target"
  else
    hook_source="$target"
  fi
done

# shellcheck source=common.sh
source "$(cd "$(dirname "$hook_source")" && pwd)/common.sh"

if $DEBUG_HOOK; then
  set -x
fi

# --- worktree update

update_worktree() {
  local oldrev=$1
  local newrev=$2

  local worktree
  worktree=$(git rev-parse --show-toplevel)
  if [[ "$worktree" = */.git ]]; then
    pushd "$worktree/.." >/dev/null
  elif [[ -n "$worktree" ]]; then
    pushd "$worktree" >/dev/null
  elif [[ "$GIT_DIR" = */.git ]]; then
    pushd "$GIT_DIR/.." >/dev/null
  else
    die "Unable to determine GIT_WORK_TREE from GIT_DIR=$GIT_DIR, set core.worktree"
  fi
  GIT_WORK_TREE=$(pwd)
  export GIT_WORK_TREE

  git checkout -f

  if ! [[ -f "$REPO_DIR/$KILLSWITCH_FILE" ]]; then
    local task_file_actual
    task_file_actual=$(chase_file "$TASK_FILE")

    local -a changed
    readarray -t changed < <(
      git diff --name-only "$oldrev...$newrev" -- "$TASK_FILE" "$task_file_actual" "$TASKS_IN/"
    )

    if [[ ${#changed[@]} -gt 0 ]]; then
      echo "!!! Evoke ${changed[*]} !!!"
      "$PIVOKER_DIR/run.sh"
    else
      echo '... Noop ...'
    fi
  fi

  popd >/dev/null
}

# --- dispatch: only act on pushes to the current HEAD branch

head_ref=$(git symbolic-ref HEAD)
while read -r oldrev newrev refname; do
  if [[ "$refname" == "$head_ref" ]]; then
    update_worktree "$oldrev" "$newrev"
  fi
done
