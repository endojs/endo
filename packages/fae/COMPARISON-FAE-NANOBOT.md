# Fae vs nanobot — Architecture Comparison

A side-by-side comparison of `@endo/fae` (an Endo daemon LLM agent caplet)
and `nanobot` (a standalone multi-channel AI assistant framework).

---

## At a Glance

| Dimension | Fae | nanobot |
|-----------|-----|---------|
| Language | JavaScript (Hardened JS / SES) | Python 3.11+ |
| Runtime | Endo daemon (caplet) | Standalone process |
| Security model | Object-capability (ocap) | Filesystem sandboxing (optional) |
| Communication | Endo mail (capability passing) | Multi-channel message bus |
| LLM providers | 3 (Ollama, llama.cpp, Anthropic) | 15+ via LiteLLM |
| Tool system | Dynamic discovery + capability adoption | Static registry at startup + MCP bridge |
| Memory | None (in-memory transcript only) | Two-layer (MEMORY.md + HISTORY.md) with LLM consolidation |
| Session persistence | None | JSONL files per session |
| Subagents | None | Background subagent system |
| Scheduling | None | Cron service |
| User channels | Endo chat UI only | Telegram, WhatsApp, Discord, Slack, Feishu, CLI, … |

---

## Architecture Philosophy

### Fae — Capability-First

Fae is designed around the object-capability model. It runs inside a security
sandbox where it can only interact with things it has explicit references to.
New capabilities arrive via messages and must be explicitly adopted. The agent
has no ambient authority — no filesystem access, no network access, no shell
unless those are granted as tool caplets.

The architecture is minimal by design: a single `agent.js` file, a transcript
array, and a set of tools. There is no configuration system, no persistence
layer, no channel abstraction. The Endo daemon handles all of that.

### nanobot — Platform-First

nanobot is designed as a complete assistant platform. It manages its own
configuration, persistence, channels, scheduling, and memory. The agent loop
is one component in a larger system that includes a message bus, session
manager, channel adapters, cron service, and heartbeat service.

The architecture prioritizes operational completeness: you can deploy nanobot
as a gateway server that listens on multiple chat platforms simultaneously,
remembers conversations across restarts, and runs scheduled tasks.

---

## Agent Loop

Both implement a ReAct-style loop (reason → act → observe → repeat), but
the surrounding infrastructure differs significantly.

### Loop Structure

| Aspect | Fae | nanobot |
|--------|-----|---------|
| Trigger | Mail arrives via `followMessages()` iterator | Message dequeued from `asyncio.Queue` |
| Pre-processing | Discover tools (local + daemon) | Build context (system prompt + memory + skills + history) |
| LLM call | `provider.chat(transcript, schemas)` | `provider.chat(messages, tools, model, temp, max_tokens)` |
| Tool dispatch | `E(tool).execute(args)` via eventual send | `tools.execute(name, params)` via registry |
| Post-processing | Re-discover tools if `adoptTool` called | Save session, check memory window |
| Termination | LLM stops calling tools | LLM stops calling tools or max_iterations (20) reached |
| Progress feedback | None (no user-facing channel) | `on_progress` callback streams intermediate output |

### Transcript vs Context Building

**Fae** accumulates a single growing transcript array for the agent's entire
lifetime. Every message ever processed stays in the transcript. There is no
truncation, no summarization, no context window management.

**nanobot** rebuilds the message array from scratch for each request:
system prompt (dynamically assembled from 5+ bootstrap files, memory,
skills) + session history (windowed to last N messages) + current message.
Old messages are summarized by an LLM and written to MEMORY.md/HISTORY.md.

### Message Formatting

**Fae** receives Endo mail objects and formats them as:
```
"Message #5 from <formulaId>: <text content>"
```

**nanobot** receives `InboundMessage` dataclasses and passes the content
directly as a user message. Channel and chat_id are appended to the system
prompt for routing context.

---

## Tool System

### Tool Interface

| Aspect | Fae | nanobot |
|--------|-----|---------|
| Interface | `FaeTool` exo: `schema()`, `execute(args)`, `help()` | `Tool` ABC: `name`, `description`, `parameters`, `execute(**kwargs)` |
| Schema format | OpenAI function-calling JSON | OpenAI function-calling JSON |
| Registration | `localTools` Map + daemon `tools/` directory | `ToolRegistry` dict |
| Discovery | Dynamic per-turn (`discoverTools()`) | Static at startup (+ MCP at first use) |
| Invocation | `E(tool).execute(args)` (eventual send) | `await tool.execute(**params)` (direct call) |
| Validation | None (FaeTool exo guard validates interface shape) | JSON Schema validation before execution |
| Result format | Justin string (Endo serialization) | Plain string |

### Tool Capabilities

| Tool | Fae | nanobot |
|------|-----|---------|
| Read file | Via tool caplet (optional) | Built-in |
| Write file | Via tool caplet (optional) | Built-in |
| Edit file | Via tool caplet (optional) | Built-in |
| List directory | Via tool caplet (optional) | Built-in |
| Shell execution | Via tool caplet (optional) | Built-in |
| Web search | Not available | Built-in (Brave API) |
| Web fetch | Not available | Built-in |
| Send message | Built-in (`send`) | Built-in (`message`) |
| List messages | Built-in (`listMessages`) | Not applicable (channels push) |
| Dismiss message | Built-in (`dismiss`) | Not applicable |
| Petname directory | Built-in (`list`, `lookup`, `store`, `remove`) | Not applicable |
| Adopt capability | Built-in (`adoptTool`) | Not applicable |
| Spawn subagent | Not available | Built-in (`spawn`) |
| Scheduling | Not available | Built-in (`cron`) |
| Code evaluation | Not available (Lal has this) | Not available |
| MCP tools | Not available | Dynamic bridge |

### Dynamic Tools

**Fae's** most distinctive feature is runtime tool adoption. Tools are
capability objects that can be sent between agents via mail:

```
HOST sends @timestamp-tool to fae
  → fae calls adoptTool(messageNumber, 'timestamp-tool', 'timestamp')
  → Tool is placed in tools/ directory
  → discoverTools() picks it up on next turn
  → LLM can now call timestamp()
```

**nanobot** has no equivalent. Tools are registered at startup and don't
change during the process lifetime (except for MCP tools which are
discovered once on first use).

---

## Communication Model

### Fae — Endo Mail

```
Agent A ──send(strings, edgeNames, petNames)──▶ Agent B
                                                   │
                                             followMessages()
                                                   │
                                           adopt(edgeName, petName)
```

- Messages carry both text and capability references
- Recipients must explicitly adopt capabilities
- Messages persist in inbox until dismissed
- Communication is peer-to-peer (any agent to any agent)

### nanobot — Message Bus

```
Channel ──InboundMessage──▶ Bus ──▶ AgentLoop ──OutboundMessage──▶ Bus ──▶ Channel
```

- Messages carry text and optional media (images)
- No capability passing
- Messages are ephemeral (processed and discarded from bus)
- Communication is user↔agent (mediated by channels)

---

## Memory and Persistence

| Aspect | Fae | nanobot |
|--------|-----|---------|
| Conversation history | In-memory transcript (lost on restart) | JSONL files per session (survives restarts) |
| Long-term memory | None | `MEMORY.md` — LLM-maintained facts |
| Event log | None | `HISTORY.md` — grep-searchable timestamped log |
| Consolidation | None | Automatic when session exceeds memory_window |
| Context window management | None (transcript grows unbounded) | Windowed history + memory summarization |

---

## Provider System

**Fae** reuses `@endo/lal`'s provider system with 3 implementations:

| Provider | SDK |
|----------|-----|
| Ollama | `ollama` npm package |
| llama.cpp | `openai` npm package (OpenAI-compatible) |
| Anthropic | `@anthropic-ai/sdk` |

Selection is based on URL pattern matching in `LAL_HOST`.

**nanobot** uses LiteLLM with a provider registry of 15+ backends:

| Category | Providers |
|----------|-----------|
| Gateways | OpenRouter, AiHubMix, SiliconFlow |
| Standard | Anthropic, OpenAI, DeepSeek, Gemini, Zhipu, DashScope, Moonshot, MiniMax |
| Local | vLLM, Ollama (via LiteLLM) |
| OAuth | OpenAI Codex, GitHub Copilot |
| Auxiliary | Groq |

Selection uses a multi-step resolution: model name keywords → API key prefix
→ base URL matching → gateway fallback.

---

## Configuration

**Fae**: 3 environment variables (`LAL_HOST`, `LAL_MODEL`, `LAL_AUTH_TOKEN`),
passed via `endo run -E`. No config files.

**nanobot**: JSON config at `~/.nanobot/config.json` with Pydantic schema
validation. Nested structure for agents, providers, channels, tools, gateway.
Environment variable overrides with `NANOBOT_` prefix.

---

## Error Handling

| Scenario | Fae | nanobot |
|----------|-----|---------|
| Tool failure | Returns `{ error: message }` to LLM | Returns `"Error: message"` string to LLM |
| LLM failure | Sends error to sender if valid name | Publishes error `OutboundMessage` to bus |
| Unknown tool | Throws with available tool list | Returns `"Error: Tool not found"` |
| Fatal error | `console.error`, process continues | `logger.error`, error message sent to user |

---

## Unique to Each

### Fae Only

- **Capability adoption** — receive and install tool capabilities at runtime
- **Object-capability security** — no ambient authority, sandboxed guest
- **Hardened JS / SES** — all objects frozen, no prototype pollution
- **Petname directory** — persistent named references to capabilities
- **Eventual send** — `E(ref).method()` for all remote calls
- **Justin serialization** — Endo's human-readable encoding for tool results

### nanobot Only

- **Multi-channel support** — Telegram, WhatsApp, Discord, Slack, Feishu, etc.
- **Memory system** — two-layer (facts + history) with LLM consolidation
- **Session persistence** — JSONL files survive restarts
- **Subagent system** — background agents for parallel tasks
- **Cron scheduling** — periodic and one-time scheduled jobs
- **Heartbeat service** — periodic agent wake-ups
- **Skills system** — markdown-based progressive skill loading
- **MCP bridge** — connect to external tool servers
- **Interactive CLI** — REPL with history, paste support, spinner
- **Workspace bootstrap files** — AGENTS.md, SOUL.md, USER.md, etc.
- **Progress streaming** — intermediate tool output shown to user
- **Max iteration guard** — prevents infinite tool-call loops

---

## When to Use Which

**Fae** is the right choice when:
- You need capability-level security guarantees
- Tools should be dynamically composable and transferable between agents
- You're building within the Endo daemon ecosystem
- You want agents that can safely interact with each other via capability passing
- The agent will be one of many in a multi-agent Endo deployment

**nanobot** is the right choice when:
- You need a ready-to-deploy assistant on multiple chat platforms
- Conversation persistence and memory across sessions matter
- You want a wide selection of LLM providers
- You need scheduling, subagents, or background processing
- You're building a personal assistant with long-term memory
