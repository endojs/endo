#!/bin/sh
# Run ESLint over the whole repository in bounded per-bucket batches.
#
# A single `eslint .` builds one typescript-eslint project service that must
# hold every package's TypeScript program at once. Past a scale that this
# monorepo crosses on large pull requests, that service stops resolving the
# alphabetically-last packages (packages/where, packages/zip) and reports
# every file in them as
#
#   Parsing error: ... using `parserOptions.project`:
#   However, none of those TSConfigs include this file.
#
# even though each package's tsconfig.json plainly includes those files (they
# lint clean when the package is linted on its own). It is a project-service
# scaling ceiling, not a config-glob gap: the whole-repo program drops its
# tail under memory pressure (the same 53 packages lint green on a small diff
# and drop their tail only on a large one).
#
# Linting one package per process removes the precondition, but at a real cost:
# each process pays ESLint + typescript-eslint startup afresh, and every
# package program re-loads the types of its shared `@endo/*` dependencies, so
# 50-plus processes duplicate a great deal of tsc work (measured on CI: the
# whole-repo `eslint .` lint job ran ~4m30s; one-package-per-process ran
# ~6m30s). This script instead lints packages in BUCKETS of a bounded size:
# each bucket's project service holds only ESLINT_BUCKET_SIZE package programs
# at once (far under the whole-repo count that drops its tail), while a handful
# of processes -- not one per package -- amortize startup and let each service
# share loaded dependency programs across the packages in its bucket. Bounding
# the bucket by package COUNT (not by a fixed number of buckets) preserves the
# guarantee that no service ever spans the whole repo regardless of how many
# packages the monorepo grows to.
#
# Coverage matches `eslint .`: the union of the directory arguments across all
# buckets is exactly `packages/*/` plus every top-level non-package directory,
# the same paths the repository lint command walks -- only the grouping into
# processes differs. The flat root config owns ignore patterns and per-file
# rules; there is no `.eslintignore` or legacy `eslintConfig.root` setting to
# apply. Top-level non-package paths such as `browser-test/` and `scripts/`
# therefore remain part of lint coverage. Extra arguments are forwarded to
# each invocation, so `scripts/eslint-repo.sh --fix` fixes the whole repository.
#
# ESLINT_BUCKET_SIZE (default 10) tunes how many packages share one process.
# Lower it if a future large pull request ever pressures a bucket into the
# ceiling; raise it to trade a wider safety margin for fewer processes.
#
# Exits non-zero if any batch reports errors.
set -eu

: "${ESLINT_BUCKET_SIZE:=10}"

status=0

# eslint exits non-zero when a batch matches no lintable files; a package or a
# top-level directory can legitimately be empty of lintable files, so tolerate
# empty batches with --no-error-on-unmatched-pattern and let real lint errors
# set the status. The caller's extra arguments (e.g. --fix) reach us as the
# script's positional parameters and prefix every batch.
lint() {
  if ! eslint --no-error-on-unmatched-pattern "$@"; then
    status=1
  fi
}

# Lint the accumulated package directories in $bucket, then reset it. The
# directory paths never contain spaces, so word-splitting $bucket into
# separate arguments is exactly what we want here.
bucket=
count=0
flush_bucket() {
  [ "${count}" -eq 0 ] && return 0
  # shellcheck disable=SC2086  # $bucket is a space-separated path list by design
  lint "$@" ${bucket}
  bucket=
  count=0
}

# One bucket per ESLINT_BUCKET_SIZE workspace packages.
for pkg in packages/*/; do
  bucket="${bucket} ${pkg}"
  count=$((count + 1))
  if [ "${count}" -ge "${ESLINT_BUCKET_SIZE}" ]; then
    flush_bucket "$@"
  fi
done
flush_bucket "$@"

# One batch for every top-level directory that is not a workspace package.
# Passing directories (not explicit filenames) lets eslint apply the same
# extension and ignore filtering as `eslint .`, so root-level `.mjs`/`.cjs`
# config files it would skip are not force-linted. These carry no lintable
# files today, so a single batch suffices.
nonpkg=
for entry in */; do
  case "${entry}" in
    packages/ | node_modules/) continue ;;
  esac
  nonpkg="${nonpkg} ${entry}"
done
if [ -n "${nonpkg}" ]; then
  # shellcheck disable=SC2086  # $nonpkg is a space-separated path list by design
  lint "$@" ${nonpkg}
fi

exit "${status}"
