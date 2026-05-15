# EndoPi: Stdio JSONL RPC Bridge to a Daemon Agent

| | |
|---|---|
| **Created** | 2026-05-15 |
| **Updated** | 2026-05-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Parent** | [endopi](endopi.md) |

## Motivation

Embedding an agent in another process (an IDE plug-in, a CI runner, a
Familiar pane) needs a transport. Pi offers two: a Node-native SDK
(`createAgentSession`) and a language-agnostic RPC over stdio
(LF-delimited JSON, one record per line). The stdio path is essential
because not every consumer can host a Node child via the SDK; a Rust,
Python, or Go IDE plug-in spawning `pi --mode rpc` over stdio works
without language bridges.

Endo today has a WebSocket gateway. WebSocket is great for the Chat UI
(in-browser) and Familiar (Electron, which has a WebSocket client) but
wrong for a stdio-spawned child: the gateway requires a listening
socket, authentication, and clients capable of WebSocket handshakes.

The maintainer's `endor-bus-tui` direction eventually subsumes some of
this, but on a multi-quarter horizon. The short-term gap is real: a
stdio JSONL surface that gives an embedding host the same affordances
the WebSocket gateway gives the browser.

## Design

### Surface

```sh
endo agent rpc [--guest <name>] [--no-session]
```

Standard input takes commands as LF-delimited JSON; standard output
emits responses and events as LF-delimited JSON. Standard error carries
logs separate from the protocol.

### Framing (from Pi)

- Records separated by `\n` only. Do not split on `\r`, `U+2028`, or
  `U+2029` (Node `readline` is non-compliant; the embedding host must
  use a strict split).
- Each record is one JSON object with a `type` field.
- Optional `id` field on commands; the matching response echoes the
  `id`.

### Commands

```json
{"id": "1", "type": "prompt", "message": "Hello"}
{"type": "steer", "message": "Stop and do this instead"}
{"type": "abort"}
{"type": "list_models"}
{"type": "set_model", "provider": "anthropic", "model": "claude-sonnet-4-6"}
{"type": "get_status"}
```

### Events

```json
{"type": "message_start", "message": {...}}
{"type": "message_update", "delta": "...partial text..."}
{"type": "message_end", "message": {...}}
{"type": "tool_execution_start", "toolCallId": "...", "toolName": "edit", "args": {...}}
{"type": "tool_execution_end", "toolCallId": "...", "result": {...}}
{"type": "agent_end"}
```

The shape is Pi's RPC mode at the event level (see Pi's
`docs/rpc.md`); the underlying agent is Lal or Fae, and the events flow
through the Lal transcript model.

### Capability shape

The embedded agent has the same capability grants as a chat-side guest
of the same name. The host that spawns `endo agent rpc` chooses the
guest; the daemon's capability boundaries enforce what the agent can
do, independent of how it was invoked.

### Relationship to the WebSocket gateway

The stdio surface and the WebSocket gateway are two transports to the
same underlying daemon agent. A guest that has an open chat session in
the browser can also be reached over stdio; the two transports
interleave through the same transcript.

### Relationship to `endor-bus-tui`

The Rust `endor` daemon will, in time, host its own protocol over a
Unix-socket bus. That bus is the production-shape replacement for
stdio. The stdio bridge in this design is the short-term shape that
works on the Node daemon today; once `endor` has Bus-TUI parity, the
stdio bridge becomes a thin front-end for the bus.

## Phased implementation

1. **Protocol skeleton.** `endo agent rpc` accepts `prompt`, emits the
   message events. No tools, no streaming.
2. **Tool events.** Tool calls and results flow through.
3. **Steer + abort.** Mid-stream control.
4. **Model selection.** `set_model` switches the agent's provider/model
   mid-session.
5. **Multiplexing.** Multiple concurrent sessions over the same
   process (channel ID in each record).

## Dependencies

| Design | Relationship |
|--------|--------------|
| [daemon-web-gateway](daemon-web-gateway.md) | Sibling transport |
| [gateway-bearer-token-auth](gateway-bearer-token-auth.md) | Same auth surface (or none, when stdio is local) |
| [endor-bus-tui](endor-bus-tui.md) | Future replacement; shares vocabulary |
| [lal-reply-chain-transcripts](lal-reply-chain-transcripts.md) | The transcript shape the events flow through |

## Out of scope

- **MCP server compatibility.** Pi declines MCP; Endo declines too at
  the protocol level. A user who wants MCP can write an Endo guest
  plugin that translates.
- **Process-management features.** The host spawning `endo agent rpc`
  manages the child process; the Endo side does not implement parent
  management (no PTY, no resize, no bg).

## Open questions

- Should the stdio framing be Pi-byte-compatible so a host already
  speaking Pi RPC works against Endo with only a binary swap? Probably
  yes, with `endo:`-namespaced event types for Endo-only features
  (capability grants, formula references). This is the same posture
  taken in [endopi-jsonl-transcript-format](endopi-jsonl-transcript-format.md).
- Where does auth live? Stdio's local: by default, "you can spawn the
  process, so you are authorized". For network-tunneled stdio (an `ssh`
  invocation of `endo agent rpc` on a remote host), the daemon's
  existing bearer-token mechanism applies.

## Citation

- [`packages/coding-agent/docs/rpc.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md) (protocol)
- [`packages/coding-agent/src/modes/rpc/`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/src/modes/rpc) (implementation)

## Prompt

> Extracted from [endopi](endopi.md) § *Operating modes*. The short-
> term shape of "embed Endo in another process" before `endor` lands.
