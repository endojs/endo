#!/bin/bash
set -ueo pipefail

# Gather a map of the versions from this or another workspace.
WORKDIR=${1:-.}

cd -- "$WORKDIR"
yarn workspaces --json info --silent |
jq -r '.data | fromjson | .[].location | "\(.)/package.json"' |
xargs jq '{key: .name, value: "^\(.version)"}' |
jq --slurp from_entries
