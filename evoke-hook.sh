#!/bin/bash
set -e

task_file=TODOs.md

# shellcheck disable=2034
SUBDIRECTORY_OK=true

# shellcheck source=/dev/null
. $(git --exec-path)/git-sh-setup

[ "$(git rev-parse --is-bare-repository)" == "true" ] && \
  die "fatal: $0 cannot be used without a working tree"

set -x

head_ref=$(git symbolic-ref HEAD)

while read -r oldrev newrev refname; do
  if [ "$refname" == "$head_ref" ]; then
    worktree=$(git rev-parse --show-toplevel)
    if [[ "$worktree" = */.git ]]; then
        pushd "$worktree/.."
    elif [ -n "$worktree" ]; then
        pushd "$worktree"
    elif [[ "$GIT_DIR" = */.git ]]; then
        pushd "$GIT_DIR/.."
    else
        die "Unable to determine GIT_WORK_TREE from GIT_DIR=$GIT_DIR, set core.worktree"
    fi

    git checkout -f

    if ! git diff --exit-code "$oldrev...$newrev" -- "$task_file"; then
      echo '!!! Evoke !!!'
    else
      echo '... Noop ...'
    fi

    popd
  fi
done

