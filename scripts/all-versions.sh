#!/bin/bash
jq '
  ((.dependencies // {}), (.devDependencies // {}))
  | to_entries[]
' packages/*/package.json \
| jq --slurp '
  group_by(.key)[] |
  {
    key: [.[] | .key][0],
    value: ([
      .[] |
      .value |
      (capture("[^0-9]*(?<major>[0-9]+).(?<minor>[0-9]+).(?<patch>[0-9]+)") // {}) |
      [(.major | tonumber), (.minor | tonumber), (.patch | tonumber)]
    ] | sort | last | "^\(.[0]).\(.[1]).\(.[2])")
  }
' | jq --slurp 'from_entries'

