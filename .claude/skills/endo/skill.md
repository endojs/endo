---
name: endo
description: Interact with the running Endo daemon — inspect agent inboxes, read/post to channels, list names, send messages to agents. Use when debugging agent behavior, checking channel state, or testing agent interactions.
allowed-tools: Bash(node packages/fae/endo-skill.js *)
argument-hint: <command> [args...]
---

# Endo Daemon Skill

Connects to the running Endo daemon via CapTP to inspect and interact with agents, channels, and the inbox. The script lives at `packages/fae/endo-skill.js` — run from the monorepo root.

## Commands

```bash
# Pet name directory
node packages/fae/endo-skill.js names                     # List all HOST pet names
node packages/fae/endo-skill.js names <agent-profile>      # List an agent's pet names
node packages/fae/endo-skill.js lookup <name>              # Inspect a value (show methods)

# Inbox
node packages/fae/endo-skill.js inbox                     # List HOST inbox
node packages/fae/endo-skill.js agent-inbox <profile> [N]  # List agent's last N inbox messages
node packages/fae/endo-skill.js read-message <number>      # Full message JSON

# Messaging
node packages/fae/endo-skill.js send <to> <text>           # Send from HOST
node packages/fae/endo-skill.js agent-send <agent> <text>  # Send to an agent

# Channels
node packages/fae/endo-skill.js channel-messages <name> [N]  # Last N channel messages
node packages/fae/endo-skill.js channel-members <name>       # List channel members
node packages/fae/endo-skill.js channel-post <name> <text> [--reply-to <n>]  # Post to channel
```

## Suppress CapTP teardown noise

Add `2>/dev/null` to suppress stderr from the CapTP disconnect.

## Common pet names

- `profile-for-fae` — fae agent's profile (use with `agent-inbox` and `names`)
- `fae-factory` — factory for creating fae agent instances
- `fae` — the fae agent's handle

## Notes

- Run all commands from the monorepo root directory
- Requires a running Endo daemon (`endo start`)
- Channel message numbers are sequential integers
- Agent profiles (e.g. `profile-for-fae`) give access to the agent's namespace
