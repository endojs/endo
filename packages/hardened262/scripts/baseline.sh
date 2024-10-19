#!/bin/bash
# Generates a baseline (what is currently passing and failing) as lists
# of files organized by qualifiers
set -ueo pipefail
mkdir -p baseline
# run all tests
yarn test262 --json > baseline/all.json
# generate file lists for easy yarn test262 * verification
for agent in xs sesXs sesNode; do
  for lockdown in '' -lockdown; do
    for compartment in '' -compartment; do
      for ok in -ok -not-ok; do
        jq -r '
          select(
            .ok == ($ok == "-ok") and
            .agent == $agent and
            .lockdown == ($lockdown != "") and
            .compartment == ($compartment != "")
          ) .file
        ' --arg ok "$ok" \
          --arg agent "$agent" \
          --arg lockdown "$lockdown" \
          --arg compartment "$compartment" \
          baseline/all.json \
        > baseline/$agent$lockdown$compartment$ok
      done
    done
  done
done
# Delete empty lists
find baseline -size 0 -exec rm {} \;
