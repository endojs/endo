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

## Boot model

The genie runs as the daemon's root agent.
`scripts/bottle.sh invoke` starts an Endo daemon, then launches
`setup.js` via `endo run --UNCONFINED setup.js --powers @agent`.
`setup.js` calls
`E(hostAgent).makeUnconfined('@main', main.js, { powersName: '@agent',
resultName: 'main-genie', env: … })`,
which spawns the genie worker directly on the daemon's host agent —
there is no intermediate guest and no configuration form.
The worker's inbox is `@self` and `@agent`;
both names refer to the same root agent.

Configuration is sourced from `GENIE_*` environment variables at the
moment `makeUnconfined` forwards them;
`main.js` reads them from the `env` argument it receives and fails
fast if required values are missing.
See `main.js` for the authoritative list of variables.

The stable pet name for the root worker is `main-genie`.
`setup.js` is idempotent: repeated `bottle.sh invoke` calls short-circuit
once `main-genie` exists, and restarting the daemon reincarnates the
worker from the stored formula without re-running `setup.js`.

## Documentation

- [Design Document](DESIGN.md) - Complete architecture and implementation details
- [Tool Schema](src/tools/) - Tool definitions and schemas
- [Agent Development Guide](CLAUDE.md) - Boot model, identity, env-var config
