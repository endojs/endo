#!/bin/sh
# Run shellcheck against every .sh file tracked in the repository.
#
# Exits 0 when no .sh files are tracked. Extra arguments are forwarded to
# the underlying checker, so callers can override severity or exclude
# codes:
#
#   yarn shellcheck                     # default severity warning
#   yarn shellcheck --severity=error    # tighter gate
#   yarn shellcheck -- -e SC2086        # exclude a code
#
# The list is enumerated via `git ls-files '*.sh'` so untracked scratch
# scripts and worktree noise are ignored.

set -eu

# Stash the file list as a git blob and stream it back out, rather than
# holding it in a shell variable. This keeps us clear of ARG_MAX limits
# on hosts with a large number of tracked .sh files, and lets the body
# branch on emptiness without an oversize positional-argument list.
HASH=$(git ls-files -z '*.sh' | tr '\0' '\n' | git hash-object -w --stdin)

if [ -z "$(git cat-file blob "$HASH")" ]; then
  echo "shellcheck: no .sh files tracked; skipping."
  exit 0
fi

# shellcheck disable=SC2086
# Word splitting on the blob's contents is intentional: each line is a
# separate path and tracked .sh filenames in this repo do not contain
# whitespace. `git ls-files` would happily emit NULs for whitespace-bearing
# names; if such a name lands here, switch to xargs -0 with a portability
# shim.
git cat-file blob "$HASH" | xargs shellcheck -S warning "$@"
