# Fae Architecture

Reference document covering the architecture, message flow, and agent loop of
`@endo/fae` — an LLM agent caplet for the Endo daemon with dynamic tool
capabilities. Fae runs as an autonomous guest inside the Endo daemon, where
it processes messages and adopts tool capabilities at runtime.

---

## High-Level Architecture

Fae follows an **event-driven, capability-oriented architecture** inside the
Endo daemon. It has no direct channel integrations — all communication happens
through the daemon's message-passing (mail) system.

```
┌─────────────────────────────────────────────────┐
│                  Endo Daemon                    │
│                                                 │
│  ┌──────────┐    mail     ┌──────────────────┐  │
│  │   HOST   │◀──────────▶│     Fae Agent     │  │
│  │ (human)  │             │   (guest caplet) │  │
│  └──────────┘             └────────┬─────────┘  │
│       ▲                            │             │
│       │                   ┌────────▼─────────┐  │
│  ┌────┴─────┐             │   LLM Provider   │  │
│  │  Other   │             │ (Ollama/Anthropic)│  │
│  │  Agents  │             └──────────────────┘  │
│  └──────────┘                                   │
│       ▲                   ┌──────────────────┐  │
│       │      mail         │   Tool Caplets   │  │
│       └──────────────────▶│  (tools/ dir)    │  │
│                           └──────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Core Principles

1. **Object-capability security.** Fae runs as a sandboxed guest with only the
   powers granted to it by the daemon. It cannot access the filesystem or
   network directly — only through its petname directory and adopted tools.
2. **Dynamic tool discovery.** Tools are re-discovered at the start of every
   agent turn. New tools adopted via mail become available immediately.
3. **Capability passing via mail.** Fae receives tool capabilities as messages
   from other agents and adopts them into its `tools/` directory.
4. **Hardened JavaScript (SES).** All objects are hardened. The agent and its
   tools run inside the Endo daemon's SES lockdown environment.

---

## Project Layout

```
packages/fae/
├── agent.js                    # Caplet entry point (make function)
├── setup.js                    # Provision fae guest (no tools)
├── setup-tools.js              # Create example tools in host inventory
├── setup-fs-tools.js           # Create filesystem tools (FAE_CWD)
├── setup-with-tools.js         # Provision fae with pre-installed tools
├── src/
│   ├── extract-tool-calls.js   # XML <tool_call> parser for models
│   │                             that embed tool calls in content
│   ├── fae-tool-interface.js   # FaeTool M.interface() guard
│   ├── tool-makers.js          # Built-in tool factory functions
│   └── tools.js                # Tool discovery + execution
└── tools/
    ├── greet.js                # Example: greeting generator
    ├── math.js                 # Example: arithmetic
    ├── timestamp.js            # Example: current time
    ├── read-file.js            # FaeTool: read files under root
    ├── write-file.js           # FaeTool: write files under root
    ├── edit-file.js            # FaeTool: edit files under root
    ├── list-dir.js             # FaeTool: list directory under root
    └── run-command.js          # FaeTool: run shell commands in root
```

---

## The Agent Loop in Detail

Fae's agent loop lives in `agent.js`. It has a single operating mode: message
following inside the Endo daemon.

### Startup: `make(guestPowers, context, { env })`

The caplet entry point follows the Endo convention. On load:

1. Initialize the LLM provider (`createProvider(env)`)
2. Register built-in tools in a `localTools` Map
3. Move any introduced tool capabilities from top-level into `tools/`
4. Send "Fae agent ready." to HOST
5. Identify SELF and start the message-following loop

```
make()
  │
  ├─ createProvider(env)              # LLM provider from env vars
  ├─ Register 8 built-in tools       # list, lookup, store, remove,
  │                                   # adoptTool, send, listMessages, dismiss
  ├─ initializeIntroducedTools()      # Move pre-installed tools → tools/
  ├─ E(powers).send('HOST', [...])    # Announce readiness
  ├─ E(powers).identify('SELF')      # Get own formula ID
  └─ runAgent()                       # Enter message-following loop
```

### Message-Following Loop: `runAgent()`

```
while (true):
    message = await messageIterator.next()  # Block on next mail
    │
    ├─ Race against cancellation signal
    ├─ Skip own messages (fromId === selfId)
    │
    ├─ discoverTools(powers, localTools)    # Merge local + daemon tools
    │
    ├─ Parse message content
    │   └─ "package" type → join strings + @names
    │
    ├─ transcript.push({ role: 'user', content: ... })
    │
    └─ runAgenticLoop(toolSchemas, toolMap)
        └─ (see iteration loop below)
```

The message iterator uses `E(powers).followMessages()` which returns a
far-reference async iterator. `makeRefIterator()` wraps it for local
consumption. Messages are received as they arrive — no polling.

Cancellation is handled by racing `messageIterator.next()` against a
`cancelled` promise from the context. When cancelled, the iterator is
cleanly returned.

### The Iteration Loop: `runAgenticLoop()`

This is the ReAct-style loop where the LLM alternates between reasoning
and tool use.

```python
while continueLoop:
    response = await chat(transcript, currentSchemas)

    # Extract embedded tool calls if model used XML format
    if no tool_calls but has content:
        extracted = extractToolCallsFromContent(content)
        if extracted.toolCalls:
            rm.tool_calls = extracted.toolCalls

    transcript.push(responseMessage)

    if toolCalls.length > 0:
        toolResults = await processToolCalls(toolCalls, currentToolMap)
        transcript.push(...toolResults)

        # Re-discover tools if adoptTool was called
        if any tool call was 'adoptTool':
            refreshed = await discoverTools(powers, localTools)
            currentSchemas = refreshed.schemas
            currentToolMap = refreshed.toolMap
    else:
        continueLoop = false    # LLM is done
```

Key behaviors:

- **Tool call extraction.** Some models (especially local ones) embed tool
  calls as `<tool_call>JSON</tool_call>` in content rather than using the
  structured `tool_calls` field. `extractToolCallsFromContent()` parses these.
- **Think-tag stripping.** `<think>…</think>` blocks are stripped from
  extracted content.
- **Hot tool reload.** After any `adoptTool` call, tools are re-discovered
  so the newly adopted tool is available in the same turn.
- **No max-iteration guard.** The loop runs until the LLM stops calling tools
  (the outer `runAgent` has a `MAX_ITERATIONS = 30` constant defined but is
  not enforced in the iteration loop — it relies on the LLM to stop).

---

## Tool System

### FaeTool Interface

Every tool conforms to the `FaeTool` exo interface, guarded by
`M.interface()`:

```javascript
FaeToolInterface = M.interface('FaeTool', {
  schema:  M.call().returns(M.record()),
  execute: M.call(M.record()).returns(M.promise()),
  help:    M.call().returns(M.string()),
});
```

| Method | Purpose |
|--------|---------|
| `schema()` | Returns OpenAI-format tool schema (`{ type: 'function', function: { name, description, parameters } }`) |
| `execute(args)` | Async execution, returns a string result |
| `help()` | Human-readable description |

### Tool Discovery: `discoverTools()`

Called at the start of every agent turn:

```
discoverTools(powers, localTools)
  │
  ├─ Start with all localTools (built-in)
  │   └─ Collect their schemas
  │
  ├─ E(powers).list('tools')           # List daemon tools/ directory
  │   └─ For each name:
  │       ├─ E(powers).lookup(['tools', name])
  │       ├─ E(tool).schema()           # Validate it's a FaeTool
  │       └─ Add to toolMap + schemas (if not already present)
  │
  └─ Return { schemas, toolMap }
```

This merges local built-in tools with any daemon-side tools stored under the
`tools/` petname path. Local tools take priority if names collide.

### Tool Execution: `executeTool()`

```javascript
const result = await E(tool).execute(args);
```

Uses `E()` (eventual send) so that both local tools and daemon far-reference
tools are called uniformly. The result is serialized to a Justin string
(Endo's human-readable serialization) before being added to the transcript.

### Built-in Tools (registered in `localTools`)

| Tool | Source | Description |
|------|--------|-------------|
| `list` | `tool-makers.js` | List petnames in the Endo directory |
| `lookup` | `tool-makers.js` | Retrieve a value by petname |
| `store` | `tool-makers.js` | Persist a JSON value under a petname |
| `remove` | `tool-makers.js` | Delete a petname |
| `adoptTool` | `tool-makers.js` | Adopt a capability from mail into `tools/` |
| `send` | `tool-makers.js` | Send a message with optional capability attachments |
| `listMessages` | `tool-makers.js` | List inbox messages |
| `dismiss` | `tool-makers.js` | Acknowledge and remove a message |

### Daemon-Side Tool Caplets (`tools/*.js`)

Unsandboxed modules that produce `FaeTool` exo objects. Created via
`endo run --UNCONFINED` and stored in any agent's inventory:

| Tool | Description |
|------|-------------|
| `timestamp` | Current date/time with timezone support |
| `greet` | Greeting generator |
| `math` | Arithmetic operations |
| `readFile` | Read files under a fixed root directory |
| `writeFile` | Write files under a fixed root directory |
| `editFile` | String replacement editing |
| `listDir` | List directory contents |
| `runCommand` | Execute shell commands with timeout |

Filesystem tools have their root directory fixed at creation time via
`FAE_CWD`. Path traversal above the root is rejected.

---

## Context Building

Fae uses a simple, static system prompt defined inline in `agent.js`:

```
┌──────────────────────────────────────┐
│ 1. Identity                          │  "You are Fae, an autonomous LLM
│                                      │  agent running inside the Endo
│                                      │  daemon as a guest caplet."
├──────────────────────────────────────┤
│ 2. Communication tools overview      │  send, listMessages, dismiss,
│                                      │  adoptTool
├──────────────────────────────────────┤
│ 3. Petname directory overview        │  list, lookup, store, remove
├──────────────────────────────────────┤
│ 4. Tool adoption instructions        │  How to receive and adopt new
│                                      │  tools from mail
├──────────────────────────────────────┤
│ 5. Response guidelines               │  Use tools, don't fabricate,
│                                      │  dismiss after handling
└──────────────────────────────────────┘
```

There is no dynamic context building — no workspace files, no memory
consolidation, no skills system. The system prompt is a single hardcoded
string. The transcript accumulates all messages for the agent's lifetime.

The message array sent to the LLM:

```
[ system_prompt, ...all_previous_messages, current_user_message ]
```

---

## Message Bus / Communication

Fae communicates exclusively through the Endo daemon's mail system. There is
no separate message bus abstraction.

### Inbound Messages

```javascript
const messageIterator = makeRefIterator(E(powers).followMessages());
```

Messages arrive as `InboxMessage` objects with:

| Field | Description |
|-------|-------------|
| `from` | Formula ID of the sender |
| `number` | Message sequence number (BigInt) |
| `type` | `"package"` for normal messages |
| `strings` | Text parts of the message |
| `names` | Edge names for attached capabilities |

### Outbound Messages

```javascript
await E(powers).send(recipient, strings, edgeNames, petNames);
```

Messages are sent as packages with interleaved text and capability references.
The recipient sees `@edgeName` placeholders and can adopt the attached
capabilities.

### Message Format

```
Recipient sees: "Here is @counter for you"
                         ^^^^^^^^
                         edge name → adoptable capability
```

---

## Session Management

Fae has no persistent session management. The transcript is an in-memory
array that grows indefinitely:

```javascript
const transcript = [{ role: 'system', content: guestSystemPrompt }];
```

- Messages are appended but never truncated.
- No JSONL persistence.
- No memory consolidation.
- Transcript is lost when the daemon process restarts (though the daemon's
  own persistence may restore the caplet state).

---

## Provider System

Fae reuses `@endo/lal`'s provider system via
`import { createProvider } from '@endo/lal/providers/index.js'`.

### Provider Selection

Based on the `LAL_HOST` environment variable:

| Host URL pattern | Provider | Default model |
|------------------|----------|---------------|
| Contains `anthropic.com` | Anthropic SDK | `claude-opus-4-5-20251101` |
| Contains `/v1` | llama.cpp (OpenAI SDK) | `qwen3` |
| Other | Native Ollama SDK | `qwen3` |

### Provider Interface

```javascript
provider.chat(messages, toolSchemas) → { message }
```

Returns a single `message` object with `role`, `content`, and optional
`tool_calls`. All three providers (Anthropic, llama.cpp, Ollama) normalize
to this common format.

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `LAL_HOST` | API base URL | `http://localhost:11434/v1` |
| `LAL_MODEL` | Model name | `qwen3` or `claude-opus-4-5-20251101` |
| `LAL_AUTH_TOKEN` | API key | (optional for local) |

---

## Provisioning

Fae is provisioned as a guest caplet inside the Endo daemon:

### Without tools (`setup.js`)

```
E(agent).provideGuest('fae', { introducedNames: {}, agentName: 'profile-for-fae' })
    │
    └─ E(agent).makeUnconfined('MAIN', 'agent.js', {
         powersName: 'profile-for-fae',
         resultName: 'controller-for-fae',
         env: { LAL_HOST, LAL_AUTH_TOKEN, LAL_MODEL }
       })
```

### With tools (`setup-with-tools.js`)

Same as above but `introducedNames` includes references to pre-created tool
caplets. On startup, `initializeIntroducedTools()` detects them and moves
them into the `tools/` subdirectory.

---

## Error Handling

- **Tool execution errors.** Caught in `processToolCalls()`, serialized as
  `{ error: message }` and returned to the LLM as a tool result so it can
  reason about the failure.
- **LLM errors.** Caught in the message-following loop. If the sender has a
  valid petname, an error message is sent back. Otherwise logged to console.
- **Tool discovery errors.** Caught and logged as warnings — the agent
  continues with whatever tools it successfully discovered.
- **SmallCaps decode errors.** If tool arguments fail to decode, an empty
  `{}` is used as fallback.

---

## Data Flow Summary

A complete request lifecycle:

```
1. User sends "@fae What time is it?" via Endo chat UI
2. Endo daemon delivers mail to fae's inbox
3. messageIterator.next() yields the message
4. fae skips own messages (fromId !== selfId)
5. discoverTools() merges local tools + tools/ directory
   → finds "timestamp" tool
6. transcript.push({ role: 'user', content: 'Message #5 from HOST: What time is it?' })
7. runAgenticLoop():
   a. chat(transcript, toolSchemas) → LLM returns tool_call: timestamp({})
   b. transcript.push(assistantMessage)
   c. executeTool('timestamp', {}) → "2026-02-20T10:30:00.000Z"
   d. transcript.push({ role: 'tool', content: '...', tool_call_id: '...' })
   e. chat(transcript, toolSchemas) → LLM returns tool_call: send({recipient:'HOST', ...})
   f. E(powers).send('HOST', ['The current time is ...'], [], [])
   g. transcript.push(toolResult)
   h. chat(transcript, toolSchemas) → LLM returns tool_call: dismiss({messageNumber: 5})
   i. E(powers).dismiss(5n)
   j. chat(transcript, toolSchemas) → LLM returns content (no tool calls)
   k. Loop exits
8. runAgent() waits for next message
```
