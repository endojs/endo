# Lal Architecture

Reference document covering the architecture, message flow, and agent loop of
`@endo/lal` — an LLM-powered agent plugin for the Endo daemon with Guest
capabilities. Lal runs as an unconfined caplet inside the Endo daemon, where
it processes messages using tool calls and can propose code evaluation to its
HOST for approval.

---

## High-Level Architecture

Lal follows an **event-driven, capability-oriented architecture** inside the
Endo daemon. All communication happens through the daemon's message-passing
(mail) system, with an additional eval-proposal mechanism for code execution.

```
┌───────────────────────────────────────────────────────┐
│                     Endo Daemon                       │
│                                                       │
│  ┌──────────┐     mail      ┌───────────────────┐    │
│  │   HOST   │◀─────────────▶│    Lal Agent      │    │
│  │ (human)  │               │  (guest caplet)   │    │
│  └─────┬────┘               └────────┬──────────┘    │
│        │                             │                │
│        │  eval-proposal              │                │
│        │  grant / reject             │                │
│        │  counter-proposal           │                │
│        ▼                    ┌────────▼──────────┐    │
│  ┌──────────┐               │   LLM Provider    │    │
│  │  Other   │               │ (Ollama/Anthropic/ │    │
│  │  Agents  │               │  llama.cpp)        │    │
│  └──────────┘               └───────────────────┘    │
└───────────────────────────────────────────────────────┘
```

### Core Principles

1. **Object-capability security.** Lal runs as a sandboxed guest with only the
   powers granted to it by the daemon. All interactions go through the
   `GuestPowers` API.
2. **Static tool set.** Tools are defined as hardcoded OpenAI-format schemas
   backed by a `switch` dispatch. No dynamic tool discovery.
3. **Eval-proposal workflow.** Code evaluation is mediated — Lal proposes code
   to its HOST, who can grant, reject, or counter-propose. Lal never executes
   code directly.
4. **SmallCaps encoding.** Tool arguments are decoded from SmallCaps format
   (Endo's extended JSON encoding for BigInt, undefined, etc.).
5. **Hardened JavaScript (SES).** All objects are hardened. The agent runs
   inside the Endo daemon's SES lockdown environment.

---

## Project Layout

```
packages/lal/
├── agent.js                # Agent caplet entry point (make function)
├── agent.types.d.ts        # TypeScript type definitions
├── setup.js                # Provision lal guest in the daemon
├── providers/
│   ├── index.js            # Provider factory (createProvider)
│   ├── anthropic.js        # Anthropic SDK provider
│   ├── llamacpp.js         # llama.cpp (OpenAI-compatible) provider
│   └── ollama.js           # Native Ollama SDK provider
├── test/
│   ├── index.test.js       # Unit tests
│   └── simulator/
│       ├── run-simulator.js    # Agent simulator harness
│       ├── mock-powers.js      # Mock GuestPowers for testing
│       └── README.md
├── SECURITY.md
├── CHANGELOG.md
└── NEWS.md
```

---

## The Agent Loop in Detail

Lal's agent loop lives in `agent.js`. It has a single operating mode: message
following inside the Endo daemon.

### Startup: `make(guestPowers, context, { env })`

The caplet entry point follows the Endo convention. On load:

1. Initialize the LLM provider (`createProvider(env)`)
2. Announce readiness to HOST
3. Identify SELF and start the message-following loop

```
make()
  │
  ├─ createProvider(env)              # LLM provider from env vars
  ├─ Initialize transcript with system prompt
  ├─ Initialize eval-proposal tracking (pendingProposals, notificationQueue)
  ├─ E(powers).send('HOST', [...])    # "Lal agent ready."
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
    ├─ Check message type:
    │   ├─ 'eval-proposal-reviewer' or 'eval-proposal-proposer'
    │   │   └─ Format as counter-proposal notification → transcript
    │   └─ Other (package, request)
    │       └─ Push "You have new mail" → transcript
    │
    └─ runAgenticLoop()
        └─ (see iteration loop below)
```

The message iterator uses `E(powers).followMessages()` which returns a
far-reference async iterator. `makeRefIterator()` wraps it for local
consumption.

Cancellation is handled by racing `messageIterator.next()` against a
`cancelled` promise from the context. When cancelled, the iterator is
cleanly returned.

### The Iteration Loop: `runAgenticLoop()`

This is the ReAct-style loop where the LLM alternates between reasoning
and tool use. Lal's version has additional complexity for eval-proposal
tracking.

```python
while continueLoop:
    # Inject pending proposal notifications
    processNotifications()

    response = await chat(transcript)

    # Extract embedded tool calls if model used XML format
    if no tool_calls but has content:
        extracted = extractToolCallsFromContent(content)
        if extracted.toolCalls.length > 0:
            responseMessage.tool_calls = extracted.toolCalls

    transcript.push(responseMessage)

    if toolCalls.length > 0:
        toolResults = await processToolCalls(toolCalls)
        transcript.push(...toolResults)

        # Continue if notifications arrived during tool execution
        if notificationQueue.length > 0:
            continue
    else:
        # No tool calls — but check for pending work
        if notificationQueue.length > 0:
            continue                    # Process notifications

        if pendingProposals.size > 0:
            await Promise.race(...)     # Wait for any proposal to settle
            continue                    # Process the notification

        continueLoop = false            # Really done
```

Key behaviors:

- **Tool call extraction.** Some models embed tool calls as
  `<tool_call>JSON</tool_call>` in content. `extractToolCallsFromContent()`
  parses these and strips `<think>…</think>` blocks.
- **Proposal waiting.** When the LLM has no more tool calls but proposals are
  pending, the loop blocks on `Promise.race()` until at least one proposal
  settles, then continues to process the notification.
- **Notification injection.** Before each LLM call, pending proposal
  notifications (granted/rejected) are formatted as user messages and pushed
  onto the transcript.
- **No max-iteration guard.** The loop relies on the LLM to stop calling tools
  (no hard cap on iterations).

---

## Tool System

### Tool Definitions

Lal defines all tools as a static array of OpenAI-format schemas at the module
level. There is no dynamic tool discovery — the tool set is fixed at load time.

```javascript
const tools = [
  { type: 'function', function: { name: 'help', ... } },
  { type: 'function', function: { name: 'has', ... } },
  // ... 16 tool definitions total
];
```

### Tool Dispatch: `executeTool()`

A single `switch` statement dispatches tool calls to `E(powers)` methods:

```javascript
const executeTool = async (name, args) => {
  switch (name) {
    case 'help':     return E(powers).help(args.methodName);
    case 'list':     return E(powers).list(...args.petNamePath);
    case 'lookup':   return E(powers).lookup(args.petNameOrPath);
    case 'evaluate': /* proposal tracking logic */
    // ...
    default: throw new Error(`Unknown tool: ${name}`);
  }
};
```

### Available Tools

| Category | Tool | Description |
|----------|------|-------------|
| **Self-documentation** | `help` | Get documentation for guest capabilities |
| **Directory** | `has` | Check if a petname exists |
| | `list` | List petnames in directory or subdirectory |
| | `lookup` | Resolve a petname to its value |
| | `remove` | Remove a petname |
| | `move` | Rename/move a reference |
| | `copy` | Copy a reference to a new name |
| | `makeDirectory` | Create a subdirectory |
| **Mail** | `listMessages` | List inbox messages |
| | `send` | Send a package message with capabilities |
| | `adopt` | Adopt a value from a message |
| | `dismiss` | Remove a message from inbox |
| | `request` | Request a capability from another agent |
| | `resolve` | Respond to a request with a value |
| | `reject` | Decline a request |
| **Identity** | `identify` | Get the formula ID for a petname |
| **Inspection** | `inspectCapability` | Call `help()` on a capability |
| **Evaluation** | `evaluate` | Propose code to HOST for approval |

### SmallCaps Decoding

Tool arguments are decoded from SmallCaps format before execution:

```javascript
const decodeSmallcaps = jsonString =>
  unserialize({ body: `#${jsonString}`, slots: [] });
```

This handles Endo-specific types:

| Type | SmallCaps | JavaScript |
|------|-----------|------------|
| BigInt | `"+5"` | `5n` |
| undefined | `"#undefined"` | `undefined` |
| Infinity | `"#Infinity"` | `Infinity` |
| NaN | `"#NaN"` | `NaN` |

---

## Eval-Proposal System

Lal's most distinctive feature is the eval-proposal workflow — a mediated
code execution model where the HOST must approve all code before it runs.

### Proposal Flow

```
Lal                          HOST
 │                             │
 ├─ evaluate(source, ...)      │
 │   └─ E(powers).evaluate()  │
 │      ──────────────────────▶│
 │                             ├─ Review code
 │                             │
 │   ┌─── GRANT ──────────────┤  Code executes, result returned
 │   │                         │
 │   ├─── REJECT ─────────────┤  Error returned
 │   │                         │
 │   └─── COUNTER-PROPOSAL ───┤  Modified code sent back
 │                             │
 ├─ Notification injected      │
 │   into transcript           │
 └─ LLM decides next action   │
```

### Proposal Tracking

```javascript
const pendingProposals = new Map();   // proposalId → PendingProposal
const notificationQueue = [];         // ProposalNotification[]
```

When `evaluate` is called:
1. `E(powers).evaluate()` sends the proposal to HOST
2. A `PendingProposal` is stored with the returned promise
3. The promise's `.then()` handler pushes a notification when it settles
4. The tool returns immediately with `{ status: 'pending', proposalId }`
5. The iteration loop detects the pending proposal and waits

### Notification Format

Granted:
```
"Your eval-proposal #1 was GRANTED by the HOST.
Source: E(counter).increment()
Result: 42
The code was executed successfully..."
```

Rejected:
```
"Your eval-proposal #1 was REJECTED by the HOST.
Source: E(counter).increment()
Reason: Counter does not exist
The HOST declined to execute your proposed code..."
```

### Counter-Proposals

When the HOST sends a counter-proposal (an `eval-proposal-reviewer` message),
it appears as a special message type in the inbox. The message-following loop
formats it with the modified code and instructions for the LLM to review.

---

## Context Building

Lal uses a large, static system prompt defined inline in `agent.js`:

```
┌──────────────────────────────────────┐
│ 1. Identity & Environment            │  "You are an Endo agent with
│                                      │  Guest capabilities."
├──────────────────────────────────────┤
│ 2. SmallCaps Encoding Guide          │  BigInt "+N", undefined "#undefined"
├──────────────────────────────────────┤
│ 3. Role & Message Protocol           │  listMessages → process → reply
│                                      │  → dismiss workflow
├──────────────────────────────────────┤
│ 4. Tool Reference                    │  All 16 tools with usage notes
├──────────────────────────────────────┤
│ 5. Code Evaluation Guide             │  Proposal workflow, globals
│                                      │  (E, M, makeExo), examples
├──────────────────────────────────────┤
│ 6. Proposal Response Protocol        │  GRANTED → lookup + send
│                                      │  REJECTED → explain + ask
│                                      │  COUNTER → review + decide
├──────────────────────────────────────┤
│ 7. Message Format for send()         │  Interleaved strings + edge names
├──────────────────────────────────────┤
│ 8. Quasi-Markdown Formatting         │  *bold*, /italic/, _underline_
├──────────────────────────────────────┤
│ 9. Special Petnames                  │  SELF, HOST, AGENT
├──────────────────────────────────────┤
│ 10. Response Protocol                │  Tool-calls only, no prose
├──────────────────────────────────────┤
│ 11. Error Handling Guide             │  Retry, inform sender, dismiss
└──────────────────────────────────────┘
```

There is no dynamic context building — no workspace files, no memory
consolidation, no skills system. The system prompt is a single hardcoded
string. The transcript accumulates all messages for the agent's lifetime.

The message array sent to the LLM:

```
[ system_prompt, ...all_previous_messages ]
```

A key difference from Fae: Lal's system prompt instructs the LLM to respond
**only with tool calls** — no prose text responses. All communication goes
through the `send()` tool.

---

## Message Bus / Communication

Lal communicates exclusively through the Endo daemon's mail system. There is
no separate message bus abstraction.

### Inbound Messages

```javascript
const messageIterator = makeRefIterator(E(powers).followMessages());
```

Messages arrive as `InboxMessage` (alias for `StampedMessage`) objects with:

| Field | Description |
|-------|-------------|
| `from` | Formula ID of the sender |
| `number` | Message sequence number (BigInt) |
| `type` | `"package"`, `"request"`, `"eval-proposal-reviewer"`, etc. |
| `strings` | Text parts (for package messages) |
| `names` | Edge names for attached capabilities |

### Outbound Messages

```javascript
await E(powers).send(recipientName, strings, edgeNames, petNames);
```

Messages are sent as packages with interleaved text and capability references.

### Requests

```javascript
await E(powers).request(recipientName, description, responseName);
```

Requests are a special message type where Lal asks another agent for a
capability. The recipient can `resolve` or `reject` the request.

---

## Session Management

Lal has no persistent session management. The transcript is an in-memory
array that grows indefinitely:

```javascript
const transcript = [{ role: 'system', content: systemPrompt }];
```

- Messages are appended but never truncated.
- No JSONL persistence.
- No memory consolidation.
- Transcript is lost when the daemon process restarts.
- Optional `LAL_MAX_MESSAGES` truncation at the provider level (llama.cpp
  only) to avoid context-size errors.

---

## Provider System

Lal defines its own provider system in `providers/`, which is also reused by
Fae via `@endo/lal/providers/index.js`.

### Provider Selection

Based on the `LAL_HOST` environment variable:

| Host URL pattern | Provider | SDK | Default model |
|------------------|----------|-----|---------------|
| Contains `anthropic.com` | `makeAnthropicProvider` | `@anthropic-ai/sdk` | `claude-opus-4-5-20251101` |
| Contains `/v1` | `makeLlamaCppProvider` | `openai` | `qwen3` |
| Other | `makeOllamaProvider` | `ollama` | `qwen3` |

### Provider Interface

```javascript
provider.chat(messages, tools) → { message }
```

Returns a single `message` object with `role`, `content`, and optional
`tool_calls`. Each provider normalizes its SDK's response format to this
common structure.

### Provider Implementations

**Anthropic** (`anthropic.js`):
- Converts tools to Anthropic's `input_schema` format
- Splits system prompt from messages (Anthropic API requires separate `system`)
- Maps tool results to `tool_result` content blocks
- Detects and re-throws authentication errors with clear messages

**llama.cpp** (`llamacpp.js`):
- Uses the OpenAI SDK pointed at a custom `baseURL`
- Supports `LAL_MAX_MESSAGES` for transcript truncation
- Supports `LAL_MAX_TOKENS` for completion length

**Ollama** (`ollama.js`):
- Uses the native `ollama` npm package
- Converts messages and tools to Ollama's format
- Generates synthetic tool call IDs (`ollama_tool_${timestamp}_${index}`)

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `LAL_HOST` | API base URL | `http://localhost:11434` |
| `LAL_MODEL` | Model name | `qwen3` or `claude-opus-4-5-20251101` |
| `LAL_AUTH_TOKEN` | API key | (optional for local) |
| `LAL_MAX_TOKENS` | Max completion tokens (llama.cpp only) | `4096` |
| `LAL_MAX_MESSAGES` | Truncate to last N messages (llama.cpp only) | (none) |

---

## Provisioning

Lal is provisioned as a guest caplet inside the Endo daemon:

### Setup (`setup.js`)

```
E(agent).provideGuest('lal', { introducedNames: {}, agentName: 'profile-for-lal' })
    │
    ├─ E(guest).storeValue(config, 'lal-config')   # Persist config
    │
    └─ E(agent).makeUnconfined('MAIN', 'agent.js', {
         powersName: 'profile-for-lal',
         resultName: 'controller-for-lal',
         env: { LAL_HOST, LAL_AUTH_TOKEN, LAL_MODEL }
       })
```

Unlike Fae, Lal also persists its config into the guest's petname store
so it can be read on re-incarnation without needing `process.env`.

---

## Error Handling

- **Tool execution errors.** Caught in `processToolCalls()`, serialized as
  `{ error: message }` using `passableAsJustin()` and returned to the LLM
  as a tool result so it can reason about the failure.
- **LLM errors.** Caught in the message-following loop. If the sender has a
  valid petname (lowercase or uppercase alphanumeric), an error message is
  sent back via `E(powers).send()`. Otherwise logged to console.
- **Anthropic auth errors.** The Anthropic provider detects 401 responses and
  invalid API key errors, re-throwing with a clear message about
  `LAL_AUTH_TOKEN`.
- **SmallCaps decode errors.** If tool arguments fail to decode, an empty
  `{}` is used as fallback.
- **Proposal errors.** Rejected proposals push a notification with the error
  message. The LLM receives instructions to inform the original requester.

---

## Type System

Lal has a dedicated TypeScript type definition file (`agent.types.d.ts`) that
defines all the core types:

| Type | Description |
|------|-------------|
| `GuestPowers` | Alias for `EndoGuest` from `@endo/daemon` |
| `Tool` | OpenAI function-calling tool schema |
| `ToolCall` | Tool call from LLM response |
| `ChatMessage` | Message in the transcript |
| `ToolResult` | Tool execution result |
| `ToolCallArgs` | Union of all possible tool arguments |
| `PendingProposal` | Tracked in-flight eval-proposal |
| `ProposalNotification` | Granted/rejected notification |
| `LalEnv` | Environment variable configuration |
| `LalContext` | Cancellation support context |

---

## Data Flow Summary

A complete request lifecycle:

```
1. User sends "@lal Please increment the counter" via Endo chat UI
2. Endo daemon delivers mail to lal's inbox
3. messageIterator.next() yields the message
4. lal skips own messages (fromId !== selfId)
5. Message is "package" type → push "You have new mail" to transcript
6. runAgenticLoop():
   a. chat(transcript) → LLM calls listMessages()
   b. E(powers).listMessages() → [...messages]
   c. chat(transcript) → LLM calls evaluate(source: "E(counter).increment()",
      codeNames: ["counter"], edgeNames: ["my-counter"],
      resultName: "increment-result")
   d. E(powers).evaluate(...) → proposal sent to HOST
   e. Tool returns { status: 'pending', proposalId: 1 }
   f. chat(transcript) → LLM has no more tool calls
   g. Loop detects pendingProposals.size > 0
   h. await Promise.race([...pendingPromises])
      ... HOST reviews and grants the proposal ...
   i. Notification: { status: 'granted', result: 42 }
   j. processNotifications() → push user message to transcript
   k. chat(transcript) → LLM calls lookup("increment-result")
   l. chat(transcript) → LLM calls send("HOST", ["The counter is now 42"], [], [])
   m. chat(transcript) → LLM calls dismiss("+5")
   n. chat(transcript) → LLM returns no tool calls
   o. Loop exits
7. runAgent() waits for next message
```
