# Fae vs Lal — Architecture Comparison

A side-by-side comparison of `@endo/fae` and `@endo/lal`, both LLM agent
caplets for the Endo daemon. They share the same runtime environment and
provider system but differ significantly in their tool architecture, security
model, and extensibility.

---

## At a Glance

| Dimension | Fae | Lal |
|-----------|-----|-----|
| Package | `@endo/fae` | `@endo/lal` |
| Role | Dynamic-tool agent with capability adoption | Static-tool agent with eval-proposal mediation |
| Tool definition | `FaeTool` exo objects (schema/execute/help) | Hardcoded OpenAI schemas + switch dispatch |
| Tool discovery | Dynamic per-turn (`discoverTools()`) | None (fixed at load time) |
| Tool count | 8 built-in + unlimited adopted tools | 16 fixed tools |
| Code execution | Direct (via adopted tool caplets) | Mediated (eval-proposal → HOST approval) |
| Filesystem access | Via optional tool caplets | None |
| Provider system | Imports from `@endo/lal` | Defines providers (Ollama, llama.cpp, Anthropic) |
| TypeScript types | JSDoc only | Full `.d.ts` type definitions |
| Test suite | None | Ava tests + simulator |
| Agent communication | Tool-based (send/dismiss) | Tool-based (send/dismiss/request/resolve/reject) |

---

## Architecture Philosophy

### Fae — Extensible Tools

Fae is built around the idea that an agent's capabilities should be dynamic.
Tools are first-class capability objects that can be created, sent between
agents, and adopted at runtime. The agent re-discovers its available tools
at the start of every turn, so newly adopted tools are immediately usable.

The trade-off: Fae has no built-in mediation for dangerous operations. If it
has a tool, it can use it directly. Security comes from the capability model
itself — you only give Fae the tools you trust it with.

### Lal — Mediated Evaluation

Lal is built around the idea that an agent should be able to propose actions
that a human reviews before execution. The eval-proposal system means Lal can
write arbitrary code, but that code only runs when the HOST explicitly grants
it. This creates a human-in-the-loop workflow for code execution.

The trade-off: Lal has no dynamic tool discovery. Its capabilities are fixed
at compile time (the 16 tools in `agent.js`). New capabilities can only be
gained through the eval-proposal mechanism, which requires HOST approval.

---

## Tool System

This is the most fundamental difference between the two agents.

### Fae — FaeTool Exo Objects

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Built-in    │     │   Daemon     │     │   Adopted    │
│  localTools  │ ──▶ │   tools/     │ ──▶ │  (merged)    │
│  (8 tools)   │     │   directory  │     │  toolMap     │
└──────────────┘     └──────────────┘     └──────────────┘
                           ▲
                           │ adoptTool
                    ┌──────┴──────┐
                    │    Mail     │
                    │  (incoming  │
                    │   caplet)   │
                    └─────────────┘
```

- Tools are objects implementing `schema()`, `execute(args)`, `help()`
- Guarded by `M.interface('FaeTool', ...)` pattern
- Called via `E(tool).execute(args)` (works for both local and remote)
- Re-discovered every turn
- Can be hot-reloaded after `adoptTool`
- Tool results serialized as Justin strings

### Lal — Switch Dispatch

```
┌──────────────────┐
│  16 hardcoded    │
│  tool schemas    │
│  (module-level)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  executeTool()   │
│  switch (name)   │
│    case 'help':  │
│    case 'list':  │
│    case 'send':  │
│    ...           │
│    case 'evaluate':  ──▶  Proposal tracking
└──────────────────┘
```

- Tools are schema objects at the module level
- Dispatch is a single `switch` statement
- All tools map directly to `E(powers).method()` calls
- No tool discovery or dynamic registration
- Tool results serialized as Justin strings

### Tool Comparison Table

| Tool | Fae | Lal |
|------|-----|-----|
| `help` | — | Self-documentation for guest capabilities |
| `has` | — | Check if petname exists |
| `list` | List petnames | List petnames (with subdirectory support) |
| `lookup` | Resolve petname to value | Resolve petname to value (string or path) |
| `store` | Store JSON value | — |
| `remove` | Remove petname | Remove petname |
| `move` | — | Move/rename reference |
| `copy` | — | Copy reference |
| `makeDirectory` | — | Create subdirectory |
| `send` | Send with capabilities | Send with capabilities |
| `listMessages` | List inbox | List inbox |
| `dismiss` | Dismiss message | Dismiss message |
| `adoptTool` | Adopt capability as tool | — |
| `adopt` | — | Adopt value from message (general) |
| `request` | — | Request capability from agent |
| `resolve` | — | Respond to request with value |
| `reject` | — | Decline a request |
| `identify` | — | Get formula ID for petname |
| `inspectCapability` | — | Call help() on any capability |
| `evaluate` | — | Propose code for HOST approval |
| Filesystem tools | Via adopted caplets | — |
| Shell execution | Via adopted caplets | — |

Key differences:
- Fae has `store` (persist JSON) and `adoptTool` (meta-tool for installing tools)
- Lal has richer directory ops (`has`, `move`, `copy`, `makeDirectory`)
- Lal has richer mail ops (`request`, `resolve`, `reject`, `adopt`)
- Lal has `identify` and `inspectCapability` for introspection
- Lal has `evaluate` for mediated code execution
- Fae can gain filesystem/shell tools via capability adoption

---

## Code Execution Model

### Fae — Direct Execution

Fae can execute code through adopted tool caplets. If a filesystem tool or
shell tool is in its `tools/` directory, it can use it directly with no
approval step:

```
LLM calls readFile({ filePath: "config.json" })
  → E(tool).execute({ filePath: "config.json" })
  → File contents returned immediately
```

Security boundary: the tool caplet itself enforces restrictions (e.g.,
`resolveSafe()` prevents path traversal above the fixed root directory).

### Lal — Mediated Proposals

Lal cannot execute code directly. It must propose code to its HOST:

```
LLM calls evaluate(source: "E(counter).increment()", ...)
  → E(powers).evaluate(...) sends proposal to HOST
  → Tool returns { status: 'pending', proposalId: 1 }
  → Loop waits for proposal to settle
  → HOST reviews and grants/rejects
  → Notification injected into transcript
  → LLM reads result and continues
```

This creates a fundamentally different interaction pattern: Lal's iteration
loop can block waiting for human approval, while Fae's loop runs without
interruption.

---

## Agent Loop Differences

### Iteration Loop

| Aspect | Fae | Lal |
|--------|-----|-----|
| Tool schemas | Passed to each `chat()` call | Passed to each `chat()` call |
| Tool re-discovery | After every `adoptTool` call | Never |
| Proposal tracking | None | `pendingProposals` Map + `notificationQueue` |
| Waiting behavior | Never waits (tools complete immediately) | Blocks on `Promise.race()` for pending proposals |
| Notification injection | None | Proposal results pushed as user messages |
| Termination | LLM stops calling tools | LLM stops AND no pending proposals AND no notifications |

### Message Processing

| Aspect | Fae | Lal |
|--------|-----|-----|
| Message parsing | Extract text from `strings[]` + `@names[]` | Push generic "You have new mail" prompt |
| Counter-proposals | Not applicable | Detected by message type, formatted with code |
| Self-message filtering | `fromId === selfId` → skip | `fromId === selfId` → skip |
| User message format | `"Message #N from <id>: <text>"` | `"You have new mail. Check your messages..."` |

Fae gives the LLM the actual message content inline. Lal tells the LLM
it has mail and expects it to call `listMessages()` to read it. This means
Lal makes at least one extra tool call per message turn.

---

## System Prompt

### Fae — Concise

~400 words covering:
- Identity (Endo guest caplet)
- Communication tools overview
- Petname directory overview
- Tool adoption instructions
- Response guidelines

### Lal — Comprehensive

~2500 words covering:
- Identity and environment (ocap system)
- SmallCaps encoding guide with type table
- Detailed role and message protocol
- All 16 tools with parameters
- Eval-proposal workflow (propose → grant/reject/counter)
- Available globals in evaluated code (E, M, makeExo)
- Proposal response protocol
- Message format for send() with examples
- Quasi-markdown formatting guide
- Special petnames (SELF, HOST, AGENT)
- Response protocol (tool-calls only, no prose)
- Error handling guide

Lal's prompt is ~6x larger because it must teach the LLM about SmallCaps
encoding, the eval-proposal lifecycle, and the stricter response protocol
(tool-calls only, no text).

### Response Style

| Aspect | Fae | Lal |
|--------|-----|-----|
| Text responses | Allowed | Forbidden (tool-calls only) |
| Communication | Can use text + `send()` | Must use `send()` for all communication |
| Dismiss protocol | "Always dismiss after handling" | "Always dismiss after handling" |

---

## Provider System

Both use the same provider implementations:

```
@endo/lal/providers/index.js
├── anthropic.js    (Anthropic SDK)
├── llamacpp.js     (OpenAI SDK, OpenAI-compatible)
└── ollama.js       (Ollama SDK)
```

Fae imports this as a dependency: `import { createProvider } from '@endo/lal/providers/index.js'`.

Provider selection logic is identical in both:

| `LAL_HOST` pattern | Provider | Default model |
|-------|----------|---------------|
| Contains `anthropic.com` | Anthropic | `claude-opus-4-5-20251101` |
| Contains `/v1` | llama.cpp | `qwen3` |
| Other | Ollama | `qwen3` |

---

## Provisioning

### Fae

```javascript
// setup.js
E(agent).provideGuest('fae', { introducedNames: {}, agentName: 'profile-for-fae' });
E(agent).makeUnconfined('MAIN', 'agent.js', { powersName: 'profile-for-fae', ... });
```

Multiple setup scripts:
- `setup.js` — bare agent (no tools)
- `setup-with-tools.js` — agent with pre-installed tool caplets
- `setup-tools.js` — create tools in host inventory (for later sending)
- `setup-fs-tools.js` — create filesystem tools with fixed root

### Lal

```javascript
// setup.js
E(agent).provideGuest('lal', { introducedNames: {}, agentName: 'profile-for-lal' });
E(guest).storeValue(config, 'lal-config');   // Persist config for re-incarnation
E(agent).makeUnconfined('MAIN', 'agent.js', { powersName: 'profile-for-lal', ... });
```

Single setup script. Also persists config into the guest's petname store.

---

## Error Handling

Both follow the same pattern:

| Scenario | Fae | Lal |
|----------|-----|-----|
| Tool failure | `{ error: message }` → LLM | `{ error: message }` → LLM |
| LLM failure | Send error to sender if valid name | Send error to sender if valid name |
| SmallCaps decode | Fallback to `{}` | Fallback to `{}` |
| Tool call extraction | `extractToolCallsFromContent()` | Inline `extractToolCallsFromContent()` |

Note: Fae imports `extractToolCallsFromContent` from `src/extract-tool-calls.js`.
Lal has the same function defined inline in `agent.js` (code duplication).

---

## Code Organization

| Aspect | Fae | Lal |
|--------|-----|-----|
| Entry point | `agent.js` (410 lines) | `agent.js` (1507 lines) |
| Tool definitions | `src/tool-makers.js` (833 lines) | Inline in `agent.js` (~525 lines of schemas) |
| Tool discovery | `src/tools.js` (90 lines) | None |
| Tool call parser | `src/extract-tool-calls.js` (66 lines) | Inline in `agent.js` (~45 lines) |
| Interface guard | `src/fae-tool-interface.js` (15 lines) | None (no tool interface) |
| Providers | Imported from `@endo/lal` | `providers/` directory (4 files) |
| Type definitions | JSDoc annotations | `agent.types.d.ts` (117 lines) |
| Tests | None | `test/` directory with Ava tests + simulator |
| Setup scripts | 4 scripts | 1 script |

Fae is more modular — tool definitions, discovery, and parsing are in separate
files. Lal is monolithic — everything lives in `agent.js`.

---

## Evolution Path

Fae was designed as the successor to Lal. Key improvements:

1. **Extracted tool interface** — `FaeTool` exo with `schema()`, `execute()`,
   `help()` replaces Lal's hardcoded switch dispatch.
2. **Dynamic tool discovery** — tools can be adopted at runtime instead of
   being fixed at compile time.
3. **Modular code organization** — tools, discovery, and parsing in separate
   files instead of one monolithic `agent.js`.
4. **Simplified system prompt** — shorter prompt that focuses on the dynamic
   capability model rather than exhaustive tool documentation.
5. **Shared tool call parser** — `extractToolCallsFromContent` moved to a
   reusable module.
6. **Provider reuse** — imports `@endo/lal/providers/index.js` instead of
   duplicating provider code.

What Fae dropped from Lal:

1. **Eval-proposal system** — no mediated code execution (trades safety for
   simplicity; security comes from capability restriction instead).
2. **Request/resolve/reject** — no capability request protocol (replaced by
   direct tool adoption from mail).
3. **Directory operations** — fewer petname ops (no `has`, `move`, `copy`,
   `makeDirectory`; uses `store` instead).
4. **Identity introspection** — no `identify()` or `inspectCapability()`.
5. **SmallCaps documentation** — simpler prompt assumes the LLM can handle
   standard JSON.
6. **TypeScript types** — JSDoc only (no `.d.ts` file).
7. **Test suite** — no tests yet.

---

## When to Use Which

**Fae** when:
- You want agents that can dynamically acquire new capabilities
- Tool caplets should be composable and transferable between agents
- You prefer modular, extensible architecture
- Direct tool execution (without HOST approval) is acceptable
- You need filesystem or shell access via capability-gated tools

**Lal** when:
- Human-in-the-loop approval is required for code execution
- You need the eval-proposal workflow (propose → review → grant)
- The fixed tool set is sufficient
- You want TypeScript type safety and test coverage
- You need richer directory and mail operations (move, copy, request/resolve)
