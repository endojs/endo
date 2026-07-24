---
'@endo/floot': minor
---

Add a `claude-cli` session backend: a session pinned to it runs its turns
against a `ClaudeClient` capability (`@endo/claude-sandbox`) instead of the
streaming API provider, translating the sandboxed CLI's stream-json events onto
Floot's reply wire. Each session binds its own client (`<base>-<sessionId>`,
`FLOOT_CLAUDE_CLIENT` naming the base), since a client carries one CLI
conversation and workspace.

Also adopts the consolidated `makeBufferedReader` from `@endo/exo-stream` for
the reply, transcript, and audio wires, replacing the package-local copy.
