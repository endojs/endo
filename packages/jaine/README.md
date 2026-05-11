# Jaine

Jaine is a channel-native LLM agent for the Endo daemon.
Where other Endo agents (lal, fae) operate through private inbox
messages, Jaine is designed for multi-user channels: she joins
conversations, watches for new messages, decides when to participate,
and replies in-thread.

## Architecture

Jaine uses a three-layer architecture that separates fast routing
decisions from expensive composition and tool execution.

```
Channel messages         Inbox messages
       |                       |
       v                       v
  [Layer 1: Router]       [Layer 1: Router]
  LLM-powered routing     Rule-based routing
  per-channel participation
       |                       |
       v                       v
  [Layer 2: Composer]     [Layer 3: Executor]
  Generates response text  Runs tools directly
  via delegate() tool      for inbox tasks
       |
       v
  [Layer 3: Executor]
  Performs capability
  operations on behalf
  of the composer
```

### Layer 1 -- Router (`router.js`)

The router handles two distinct flows:

- **Inbox messages** are routed with simple rules.
  @mentions always engage; other messages engage by default.
- **Channel messages** use an LLM call to decide whether Jaine
  should respond based on the conversation context and her current
  participation level in that channel.

Participation levels (`active`, `normal`, `quiet`, `observer`) are
per-channel and adjustable by users naturally in conversation --
e.g., "Jaine, be more active here" or "tone it down".

### Layer 2 -- Composer (`composer.js`)

The composer generates a natural-language response.
It has one tool, `delegate({ intent, description })`, which hands
work off to the executor.
This keeps the response-generation context lightweight while still
allowing the composer to fetch information or perform actions.

### Layer 3 -- Executor (`executor.js`)

The executor has the full tool set: `list`, `lookup`, `adopt`, `exec`,
`readChannel`, `send`, `reply`, `dismiss`, `readFile`, `listDir`, and
`createTimer`.
It runs multi-step agentic loops (up to 30 iterations) with repetition
detection to prevent runaway tool-calling.

### Channel watching

When Jaine first joins a channel (via @mention or reconnection after
restart), she starts a background watcher that polls for new messages
every 5 seconds.
Each new message goes through the router; if the router says engage,
Jaine posts a "Thinking..." placeholder and replaces it with the final
response via edit.

On daemon restart, Jaine scans her petname directory for channels
(names matching `ch-*`) and reconnects to each one automatically.

### Deduplication

A mention in a channel arrives as both a channel message and an inbox
notification.
The mention flow records the channel message number in a set; the
watcher skips any message already handled by the mention flow.

## Configuration

Jaine is auto-provisioned by `yarn dev` in `packages/chat` alongside
lal and fae.
She reads configuration from environment variables at setup time.

### LLM provider

The main provider is used for the composer and executor (Layers 2 and
3) -- the expensive, high-quality calls.

| Variable | Default | Description |
|---|---|---|
| `ENDO_LLM_HOST` | `http://localhost:11434/v1` | LLM API base URL |
| `ENDO_LLM_MODEL` | `qwen3` | Model name |
| `ENDO_LLM_AUTH_TOKEN` | `ollama` | API key / auth token |
| `ENDO_LLM_NAME` | `default` | Named provider config |

### Fast provider (optional)

The fast provider is used for the router (Layer 1) -- quick, cheap
decisions like "should I reply to this message?"
If not configured, the router uses the main provider.

| Variable | Default | Description |
|---|---|---|
| `ENDO_LLM_FAST_MODEL` | *(none -- required to enable)* | Fast model name |
| `ENDO_LLM_FAST_HOST` | falls back to `ENDO_LLM_HOST` | API base URL |
| `ENDO_LLM_FAST_AUTH_TOKEN` | falls back to `ENDO_LLM_AUTH_TOKEN` | API key |

Since host and auth token default to the main provider's values, you
typically only need to set `ENDO_LLM_FAST_MODEL`.
For example, to use Haiku for routing and Sonnet for responses:

```sh
ENDO_LLM_HOST=https://api.anthropic.com
ENDO_LLM_AUTH_TOKEN=sk-ant-...
ENDO_LLM_MODEL=claude-sonnet-4-6-20250514
ENDO_LLM_FAST_MODEL=claude-haiku-4-5-20251001
```

### Manual setup with `reload.sh`

Outside of `yarn dev`, use the reload script for iterating on Jaine's
code.
It stops and restarts the daemon so the pinned driver picks up your
latest changes.

```sh
cd packages/jaine
./reload.sh          # restart daemon, pinned driver auto-starts
./reload.sh --full   # tear down + full re-provision
```

**Default mode** (`./reload.sh`):

1. Stops the daemon (`endo stop`)
2. Starts the daemon (`endo start`)
3. Checks if `jaine-driver` exists (the pinned driver auto-starts on
   boot with the current code on disk)
4. If it exists, done -- your code changes are live
5. If not, falls back to full setup

**Full mode** (`./reload.sh --full`):

1. Stops and starts the daemon
2. Removes `jaine-driver` and `jaine-factory` to force re-creation
3. Sources `.env` from `packages/jaine/` (or falls back to
   `packages/fae/.env`)
4. Runs `setup.js` which provisions the provider, factory, and a
   default pinned agent from scratch

The `.env` file should contain your LLM credentials.
The reload script maps them to `ENDO_LLM_*` variables:

```sh
# packages/jaine/.env
LAL_HOST=https://api.anthropic.com
LAL_AUTH_TOKEN=sk-ant-...
LAL_MODEL=claude-sonnet-4-6-20250514

# Optional fast model
ENDO_LLM_FAST_MODEL=claude-haiku-4-5-20251001
```

**Important:** If the Vite dev server (`yarn dev` in `packages/chat`)
is running, stop it before using `reload.sh`.
The Vite plugin has a health-check loop that will fight with the
reload script over daemon restarts, causing `EADDRINUSE` port
conflicts.

## File overview

| File | Role |
|---|---|
| `agent.js` | Factory entry point + `spawnWorkerLoop` orchestrator |
| `router.js` | Layer 1: inbox rules + LLM channel routing |
| `composer.js` | Layer 2: response generation with `delegate()` |
| `executor.js` | Layer 3: full tool set, agentic loop |
| `driver.js` | Thin caplet that reads config and starts the loop |
| `setup.js` | Auto-provisioning for `ENDO_EXTRA` / `endo run` |
| `jaine-factory-setup.js` | Manual factory creation (used by reload) |
| `logger.js` | File-backed logger (`logs/jaine.log`) |
| `reload.sh` | Dev iteration script |
