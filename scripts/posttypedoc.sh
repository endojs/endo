#!/bin/bash
die() { printf '%s\n' "$*" >&2; exit 1; }

(
  cd docs || die "cd: docs failed"
  find images -type f -print0 | xargs -0 tar c
) |
(
  cd api-docs || die "cd: api-docs failed"
  tar xv
)
