#!/bin/bash
set -e

# Resolve the source path of the script (may be a symlink)
hook_source="${BASH_SOURCE[0]}"
while [ -L "$hook_source" ]; do
  TARGET=$(readlink "$hook_source")
  if [[ $TARGET != /* ]]; then
    hook_source="$(dirname $hook_source)/$TARGET"
  else
    hook_source="$TARGET"
  fi
done

source "$(cd "$(dirname "$hook_source")" && pwd)/common.sh"

# ---

# shellcheck disable=2034
SUBDIRECTORY_OK=true

# shellcheck source=/dev/null
. $(git --exec-path)/git-sh-setup

[ "$(git rev-parse --is-bare-repository)" == "true" ] && \
  die "fatal: $0 cannot be used without a working tree"

update_worktree() {
  oldrev=$1
  newrev=$2

  worktree=$(git rev-parse --show-toplevel)
  if [[ "$worktree" = */.git ]]; then
      pushd "$worktree/.." >/dev/null
  elif [ -n "$worktree" ]; then
      pushd "$worktree" >/dev/null
  elif [[ "$GIT_DIR" = */.git ]]; then
      pushd "$GIT_DIR/.." >/dev/null
  else
      die "Unable to determine GIT_WORK_TREE from GIT_DIR=$GIT_DIR, set core.worktree"
  fi
  export GIT_WORK_TREE=$(pwd)

  git checkout -f

  task_file_actual=$(chase_file "$TASK_FILE")

  readarray -t changed < <(
    git diff --name-only "$oldrev...$newrev" -- "$TASK_FILE" "$task_file_actual" $TASKS_IN/
  )

  if [ ${#changed[@]} -gt 0 ]; then
    echo "!!! Evoke ${changed[@]} !!!"
    $pivoker_dir/run.sh
  else
    echo '... Noop ...'
  fi

  popd >/dev/null
}

head_ref=$(git symbolic-ref HEAD)
while read -r oldrev newrev refname; do
  if [ "$refname" == "$head_ref" ]; then
    update_worktree "$oldrev" "$newrev"
  fi
done
