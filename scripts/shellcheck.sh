#!/bin/sh
# Run shellcheck against every .sh file tracked in the repository.
#
# Exits 0 when no .sh files are tracked. Extra arguments are forwarded to
# the underlying checker, so callers can override severity or exclude
# codes:
#
#   yarn lint:sh                     # default severity warning
#   yarn lint:sh --severity=error    # tighter gate
#   yarn lint:sh -- -e SC2086        # exclude a code
#
# The list is enumerated via `git ls-files -z '*.sh'` so untracked scratch
# scripts and worktree noise are ignored. Null-terminated paths flow
# straight through `xargs -0` so filenames with whitespace or quoting
# survive intact, and `xargs -r` skips invoking shellcheck when the
# workspace has no .sh files.

set -eu

# Skip cleanly when the checker binary is absent, so a contributor without
# it installed can still run the rest of `yarn lint` locally. CI installs
# the binary in a setup step and relies on this script as the gate.
if ! command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck: not installed; skipping." >&2
  exit 0
fi

git ls-files -z '*.sh' | xargs -0 -r shellcheck -S warning "$@"
