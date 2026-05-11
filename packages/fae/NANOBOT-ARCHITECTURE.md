# nanobot Architecture

Reference document covering the architecture, message flow, and agent loop of
[nanobot](https://github.com/HKUDS/nanobot) — a modular, multi-channel AI
assistant framework written in Python.

---

## High-Level Architecture

nanobot follows a **bus-oriented, decoupled architecture** where chat channels
never talk to the agent directly. Every component communicates through an async
message bus.

```
┌────────────┐
│  Channels  │  Telegram, WhatsApp, Discord, Slack, Feishu, CLI, …
└─────┬──────┘
      │ InboundMessage
      ▼
┌────────────┐
│ MessageBus │  Two async queues (inbound / outbound)
└─────┬──────┘
      │ consume_inbound()
      ▼
┌────────────┐        ┌────────────────┐
│ AgentLoop  │───────▶│ ContextBuilder │  System prompt + memory + skills
└─────┬──────┘        └────────────────┘
      │
      ▼
┌────────────┐        ┌──────────────┐
│LLMProvider │───────▶│ ToolRegistry │  read_file, exec, web_search, …
└─────┬──────┘        └──────────────┘
      │
      ▼
┌────────────┐
│  Session   │  JSONL-persisted conversation history
│  Manager   │
└────────────┘
```

### Core Principles

1. **Channel-agnostic core.** The agent loop processes generic
   `InboundMessage` / `OutboundMessage` dataclasses — it never imports
   Telegram, Slack, or any other channel SDK.
2. **Pluggable LLM providers.** A single `LLMProvider` ABC is implemented by
   `LiteLLMProvider` (routes to 15+ backends), `OpenAICodexProvider` (OAuth),
   and `CustomProvider` (raw OpenAI-compatible endpoints).
3. **Dynamic tool system.** Tools register at startup and expose an
   OpenAI-compatible JSON Schema. The agent loop dispatches tool calls by name.
4. **Two-layer memory.** `MEMORY.md` holds long-term facts; `HISTORY.md` is a
   grep-searchable event log. Both are updated by an LLM-driven consolidation
   step.

---

## Project Layout

```
nanobot/
├── __main__.py              # python -m nanobot entry
├── cli/
│   └── commands.py          # Typer CLI: agent, gateway, onboard, cron, …
├── agent/
│   ├── loop.py              # AgentLoop — the heart of the system
│   ├── context.py           # ContextBuilder — system prompt assembly
│   ├── memory.py            # MemoryStore — MEMORY.md / HISTORY.md
│   ├── skills.py            # SkillsLoader — markdown skill files
│   ├── subagent.py          # SubagentManager — background task agents
│   └── tools/
│       ├── base.py          # Tool ABC + JSON Schema validation
│       ├── registry.py      # ToolRegistry — register / lookup / execute
│       ├── filesystem.py    # read_file, write_file, edit_file, list_dir
│       ├── shell.py         # exec (shell command execution)
│       ├── web.py           # web_search (Brave API), web_fetch
│       ├── message.py       # message (send to chat channels)
│       ├── spawn.py         # spawn (launch subagents)
│       ├── cron.py          # cron (schedule tasks)
│       └── mcp.py           # MCP server tool bridge
├── bus/
│   ├── events.py            # InboundMessage / OutboundMessage dataclasses
│   └── queue.py             # MessageBus (two asyncio.Queues + dispatch)
├── channels/
│   ├── manager.py           # ChannelManager — start/stop all channels
│   ├── telegram.py          # Telegram bot integration
│   ├── discord.py           # Discord gateway
│   ├── slack.py             # Slack Socket Mode
│   ├── whatsapp.py          # WhatsApp via bridge WebSocket
│   ├── feishu.py            # Feishu/Lark
│   └── …                    # DingTalk, Email, QQ, Mochat
├── providers/
│   ├── base.py              # LLMProvider ABC, LLMResponse, ToolCallRequest
│   ├── registry.py          # ProviderSpec registry (15+ providers)
│   ├── litellm_provider.py  # LiteLLM-backed provider (main path)
│   ├── openai_codex_provider.py
│   └── custom_provider.py   # Direct OpenAI-compatible endpoint
├── session/
│   └── manager.py           # SessionManager + Session (JSONL persistence)
├── config/
│   ├── schema.py            # Pydantic models (Config, AgentDefaults, …)
│   └── loader.py            # load_config() / save_config()
├── cron/
│   ├── service.py           # CronService — scheduling engine
│   └── types.py             # CronJob, CronSchedule dataclasses
├── heartbeat/
│   └── service.py           # HeartbeatService — periodic wake-ups
├── skills/                  # Built-in skills (GitHub, weather, tmux, …)
│   └── <name>/SKILL.md
└── bridge/                  # TypeScript WhatsApp bridge (Node.js)
```

---

## The Agent Loop in Detail

`AgentLoop` in `agent/loop.py` is the central processing engine. It has two
operating modes:

| Mode | Entry point | Use case |
|------|-------------|----------|
| **Bus mode** | `run()` | Gateway server — blocks on `bus.consume_inbound()` in a loop |
| **Direct mode** | `process_direct()` | CLI single-message or cron jobs — skips the bus |

Both modes converge on the same internal method: `_process_message()`.

### Bus Mode: `run()`

```
while self._running:
    msg = await bus.consume_inbound()     # block with 1s timeout
    response = await self._process_message(msg)
    if response:
        await bus.publish_outbound(response)
```

The 1-second timeout on `consume_inbound()` lets the loop check `_running` and
shut down cleanly when `stop()` is called.

On error, an `OutboundMessage` with the error text is published back to the
originating channel — the user sees "Sorry, I encountered an error: …" instead
of silence.

### Direct Mode: `process_direct()`

```python
async def process_direct(self, content, session_key="cli:direct", ...):
    msg = InboundMessage(channel=channel, sender_id="user", ...)
    response = await self._process_message(msg, session_key=session_key)
    return response.content
```

Wraps the input string in an `InboundMessage` and calls `_process_message()`
directly — no bus involved.

---

## Message Processing: `_process_message()`

This is the full pipeline for handling one user message.

```
┌─────────────────────────────────────────────────────┐
│ 1. Route system messages                            │
│    msg.channel == "system" → _process_system_message│
├─────────────────────────────────────────────────────┤
│ 2. Session lookup                                   │
│    key = "channel:chat_id"                          │
│    session = sessions.get_or_create(key)            │
├─────────────────────────────────────────────────────┤
│ 3. Slash commands                                   │
│    /new  → clear session + async consolidation      │
│    /help → return help text                         │
├─────────────────────────────────────────────────────┤
│ 4. Memory window check                              │
│    len(session.messages) > memory_window             │
│    → asyncio.create_task(_consolidate_memory)       │
├─────────────────────────────────────────────────────┤
│ 5. Set tool routing context                         │
│    message tool, spawn tool, cron tool all need     │
│    the current channel + chat_id                    │
├─────────────────────────────────────────────────────┤
│ 6. Build messages                                   │
│    context.build_messages(                          │
│        history, current_message, media,             │
│        channel, chat_id                             │
│    )                                                │
├─────────────────────────────────────────────────────┤
│ 7. Run agent loop                                   │
│    _run_agent_loop(messages, on_progress)           │
│    → (final_content, tools_used)                    │
├─────────────────────────────────────────────────────┤
│ 8. Persist to session                               │
│    session.add_message("user", msg.content)         │
│    session.add_message("assistant", final_content)  │
│    sessions.save(session)                           │
├─────────────────────────────────────────────────────┤
│ 9. Return OutboundMessage                           │
└─────────────────────────────────────────────────────┘
```

### The Iteration Loop: `_run_agent_loop()`

This is the ReAct-style loop where the LLM alternates between reasoning and
tool use.

```python
while iteration < max_iterations:     # default: 20
    response = await provider.chat(
        messages=messages,
        tools=tools.get_definitions(),
        model=self.model,
        temperature=self.temperature,
        max_tokens=self.max_tokens,
    )

    if response.has_tool_calls:
        # Stream progress to user (thinking text or tool hint)
        if on_progress:
            await on_progress(clean_content or tool_hint)

        # Append assistant message with tool_calls
        messages = context.add_assistant_message(
            messages, response.content, tool_call_dicts,
            reasoning_content=response.reasoning_content,
        )

        # Execute each tool call sequentially
        for tool_call in response.tool_calls:
            result = await tools.execute(tool_call.name, tool_call.arguments)
            messages = context.add_tool_result(
                messages, tool_call.id, tool_call.name, result
            )
    else:
        # No tool calls → LLM is done, extract final answer
        final_content = strip_think(response.content)
        break
```

Key behaviors:

- **Progress callbacks** — intermediate thinking or tool invocations are pushed
  to the user in real time via `on_progress`. In bus mode this publishes an
  `OutboundMessage`; in CLI mode it prints a dimmed line.
- **Think-tag stripping** — some models (DeepSeek-R1, Kimi) embed
  `<think>…</think>` blocks in content. These are stripped from the final
  response.
- **Reasoning content passthrough** — models that produce structured reasoning
  (via `reasoning_content` in the API response) have that content preserved in
  the message history for cache efficiency.
- **Max iterations guard** — prevents infinite tool-call loops (defaults to 20).

---

## Context Building

`ContextBuilder` in `agent/context.py` assembles the system prompt from several
sources, separated by `---` dividers:

```
┌──────────────────────────────────────┐
│ 1. Core Identity                     │  "You are nanobot…" + timestamp,
│                                      │  runtime info, workspace path,
│                                      │  tool capabilities overview
├──────────────────────────────────────┤
│ 2. Bootstrap Files                   │  AGENTS.md, SOUL.md, USER.md,
│                                      │  TOOLS.md, IDENTITY.md
│                                      │  (loaded from workspace root)
├──────────────────────────────────────┤
│ 3. Memory Context                    │  Contents of memory/MEMORY.md
│                                      │  (long-term facts)
├──────────────────────────────────────┤
│ 4. Active Skills                     │  Full content of skills with
│                                      │  always=true in frontmatter
├──────────────────────────────────────┤
│ 5. Skills Summary                    │  XML listing of all available
│                                      │  skills (name + description +
│                                      │  path). Agent reads full SKILL.md
│                                      │  on demand via read_file.
├──────────────────────────────────────┤
│ 6. Current Session                   │  "Channel: telegram"
│                                      │  "Chat ID: 12345"
└──────────────────────────────────────┘
```

The final message array sent to the LLM:

```
[ system_prompt, ...history, current_user_message ]
```

When the user message includes images (e.g. from WhatsApp), the content is
converted to a multi-part array with base64-encoded `image_url` blocks +
a `text` block — following the OpenAI vision API format.

---

## Tool System

### Tool Base Class

Every tool extends `Tool` (ABC) and defines three properties + one method:

| Property / Method | Purpose |
|---|---|
| `name` | Tool name used in function calls (`read_file`, `exec`, …) |
| `description` | Human-readable description for the LLM |
| `parameters` | JSON Schema dict for parameter validation |
| `execute(**kwargs)` | Async execution, returns a string result |

The base class also provides `validate_params()` which recursively validates
inputs against the JSON Schema before execution, and `to_schema()` which
serializes to OpenAI's function-calling format.

### Tool Registry

`ToolRegistry` is a simple `dict[str, Tool]` wrapper:

- `register(tool)` — adds a tool
- `get_definitions()` — returns all tools as OpenAI-format schemas
- `execute(name, params)` — validates params, calls `tool.execute()`, catches
  exceptions and returns error strings instead of raising

### Default Tools

Registered at `AgentLoop.__init__()`:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents (optionally restricted to workspace) |
| `write_file` | Create or overwrite files |
| `edit_file` | Surgical string replacement in files |
| `list_dir` | List directory contents |
| `exec` | Execute shell commands with timeout |
| `web_search` | Search the web via Brave Search API |
| `web_fetch` | Fetch and extract readable content from URLs |
| `message` | Send a message to a specific channel + chat_id |
| `spawn` | Launch a background subagent for long tasks |
| `cron` | Create / list / remove scheduled jobs |

### MCP Tool Bridge

If MCP servers are configured, `connect_mcp_servers()` connects to each one
(stdio or SSE transport), discovers its tools, and registers wrapper `Tool`
instances in the same `ToolRegistry`. This makes MCP tools indistinguishable
from native tools from the agent loop's perspective.

---

## Message Bus

`MessageBus` (`bus/queue.py`) is the decoupling layer between channels and the
agent.

```
Channels ──publish_inbound()──▶ [inbound Queue] ──consume_inbound()──▶ AgentLoop
AgentLoop ─publish_outbound()─▶ [outbound Queue] ─dispatch_outbound()─▶ Channels
```

- **Inbound queue:** any channel adapter pushes `InboundMessage` objects.
- **Outbound queue:** the agent (or tools like `message`) pushes
  `OutboundMessage` objects.
- **Dispatch loop:** `dispatch_outbound()` runs as a background task. It reads
  from the outbound queue and calls registered subscriber callbacks filtered by
  `msg.channel`. Each channel adapter subscribes for its own channel name.

### Event Types

```python
@dataclass
class InboundMessage:
    channel: str        # "telegram", "whatsapp", "cli", "system"
    sender_id: str      # user identifier
    chat_id: str        # chat/group identifier
    content: str        # message text
    timestamp: datetime
    media: list[str]    # local file paths for images
    metadata: dict      # channel-specific data (e.g. Slack thread_ts)

    @property
    def session_key(self) -> str:
        return f"{self.channel}:{self.chat_id}"


@dataclass
class OutboundMessage:
    channel: str
    chat_id: str
    content: str
    reply_to: str | None
    media: list[str]
    metadata: dict
```

---

## Session Management

`SessionManager` (`session/manager.py`) persists conversation history as JSONL
files under `<workspace>/sessions/`.

- **Session key:** `"channel:chat_id"` (e.g. `"telegram:12345"`)
- **File format:** first line is a metadata JSON object (`_type: "metadata"`,
  `created_at`, `last_consolidated`), remaining lines are message objects
  (`role`, `content`, `timestamp`, optional `tools_used`).
- **Cache:** sessions are cached in-memory after first load to avoid repeated
  disk reads.
- **History retrieval:** `session.get_history(max_messages)` returns the most
  recent N messages in LLM-compatible format, preserving `tool_calls` and
  `tool_call_id` fields for multi-turn tool conversations.
- **Append-only design:** messages are only appended, never deleted from the
  session file. Memory consolidation writes summaries to separate files
  (`MEMORY.md`, `HISTORY.md`) without modifying the message list.

---

## Memory Consolidation

When a session exceeds the `memory_window` (default 50 messages), the agent
loop spawns an async consolidation task.

```
Session messages > memory_window
    │
    ▼
_consolidate_memory()
    │
    ├─ Format old messages as timestamped conversation text
    ├─ Read current MEMORY.md
    ├─ Send to LLM with consolidation prompt
    │      "Return JSON with history_entry and memory_update"
    ├─ Parse JSON response
    ├─ Append history_entry to HISTORY.md
    └─ Overwrite MEMORY.md with memory_update (if changed)
```

The `/new` slash command triggers a full archive: all messages are consolidated
and the session is cleared. Consolidation runs as a background `asyncio.Task`
to avoid blocking the response.

---

## Subagent System

The `spawn` tool lets the main agent delegate long-running tasks to background
subagents.

```
Main Agent ──spawn("research X")──▶ SubagentManager
                                          │
                                    asyncio.create_task()
                                          │
                                          ▼
                                    _run_subagent()
                                    ┌─ Own ToolRegistry (no message, no spawn)
                                    ├─ Focused system prompt
                                    ├─ Own iteration loop (max 15)
                                    └─ On completion:
                                       Inject InboundMessage(channel="system")
                                       into the bus
                                          │
                                          ▼
                                    Main agent processes result
                                    via _process_system_message()
                                    and sends to user
```

Subagents are isolated: they have their own `ToolRegistry` (filesystem, shell,
web — but no `message` or `spawn` tools) and a task-focused system prompt. They
cannot see the main agent's conversation history.

Results are announced by publishing a `system` channel `InboundMessage` to the
bus. The main agent picks it up via `_process_system_message()`, which
re-routes the result to the original channel and chat.

---

## Provider System

### Provider Registry

`providers/registry.py` defines a `ProviderSpec` dataclass for each supported
LLM backend. The registry is a tuple of specs ordered by match priority:

1. **Custom** — direct OpenAI-compatible endpoint, bypasses LiteLLM
2. **Gateways** — OpenRouter, AiHubMix, SiliconFlow (route any model,
   detected by API key prefix or base URL keyword)
3. **Standard providers** — Anthropic, OpenAI, DeepSeek, Gemini, Zhipu,
   DashScope, Moonshot, MiniMax (matched by model name keywords)
4. **Local** — vLLM (OpenAI-compatible local server)
5. **OAuth** — OpenAI Codex, GitHub Copilot (device flow authentication)
6. **Auxiliary** — Groq (mainly for Whisper transcription)

Each spec declares: LiteLLM prefix rules, environment variable mapping,
skip-prefix logic, per-model parameter overrides, and gateway detection hints.

### Provider Resolution

```
User configures model = "claude-sonnet-4-20250514"
    │
    ▼
find_by_model("claude-sonnet-4-20250514")
    │ keyword "claude" matches
    ▼
ProviderSpec(name="anthropic")
    │
    ▼
LiteLLMProvider(api_key=..., provider_name="anthropic")
    │ no litellm_prefix for Anthropic → model passed as-is
    ▼
litellm.acompletion(model="claude-sonnet-4-20250514", ...)
```

Gateway detection takes precedence when a gateway API key or base URL is
configured — this allows routing `claude-*` models through OpenRouter instead
of direct Anthropic.

### LLM Provider Interface

```python
class LLMProvider(ABC):
    async def chat(
        messages: list[dict],
        tools: list[dict] | None,
        model: str,
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse

@dataclass
class LLMResponse:
    content: str | None
    tool_calls: list[ToolCallRequest]
    finish_reason: str
    usage: dict[str, int]
    reasoning_content: str | None   # thinking models
```

---

## Skills System

Skills are markdown files (`SKILL.md`) with optional YAML frontmatter, stored
in `<workspace>/skills/<name>/` or `nanobot/skills/<name>/` (built-in).

### Progressive Loading

To keep the system prompt compact, skills use a two-tier loading strategy:

1. **Always-active skills** (frontmatter `always: true`): full content included
   in every system prompt.
2. **Available skills**: only name + description + file path appear in the
   system prompt as an XML summary. The agent reads the full `SKILL.md` via the
   `read_file` tool when it decides a skill is relevant.

### Frontmatter

```yaml
---
description: "Search GitHub issues and PRs"
metadata: '{"nanobot": {"requires": {"bins": ["gh"], "env": ["GITHUB_TOKEN"]}}}'
always: false
---
```

The `requires` field declares CLI binaries and environment variables that must
be present. Skills with unmet requirements are shown as `available="false"` in
the summary.

---

## Gateway Server

The `nanobot gateway` command starts a long-running server that wires everything
together:

```
┌──────────┐     ┌──────────┐     ┌───────────┐
│ Channels │     │   Cron   │     │ Heartbeat │
│ Manager  │     │ Service  │     │  Service  │
└────┬─────┘     └────┬─────┘     └─────┬─────┘
     │                │                  │
     ▼                ▼                  ▼
┌─────────────────────────────────────────────┐
│              MessageBus                     │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
           ┌────────────┐
           │ AgentLoop  │
           └────────────┘
```

`asyncio.gather()` runs the agent loop and all channel adapters concurrently.
The cron service and heartbeat service run their own background tasks that feed
messages through `process_direct()`.

---

## CLI Interaction

The `nanobot agent` command supports two modes:

### Single-message mode

```bash
nanobot agent -m "What time is it?"
```

Creates an `AgentLoop`, calls `process_direct()` once, prints the response
with optional Markdown rendering via Rich, and exits.

### Interactive mode

```bash
nanobot agent
```

Enters a REPL powered by `prompt_toolkit` with:

- Persistent file history (`~/.nanobot/history/cli_history`)
- Bracketed paste support
- Spinner animation while the agent is thinking
- Progress callbacks showing tool usage in real time
- Clean terminal state restoration on exit

---

## Configuration

Configuration lives at `~/.nanobot/config.json`, modeled as nested Pydantic
`BaseModel` classes with camelCase JSON aliases.

```
Config
├── agents.defaults
│   ├── model              # e.g. "claude-sonnet-4-20250514"
│   ├── temperature        # default 0.7
│   ├── max_tokens         # default 4096
│   ├── max_tool_iterations # default 20
│   └── memory_window      # default 50
├── providers
│   ├── openrouter.api_key
│   ├── anthropic.api_key
│   ├── openai.api_key
│   ├── custom.{api_key, api_base}
│   └── …
├── channels
│   ├── telegram.{enabled, token}
│   ├── whatsapp.{enabled, bridge_url}
│   ├── discord.{enabled, gateway_url}
│   └── …
├── tools
│   ├── web.search.api_key    # Brave Search
│   ├── exec.timeout          # shell command timeout
│   ├── restrict_to_workspace # sandbox file/exec tools
│   └── mcp_servers           # MCP server configs
└── gateway
    ├── host
    └── port                  # default 18790
```

Environment variable override: prefix `NANOBOT_`, nested with `__`
(e.g. `NANOBOT_AGENTS__DEFAULTS__MODEL`).

---

## Workspace Layout

The workspace (default `~/.nanobot/workspace/`) is the agent's persistent
working directory:

```
workspace/
├── AGENTS.md         # Agent behavior instructions
├── SOUL.md           # Personality definition
├── USER.md           # User information & preferences
├── TOOLS.md          # Tool-specific documentation
├── IDENTITY.md       # Identity customization
├── memory/
│   ├── MEMORY.md     # Long-term facts (LLM-maintained)
│   └── HISTORY.md    # Timestamped event log (grep-searchable)
├── sessions/
│   └── *.jsonl       # Per-session conversation history
└── skills/
    └── <name>/
        └── SKILL.md  # Custom user skills
```

---

## Error Handling

- **Agent loop errors:** caught in `run()`, an error `OutboundMessage` is sent
  to the originating channel so the user gets feedback.
- **Tool execution errors:** caught inside `ToolRegistry.execute()`, returned
  as `"Error: …"` strings so the LLM can reason about the failure and retry.
- **Memory consolidation errors:** caught and logged, never surface to the user
  — consolidation is best-effort.
- **MCP cleanup:** `close_mcp()` catches `RuntimeError` and
  `BaseExceptionGroup` from the MCP SDK's cancel scope cleanup.
- **Terminal restoration:** the CLI saves and restores `termios` attributes to
  ensure the terminal isn't left in raw mode after a crash.

---

## Data Flow Summary

A complete request lifecycle through the gateway:

```
1. User sends "Hello" on Telegram
2. TelegramChannel receives update, wraps as InboundMessage
3. InboundMessage published to bus.inbound queue
4. AgentLoop.run() dequeues the message
5. _process_message():
   a. Session loaded/created for "telegram:12345"
   b. Memory window checked
   c. ContextBuilder assembles system prompt
      (identity + bootstrap files + memory + skills)
   d. build_messages() → [system, ...history, user:"Hello"]
6. _run_agent_loop():
   a. provider.chat() → LLMResponse(content="Hi! How can I help?")
   b. No tool calls → loop exits with final_content
7. Session updated with user + assistant messages, saved to JSONL
8. OutboundMessage(channel="telegram", content="Hi!…") published
9. bus.dispatch_outbound() routes to TelegramChannel subscriber
10. TelegramChannel sends reply via Telegram Bot API
```
