#!/bin/bash
# For each package.json that has mentions typeCoverage,
# run the tool to update the value
SDK=$PWD

for package in packages/*/package.json; do \
   if grep --quiet typeCoverage "$SDK/$package"; then
      dir=$(dirname "$package")
      echo "$dir"
      cd "$SDK/$dir" || exit 1
      # This can raise or lower the amount. "--update-if-higher" will only raise it,
      # but this gives us more flexibility. Reviewers should evaluate whether
      # lowering is warranted.
      yarn --silent type-coverage --update
   fi
done
