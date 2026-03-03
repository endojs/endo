# @endo/genie Design Document

## Overview

`@endo/genie` is a Claw-like AI Agent framework designed for the Endo hardened JavaScript project.
It provides a complete system for building autonomous agents with:
- Modular tool system with security constraints
- Memory integration for persistent knowledge
- Heartbeat-based task execution
- System prompt builder for LLM integration
- Workspace management utilities

## Architecture

### Core Components

#### 1. System Builder (`system/index.js`)

The central orchestrator that builds complete system prompts for LLMs by combining:
- **Identity & Soul**: User-provided persona and internal truths
- **Memory Context**: Workspace and project knowledge
- **Tools**: Available tool implementations
- **Workspace Context**: Session and runtime information

**Entry Point**: `systemBuilder(options)` - Returns complete system prompt string

**File Structure**:
```
src/system/
├── index.js                    # Main builder
├── memory-context.js           # Memory file injection
├── workspace-context.js        # Workspace section builder
└── tools-list.js               # Tools documentation builder
```

#### 2. Tools Module (`tools/`)

Extensible tool system with built-in security:

**Available Tools**:
- `memory_get` - Fetch specific lines from memory files
- `memory_search` - Semantic search over memory files
- `readFile` - Read file contents with offset/limit
- `writeFile` - Write content to files
- `editFile` - Replace strings in files
- `webFetch` - Fetch URLs with timeout
- `webSearch` - Search web (DuckDuckGo HTML API)
- `bash` - Execute shell commands with validation

**Security Features**:
- Path traversal prevention
- Code injection prevention
- Dangerous command detection
- Content validation
- Rate limiting support

#### 3. Heartbeat Runner (`heartbeat/index.js`)

Autonomous task executor:
- Loads heartbeat tasks from `HEARTBEAT.md`
- Parses and validates task descriptions
- Executes tasks based on keywords
- Updates task status in heartbeat file

#### 4. Security Module (`security.js`)

Security utilities:
- System prompt suffix generation
- Policy enforcement
- Parameter validation

## Design Principles

### 1. Security-First

All tools implement:
- Input validation
- Path traversal prevention
- Code injection prevention
- Dangerous operation detection

### 2. Modular & Extensible

- Tool-based architecture
- Schema validation using `@endo/patterns`
- Easy to add new tools

### 3. Autonomous Execution

- Heartbeat runner for task automation
- Memory integration for knowledge persistence
- Workspace utilities for file management

### 4. Developer-Friendly

- Clear documentation
- Consistent error handling
- Simple API

## Usage Example

```javascript
import { systemBuilder } from './src/system/index.js';
import { HeartbeatRunner } from './src/heartbeat/index.js';

// Build system prompt
const systemPrompt = systemBuilder({
  identity: 'You are an autonomous assistant',
  soul: 'You help developers with best practices',
  memory: './MEMORY.md',
  memoryPath: './memory',
  tools: './src/tools/',
  heartbeatPath: './HEARTBEAT.md',
  disableSuffix: false,
  disablePolicy: false,
  strictPolicy: false,
});

// Execute heartbeat
const heartbeat = new HeartbeatRunner({ heartbeatPath: './HEARTBEAT.md' });
await heartbeat.run();
```

## Tool Schema

All tools use `@endo/patterns` for schema validation:

```javascript
import { M } from '@endo/patterns';

export const exampleTool = {
  schema: M.interface('exampleTool', {
    param1: M.string(),
    param2: M.number().optional(),
    param3: M.boolean().optional(),
  }),

  help: () => `Tool description...`,

  async execute(params) {
    // Tool implementation
    return { success: true, result: ... };
  },
};
```

## Memory System

### File Structure

```
MEMORY.md                  # Main memory file
memory/                    # Directory for indexed memory
├── topic.md               # Topic specific memory
├── YYYY-MM-DD-summary.md  # Summarization of session history from prior day(s)
└── ...
```

### Search Strategy

- Simple substring search (can be upgraded to vector embeddings)
- Searches in `MEMORY.md` and `memory/*.md`
- Returns top `limit` matches

## Heartbeat Format

```markdown
## Current Tasks

- [ ] Review project documentation
- [ ] Analyze security vulnerabilities
- [ ] Update dependencies

## Done Tasks

- [x] Initialize repository
```

## Future Enhancements

1. **Full Text Search** - use sqlite fts5
2. **Semantic Search** - via vector embeddings (aka RAG)
3. **Tool Chaining** - Sequence tool calls
4. **Conversation Memory** - LLM context management
5. **Rate Limiting** - Tool call throttling
6. **Webhooks** - External integration
7. **Caching** - Response caching

## Testing Strategy

1. Unit tests for each tool
2. Integration tests for system builder
3. End-to-end tests for heartbeat runner
4. Security validation tests

## Contributing

When adding new tools:

1. Define schema using `@endo/patterns`
2. Implement `help()` documentation
3. Add security validations
4. Update `tools/index.js` exports
