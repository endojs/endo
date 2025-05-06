#!/usr/bin/env bash

# This script tries to figure out what year a package was created and updates
# its `LICENSE` file accordingly (including copyright owner)

set -euo pipefail

declare -A years
for pkg in ./packages/*; do
  year=$(git --no-pager log --diff-filter=A --follow --format=%ad --date format:%Y --reverse -- "${pkg}" | head -n1) || true
  years[$pkg]=$year
done

for i in "${!years[@]}"; do
  license="${i}/LICENSE"
  year="${years[$i]}"
  if [ -f "$license" ]; then
    sed -i '' -e "s/\[yyyy\]\ \[name\ of\ copyright\ owner\]/${year} Endo Contributors/g" "$license"
  fi
done
