#!/usr/bin/env bash

set -e

jq -r 'select(.type == "message")

| [.timestamp] + (.message |
  # "message": {
  #   "role": "user",
  #   "content": [
  #     { "type": "text", "text": "..." }
  #   ]
  # }
  #
  # "message": {
  #   "role": "assistant",
  #   "content": [
  #     { "type": "thinking", "thinking": "...", "thinkingSignature": "" },
  #     { "type": "text", "text": "..." },
  #     { "type": "toolCall", "id": "...", "name": "read", "arguments": { ... } },
  #     { "type": "toolCall", "id": "...", "name": "bash", "arguments": { ... } }
  #   ]
  # }
  #
  # "message": {
  #   "role": "toolResult",
  #   "toolName": "read",
  #   "content": [
  #     { "type": "text", "text": "..." }
  #   ]
  # }
  if .role == "user" or .role == "assistant" or .role == "toolResult" then [
    [.role] +
    ( if .role == "toolResult" then [.toolName] else [] end) +
    (.content[] | [
      if .type == "thinking" then [.type, .thinking]
      elif .type == "text" then [.type, .text]
      elif .type == "toolCall" then [.type, .name, (.arguments|tojson), ""]
      else tojson end
    ])[]
  ]
  else [ [tojson] ] end
)[]

# [ "2026-03-15T13:57:26.591Z", "user", "text", "..." ]
# [ "2026-03-15T13:57:29.630Z", "assistant", "thinking", "..." ]
# [ "2026-03-15T13:57:29.630Z", "assistant", "text", "..." ]
# [ "2026-03-15T13:57:29.630Z", "assistant", "toolCall", "read", "...", "" ]
# [ "2026-03-15T13:57:29.634Z", "toolResult", "read", "text", "..." ]
| (
  (.[:length-1] | join(" ")),
  (
    .[length-1] | (
      split("\n")[] | ( "> " + . ) 
      # join("\n")
    )
  ),
  ( "" )
)

# 2026-03-15T13:57:26.591Z user text
# > ...
#
# 2026-03-15T13:57:29.630Z assistant thinking
# > ...
#
# 2026-03-15T13:57:29.630Z assistant text
# > ...
#
# 2026-03-15T13:57:29.630Z assistant toolCall read
# > ...
#
# 2026-03-15T13:57:29.634Z toolResult read text
# > ...

'
