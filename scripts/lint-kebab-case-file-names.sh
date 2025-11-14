#!bin/bash
set -ueo pipefail
EXEMPTIONS=scripts/lint-kebab-case-exemptions.txt
function violators() {
  comm -23 \
    <(git ls-tree HEAD -r | cut -d$'\t' -f2 | grep '/[^/\.]*[a-z][^/]*$' | grep '[A-Z]' | sort) \
    <(sort "$EXEMPTIONS")
}
violators | (while read line; do
  violators
  echo
  echo The above file names must be kebab-case or added to $EXEMPTIONS
  exit 1
done >&2)
