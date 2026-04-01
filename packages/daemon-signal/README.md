# @endo/daemon-signal

Signal integration tooling for controlling an Endo daemon over Signal
messages via `signal-cli`.

This package provides:
- a `signal-cli` transport caplet
- a bridge caplet with slash-command handling and sender/agent routing
- a setup script for provisioning integration objects in host inventory

## Setup

Run from this package directory:

```bash
SIGNAL_ACCOUNT=+15551234567 yarn setup-tools
```

Optional environment variables:
- `SIGNAL_CLI_BIN` (default: `signal-cli`)
- `SIGNAL_GROUP_PREFIX` (required leading mention for group messages)
- `SIGNAL_AGENT_MAP_JSON` (JSON sender -> daemon agent map)

Example:

```bash
SIGNAL_ACCOUNT=+15551234567 \
SIGNAL_GROUP_PREFIX='@endo-bot' \
SIGNAL_AGENT_MAP_JSON='{"+15550000001":"fae"}' \
yarn setup-tools
```

## Inbound policy

- Ignore messages from senders with no configured daemon agent.
- In group chats, ignore messages unless they start with the configured
  mention prefix.

## Commands

- `/help`
- `/enter <handle-petname>`
- `/exit`
- `/who`
- `/inventory [path]`
- `/show <path>`
- `/send <text>`

After `/enter`, plain text is forwarded to that active conversation
handle.

## Package contents

- `src/signal-cli.js`:
  JSON event parsing and `signal-cli` receive/send transport wrapper.
- `src/signal-policy.js`:
  sender-to-agent and group mention filtering policy.
- `src/signal-command.js`:
  slash command parsing and `@petname` reference extraction.
- `src/signal-bridge.js`:
  stateful command execution, conversation management, and forwarding.
- `tools/signal-cli.js`:
  unconfined exo wrapper around the transport.
- `tools/signal-bridge.js`:
  unconfined exo wrapper around the bridge controller.
- `setup-tools.js`:
  convenience provisioning script for host inventory setup.

