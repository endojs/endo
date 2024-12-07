#!/bin/bash
set -ueo pipefail

# Gather a map of the versions from this or another workspace.
WORKDIR=${1:-.}

cd -- "$WORKDIR"

(
  echo package.json
  npm query .workspace |
  jq -r '.[].location | "\(.)/package.json"'
) |
xargs jq '
  ((.dependencies // {}), (.devDependencies // {}))
  | to_entries[]
' |
jq --slurp '
  group_by(.key)[] |
  {
    key: [.[] | .key][0],
    value: ([
      .[] |
      .value |
      (capture("[^0-9]*(?<major>[0-9]+).(?<minor>[0-9]+).(?<patch>[0-9]+)") // {major: "0", minor: "0", patch: "0"}) |
      [(.major | tonumber), (.minor | tonumber), (.patch | tonumber)]
    ] | sort | last | "^\(.[0]).\(.[1]).\(.[2])")
  }
' | jq --slurp 'from_entries'
