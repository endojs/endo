# @endo/genie

A Claw-like AI Agent framework for the Endo hardened JavaScript project.

## Overview

`@endo/genie` provides a complete system for building autonomous agents with:
- **Modular Tool System** - Extensible tools with security constraints
- **Memory Integration** - Persistent knowledge storage and search
- **Heartbeat Execution** - Autonomous task automation
- **System Prompt Builder** - LLM-ready prompts with workspace context

## Quick Start

```javascript
import { systemBuilder } from '@endo/genie';

// Build system prompt for your agent
const systemPrompt = systemBuilder({
  identity: 'You are an autonomous JavaScript developer assistant',
  soul: 'You help developers write secure, maintainable code',
  memory: './MEMORY.md',
  tools: './src/tools/',
  heartbeatPath: './HEARTBEAT.md',
});

console.log(systemPrompt);
```

## Daemon bootstrap (`setup.js`)

The genie ships with a `setup.js` script that provisions the genie
guest, mints supporting host-side capabilities, and watches the inbox
for the configuration form.
Run it via `endo run --UNCONFINED setup.js --powers @agent` and tune
its behaviour with the following environment variables:

| Variable          | Purpose                                                                                                                                                                                                                                                  |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `GENIE_MODEL`     | Model spec (e.g. `ollama/llama3.2`) auto-submitted into the configuration form. When absent the form is left for manual submission.                                                                                                                      |
| `GENIE_WORKSPACE` | Host filesystem path to the workspace directory the daemon should mount on the agent's behalf. When provided, `setup.js` mints a `workspace-mount` Mount cap on the host and introduces it into the genie guest as `workspace`. Omit to keep the legacy "workspace = host cwd, no slice" code path during rollout. |
| `GENIE_NAME`      | Pet name for the first agent guest. Defaults to `main-genie`.                                                                                                                                                                                            |

`setup.js` also mints a `sandbox-factory` capability via the
`@endo/sandbox` plugin's `make-unconfined` entry point (see
[`packages/sandbox/README.md`](../sandbox/README.md)) and introduces
it into the genie guest as `sandboxes`.
Both `workspace` and `sandboxes` lookups in `main.js` are guarded with
structured-error fallbacks so partial rollouts surface clearly rather
than silently dropping back to direct host spawning.

Inside a sandbox slice the workspace surfaces at the slice-internal
path `/workspace`; the genie agent should `chdir` there before running
tool calls.
See [`TODO/44_genie_sandbox_workspace_slice.md`](../../TODO/44_genie_sandbox_workspace_slice.md)
for the cwd plumbing.

## Features

### Core Components

#### System Builder
- Combines identity, soul, memory, tools, and workspace context
- Generates complete system prompts for LLMs
- Supports custom suffixes and policies

#### Tools Module
- with security validation
- Path traversal prevention
- Code injection protection
- Dangerous command detection

#### Heartbeat Runner
- Loads tasks from `HEARTBEAT.md`
- Parses and executes tasks
- Updates task status automatically

#### Memory System
- Search over memory files
- Line-specific content retrieval
- Extensible indexing strategy

### Security

All tools implement:
- Input validation
- Path traversal prevention
- Code injection prevention
- Dangerous operation detection
- Content validation

## Tools Reference

| Tool            | Description                            |
|-----------------|----------------------------------------|
| `memory_get`    | Fetch specific lines from memory files |
| `memory_search` | Semantic search over memory files      |
| `readFile`      | Read file contents with offset/limit   |
| `writeFile`     | Write content to files                 |
| `editFile`      | Replace strings in files               |
| `webFetch`      | Fetch URLs with timeout                |
| `webSearch`     | Search web (DuckDuckGo)                |
| `bash`          | Execute shell commands safely          |

## API

### System Builder

```javascript
import { systemBuilder } from '@endo/genie';

const prompt = systemBuilder({
  identity: 'string',        // User identity
  soul: 'string',            // Internal truths
  memory: 'string',          // Path to MEMORY.md
  tools: 'string',           // Path to tools directory
  heartbeatPath: 'string',   // Path to HEARTBEAT.md
  disableSuffix: boolean,    // Disable security suffix
  disablePolicy: boolean,    // Disable policy section
  strictPolicy: boolean,     // Enable strict policy
  securityNotes: 'string',   // Custom security notes
});
```

### Heartbeat Runner

```javascript
import { HeartbeatRunner } from '@endo/genie';

const runner = new HeartbeatRunner({ heartbeatPath: './HEARTBEAT.md' });
const result = await runner.run();
```

## Testing

### Unit tests

```bash
cd packages/genie && npx ava
```

### Integration tests

`yarn test:integration` boots a real Endo daemon, runs `setup.js`, waits
for the agent to announce readiness, and then sources the scenario
indicated by `GENIE_TEST`.
The default scenario exercises the workspace file tools.

```bash
cd packages/genie
yarn test:integration                     # default: workspace-tool scenario
yarn test:integration:sandbox-slice       # sandbox slice probes
```

The sandbox-slice scenario verifies that the agent's `bash` tool
actually runs inside a confined bwrap slice (workspace bind, mount
table, host filesystem isolation, network profile).
It is **Linux-only** and requires the `bubblewrap` package on the host
runner; install it with:

```bash
sudo apt install bubblewrap        # Debian / Ubuntu
sudo dnf install bubblewrap        # Fedora
```

When `bwrap --version` fails — or when the kernel rejects unprivileged
user-namespace creation (e.g. AppArmor `userns` rule,
`kernel.unprivileged_userns_clone=0`) — the scenario exits cleanly with
a `SKIP:` notice rather than failing.

## Documentation

- [Design Document](DESIGN.md) - Complete architecture and implementation details
- [Tool Schema](src/tools/) - Tool definitions and schemas
- [Agent Development Guide](CLAUDE.md) - Boot model, identity, env-var config
