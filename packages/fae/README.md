# @endo/fae

An LLM agent for Endo with dynamic tool capabilities. Fae runs as an
autonomous guest caplet inside the Endo daemon, where it processes messages
and adopts tool capabilities at runtime.

## Configuration

Fae uses the same LLM provider configuration as `@endo/lal`.

| Variable | Description | Default |
|----------|-------------|---------|
| `LAL_HOST` | API base URL (Ollama, llama.cpp, or Anthropic) | `http://localhost:11434/v1` |
| `LAL_MODEL` | Model name | `qwen3` (Ollama) or `claude-opus-4-5-20251101` (Anthropic) |
| `LAL_AUTH_TOKEN` | API key (required for Anthropic, optional for local) | - |

Create a `.env` file from the example:

```bash
cp .env.example .env
# Edit .env with your provider details
```

## Caplet Mode (Chat Demo Integration)

Fae can run as a guest caplet inside the Endo daemon, processing messages
autonomously. This is the mode used with the `@endo/chat` UI.

### Prerequisites

Build the workspace from the repo root:

```bash
cd ../..
npx corepack yarn install
```

### Full Demo Walkthrough

#### 1. Purge and start the daemon

Start fresh by purging all daemon state:

```bash
yarn endo purge -f
yarn endo start
```

#### 2. Start the chat UI

In a separate terminal, start the chat application:

```bash
cd packages/chat
yarn dev
```

The UI will be available at http://localhost:5173.

#### 3. Source your LLM config

Back in the fae package directory:

```bash
cd packages/fae
source .env
```

#### 4a. Provision fae WITHOUT tools

Creates a fae agent with only built-in mail and directory tools:

```bash
yarn setup
```

#### 4b. Provision fae WITH pre-installed tools

Creates example tools (greet, math, timestamp) and provisions fae with
them already in its inventory:

```bash
yarn setup-with-tools
```

#### 5. Create tools independently (optional)

Create tool caplets in the host's inventory without provisioning fae.
Useful for demonstrating capability passing:

```bash
yarn setup-tools
```

This creates `greet-tool`, `math-tool`, and `timestamp-tool` in the
host's petname directory.

**Create filesystem tools** (read-file, write-file, edit-file, list-dir,
run-command). The root directory for all operations is fixed at creation
time, defaulting to the current directory. Override with `FAE_CWD`:

```bash
yarn setup-fs-tools
# Or with a specific root:
FAE_CWD=/path/to/project yarn setup-fs-tools
```

You can verify created tools with:

```bash
yarn endo list
```

#### 6. Interact via the chat UI

Open http://localhost:5173 in your browser. You should see fae's
"Fae agent ready." announcement in the inbox.

**Send a message to fae:**

Type in the chat input: `@fae Hello, what can you do?`

**Send a tool to fae:**

If you created tools independently (step 5), send one to fae via chat:

`@fae Here is a timestamp tool @timestamp-tool`

Fae will adopt the tool and can use it on subsequent turns.

**Ask fae to use a tool:**

`@fae What time is it?`

Fae will discover the timestamp tool and call it to answer.

### Verifying State

Use the Endo CLI to inspect what's happening:

```bash
# List all petnames in the host directory
yarn endo list

# Check fae's inbox
yarn endo inbox --as fae

# List fae's petnames
yarn endo list --as fae
```

### Starting Over

To reset all state and start fresh:

```bash
yarn endo purge -f
yarn endo start
```

Then re-run the setup steps above.

## Architecture

### Caplet mode (`agent.js`)

Autonomous guest agent running inside the daemon. No filesystem access.
Tools are limited to petname operations (`list`, `lookup`, `store`,
`remove`), mail operations (`send`, `listMessages`, `dismiss`), and
`adoptTool` for runtime tool adoption. Additional capabilities come from tool caplets sent via messages.
Filesystem tools (read-file, write-file, edit-file, list-dir,
run-command) can be created with `yarn setup-fs-tools`; each tool's
root directory is set at creation time via `FAE_CWD` (default:
`process.cwd()`).

### Tool caplets (`tools/*.js`)

Unsandboxed modules that produce FaeTool exo objects conforming to the
`FaeTool` interface (`schema()`, `execute(args)`, `help()`). Each is
created via `yarn endo run --UNCONFINED` and can live in any agent's inventory.

## File Structure

```
packages/fae/
├── agent.js                  # Caplet entry point (make function)
├── setup.js                  # Provision fae (no tools)
├── setup-tools.js            # Create example tools in host inventory
├── setup-fs-tools.js         # Create filesystem tools (FAE_CWD at creation time)
├── setup-with-tools.js       # Provision fae with pre-installed tools
├── src/
│   ├── extract-tool-calls.js # Shared XML tool call parser
│   ├── fae-tool-interface.js # FaeTool M.interface guard
│   ├── tool-makers.js        # Tool factory functions
│   └── tools.js              # Tool discovery and execution
└── tools/
    ├── greet.js              # Example: greeting generator
    ├── math.js               # Example: arithmetic
    ├── timestamp.js          # Example: current time
    ├── read-file.js          # FaeTool: read files under root
    ├── write-file.js         # FaeTool: write files under root
    ├── edit-file.js          # FaeTool: edit files under root
    ├── list-dir.js           # FaeTool: list directory under root
    └── run-command.js        # FaeTool: run shell commands in root
```
