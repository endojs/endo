#!/bin/sh
# Run ESLint over the whole repository in per-package batches.
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
# scaling ceiling, not a config-glob gap: the whole-repo program simply drops
# its tail. Linting one package per process keeps each project service small
# and bounded, so no package is ever dropped regardless of repository size.
#
# Coverage matches `eslint .`: one batch per workspace under packages/, plus
# one batch per top-level non-package directory. The lint configuration only
# enables linting under packages/ (the root package.json is `{ "root": true }`
# with no rules and no extra extensions), so the non-package directories carry
# no lintable files today; they are still linted so that any future root-level
# source is covered exactly as `eslint .` would have. The root `.eslintignore`
# applies to every batch. Extra arguments are forwarded to each invocation, so
# `scripts/eslint-repo.sh --fix` fixes the whole repository.
#
# Exits non-zero if any batch reports errors.
set -eu

status=0

# eslint exits non-zero when a batch matches no lintable files; a package or a
# top-level directory can legitimately be empty of lintable files, so tolerate
# empty batches with --no-error-on-unmatched-pattern and let real lint errors
# set the status.
lint() {
  if ! eslint --no-error-on-unmatched-pattern "$@"; then
    status=1
  fi
}

# One batch per workspace package.
for pkg in packages/*/; do
  lint "$@" "${pkg}"
done

# One batch per top-level directory that is not a workspace package. Passing a
# directory (not explicit filenames) lets eslint apply the same extension and
# ignore filtering as `eslint .`, so root-level `.mjs`/`.cjs` config files it
# would skip are not force-linted.
for entry in */; do
  case "${entry}" in
    packages/ | node_modules/) continue ;;
  esac
  lint "$@" "${entry}"
done

exit "${status}"
