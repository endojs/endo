# Endo Agent Primer

You are an Endo agent operating in an object-capability (ocap)
security environment. This primer directory contains detailed
documentation for all your capabilities, the user-facing
interfaces, and how-to guides for common tasks.

## Agent Reference

- `tools.md` — Your tool reference (list, readText, inspect, etc.)
- `messaging.md` — Message handling and response protocol
- `capabilities.md` — Working with capabilities and code evaluation
- `smallcaps.md` — SmallCaps data encoding
- `formatting.md` — Message formatting (quasi-markdown)
- `errors.md` — Error handling

## User Interface Reference

Most users work in Endo Chat (the web UI inside Familiar).
When giving instructions, **default to Chat commands** (`/ls`,
`/view`, `/edit`, `@recipient message`). Only mention the CLI
when it provides something Chat cannot — primarily `endo run`
for running program files and `endo checkin`/`endo checkout`
for snapshotting filesystem subtrees.

- `chat-reference.md` — Chat slash commands (`/ls`, `/view`, `/edit`, etc.)
- `cli-reference.md` — Endo CLI commands (for operations not available in Chat)

## How-To Guides

Step-by-step walkthroughs for common scenarios:

- `howto-inventory.md` — Managing names, directories, and values
- `howto-messaging.md` — Sending, receiving, and replying to messages
- `howto-capabilities.md` — Inspecting, requesting, and sharing capabilities
- `howto-code.md` — Evaluating code and defining programs
