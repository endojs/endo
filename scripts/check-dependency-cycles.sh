#!/bin/bash
# Fails if the workspace packages form a cycle through their regular
# `dependencies`. `yarn workspaces foreach --topological` refuses to run on a
# dependency cycle, so its exit status is the check.
#
# Requires a prior `yarn install` (even `--mode=skip-build` is fine).
set -ueo pipefail

yarn workspaces foreach --all --topological exec true

echo "No cycles in 'dependencies' of workspace packages."
