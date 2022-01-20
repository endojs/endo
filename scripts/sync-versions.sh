#!/bin/bash
set -ueo pipefail

# Synchronizes dependencies from this workspace with the last-published
# versions of this or another workspace, designated by the path to the work of
# that workspace.
# This is specifically useful for syncing the versions published from the
# Endo workspace repository.

DIR=$(dirname -- "${BASH_SOURCE[0]}")

"$DIR/get-versions.sh" "$@" | "$DIR/set-versions.sh"
