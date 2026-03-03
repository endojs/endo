# EndoClaw: Feature Parity with OpenClaw

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Reference |

## Background

OpenClaw (formerly ClawdBot, formerly Moltbot) is a free and open-source
personal AI assistant created by Peter Steinberger. It runs locally,
uses messaging platforms (WhatsApp, Telegram, Discord, etc.) as its
primary interface, and provides the agent with system-level tools:
filesystem access, shell execution, browser automation, smart home
control, and more.

This document enumerates OpenClaw's features and integrations and maps
each to the Endo equivalent — whether it already exists, is designed, or
would require new work.

## Architecture Comparison

| Aspect | OpenClaw | Endo |
|--------|----------|------|
| **Runtime** | Node.js daemon, `~/.openclaw/workspace` | Node.js daemon, `$ENDO_STATE/state` |
| **Control plane** | WebSocket gateway (`ws://127.0.0.1:18789`) | WebSocket gateway (`ws://127.0.0.1:8920`) |
| **Agent model** | Multi-agent with isolated workspaces | Multi-agent with per-guest formula isolation |
| **Capability model** | Ambient authority (agent has full system access) | Object-capability (agent holds only granted capabilities) |
| **Persistence** | Workspace files (`AGENTS.md`, `SOUL.md`, `TOOLS.md`) | Formula store (typed formula graphs, durable) |
| **Extensibility** | Skills in `SKILL.md` files, ClawHub registry | Guest plugins (confined JS modules), pet-name directory |
| **Installation** | `npm i -g openclaw` | Familiar (Electron) or `npx corepack yarn` from source |
| **Security** | DM pairing, owner-only group commands | SES lockdown, unforgeable capabilities, interface guards |

The fundamental architectural difference is the capability model. OpenClaw
grants agents ambient authority — any tool the agent calls operates with
the user's full permissions. Endo's object-capability model means agents
hold only the specific `Dir`, `Shell`, `Git`, and other capabilities
explicitly granted to them. This is Endo's primary differentiator for
security.

## Feature-by-Feature Mapping

### Messaging Channels

OpenClaw's primary interface is messaging platforms. Users control the
agent by sending messages on WhatsApp, Telegram, etc.

| OpenClaw Channel | Endo Equivalent | Status |
|------------------|-----------------|--------|
| WhatsApp | — | Not planned. Endo uses its own messaging. |
| Telegram | — | Not planned |
| Discord | — | Not planned |
| Slack | — | Not planned |
| Signal | — | Not planned |
| iMessage / BlueBubbles | — | Not planned |
| IRC | — | Not planned |
| Microsoft Teams | — | Not planned |
| Matrix | — | Not planned |
| Google Chat | — | Not planned |
| LINE / Feishu / Zalo | — | Not planned |
| Nostr | — | Not planned |
| WebChat | Chat UI (packages/chat) | **Complete** |

**Endo approach:** Rather than bridging to external messaging platforms,
Endo provides its own inbox/space messaging system with the Chat UI as
the primary interface. The Chat UI runs inside the Familiar (Electron)
or can be served by a self-hosted daemon
([daemon-docker-selfhost](daemon-docker-selfhost.md)). External platform
bridges could be built as guest plugins but are not on the current
roadmap.

**Gap:** Endo has no channel bridges. Users who want to control their
agent from a phone app today would need to use the Chat UI in a mobile
browser (once remote access is implemented). A future design could add
a Telegram or Signal bridge as a guest plugin.

### AI Model Support

| OpenClaw Model | Endo Equivalent | Status |
|----------------|-----------------|--------|
| Claude (Anthropic) | `@anthropic-ai/sdk` in Lal/Fae | **Available** |
| GPT-4 / GPT-3.5 (OpenAI) | `openai` SDK in Lal | **Available** |
| Gemini (Google) | — | Not yet; could add SDK |
| Llama (Meta) | Via Ollama | **Available** |
| Mistral | Via Ollama or OpenAI-compatible API | **Available** |
| Ollama (local) | `ollama` SDK in Lal | **Available** |
| LM Studio (local) | Via OpenAI-compatible endpoint | **Available** |

**Endo approach:** Lal supports Anthropic, OpenAI, and Ollama APIs
directly. With [lal-fae-form-provisioning](lal-fae-form-provisioning.md),
users configure model host and API key via form submission, so any
OpenAI-compatible endpoint (LM Studio, vLLM, etc.) works by providing
its URL.

**Gap:** No native Gemini SDK integration, but Google's Gemini API is
OpenAI-compatible, so it should work via the OpenAI SDK path.

### System Access Tools

| OpenClaw Tool | Endo Equivalent | Status |
|---------------|-----------------|--------|
| `system.run` (shell execution) | `Shell` capability | Designed ([daemon-agent-tools](daemon-agent-tools.md)) |
| File read/write | `Dir` / `File` capabilities | Designed ([daemon-capability-filesystem](daemon-capability-filesystem.md), [daemon-agent-tools](daemon-agent-tools.md)) |
| `system.notify` (notifications) | — | Not designed |
| `location.get` | — | Not designed |
| Camera snap/clip | — | Not designed; not applicable to server daemon |
| Screen recording | — | Not designed; not applicable to server daemon |

**Endo approach:** Endo's [daemon-agent-tools](daemon-agent-tools.md)
design provides `Dir`-backed filesystem tools and a `Shell` capability
with command allowlists. Unlike OpenClaw's ambient `system.run`, Endo's
shell capability validates commands against an allowlist and passes
arguments as arrays (no shell injection). The
[daemon-capability-filesystem](daemon-capability-filesystem.md) design
provides structural confinement — the agent cannot access paths outside
its granted `Dir` root.

**Gap:** System notifications could be surfaced through the Familiar's
Electron `Notification` API. Location, camera, and screen capture are
device-specific features that would live in the Familiar or mobile
companion apps rather than the daemon.

### Browser Control

| OpenClaw Feature | Endo Equivalent | Status |
|------------------|-----------------|--------|
| Dedicated Chrome/Chromium instance | — | Not designed |
| Page snapshots | — | Not designed |
| Form filling | — | Not designed |
| Data extraction | — | Not designed |
| Upload handling | — | Not designed |
| Browser profiles | — | Not designed |

**Endo approach:** Endo does not currently have a browser automation
design. This is a significant capability gap for use cases like flight
check-in, web research, and form automation. A future design could
provide a `Browser` capability backed by Puppeteer or Playwright, with
structural confinement: the agent receives a browser context scoped to
specific allowed domains, with the host controlling which sites are
accessible.

**Gap:** Browser automation would be a new capability category in the
[daemon-capability-bank](daemon-capability-bank.md). A design document
(`daemon-capability-browser.md`) would be needed.

### Productivity Integrations

| OpenClaw Integration | Endo Equivalent | Status |
|----------------------|-----------------|--------|
| Gmail | — | Not designed |
| Outlook | — | Not designed |
| Calendar (Google/Apple) | — | Not designed |
| Notion | — | Not designed |
| Todoist | — | Not designed |
| Trello | — | Not designed |
| Gmail Pub/Sub | — | Not designed |

**Endo approach:** These would be implemented as guest plugins (confined
JS modules) that receive API credentials as capabilities. For example, a
Gmail plugin would receive an `OAuth` capability that provides
authenticated access to the Gmail API without exposing the raw OAuth
token to the agent. Each integration is a separate plugin with its own
confined scope.

**Gap:** No productivity integrations exist. The plugin architecture
(guest modules with granted capabilities) is ready, but no specific
integrations have been built. These could be community-contributed once
the capability filesystem and agent tools are in place.

### Smart Home

| OpenClaw Integration | Endo Equivalent | Status |
|----------------------|-----------------|--------|
| HomeKit | — | Not designed |
| Google Home | — | Not designed |
| Alexa | — | Not designed |
| SmartThings | — | Not designed |
| IFTTT | — | Not designed |
| Shortcuts (Apple) | — | Not designed |

**Endo approach:** Smart home integrations would be guest plugins that
receive network capabilities scoped to specific local devices or cloud
APIs. The [daemon-capability-bank](daemon-capability-bank.md) network
category would provide host-allowlisted HTTP access for cloud-based
smart home APIs.

**Gap:** Smart home is out of scope for the current roadmap. It could
become relevant once the capability bank and network capabilities are
implemented.

### Agent Management

| OpenClaw Feature | Endo Equivalent | Status |
|------------------|-----------------|--------|
| Multi-agent routing | Multi-guest with per-agent spaces | **Available** |
| Isolated workspaces per agent | Per-guest formula isolation + pet-name directories | **Available** |
| `sessions_list` (discover agents) | `endo list` / Chat spaces gutter | **Complete** |
| `sessions_history` (transcripts) | Inbox message history per space | **Complete** |
| `sessions_send` (inter-agent messages) | `endo send` / `E(guest).send()` | **Complete** |
| AGENTS.md (agent definitions) | Form-based agent provisioning | Designed ([lal-fae-form-provisioning](lal-fae-form-provisioning.md)) |
| SOUL.md (agent personality) | System prompt in agent setup module | **Available** (in `packages/lal/agent.js`) |

**Endo approach:** Endo's multi-agent model is more structured than
OpenClaw's file-based workspace. Each agent is a guest with its own
formula identity, pet-name directory, inbox, and capability set. Agents
can message each other via `send()`. The
[lal-fae-form-provisioning](lal-fae-form-provisioning.md) design
replaces OpenClaw's `AGENTS.md` with form-based provisioning: the root
user fills a form to configure each agent persona.

**Gap:** No equivalent to `SOUL.md` as a user-editable personality file.
Agent personality is currently coded into the agent module. A future
enhancement could let the form include a "system prompt" field that the
agent prepends to its LLM context.

### Persistence and Memory

| OpenClaw Feature | Endo Equivalent | Status |
|------------------|-----------------|--------|
| Persistent memory across sessions | Formula store (durable state) | **Available** |
| Conversation history | Inbox message history | **Complete** |
| User preference tracking | Pet-name directory state | **Available** |
| Proactive outreach (morning briefings, reminders) | — | Not designed |
| Cron jobs | — | Not designed |
| Webhooks | — | Not designed |

**Endo approach:** The daemon's formula store provides durable
persistence for all agent state. Messages, pet names, and capabilities
survive daemon restarts. Lal's transcript node store
([lal-reply-chain-transcripts](lal-reply-chain-transcripts.md)) provides
conversation history with reply chain structure.

**Gap:** Endo has no cron/scheduler or proactive outreach mechanism. An
agent cannot currently initiate a conversation unprompted. A `Timer`
capability is listed in the
[daemon-capability-bank](daemon-capability-bank.md) taxonomy but not yet
designed. Webhooks could be a gateway feature.

### Voice and Media

| OpenClaw Feature | Endo Equivalent | Status |
|------------------|-----------------|--------|
| Voice Wake (macOS/iOS) | — | Not designed |
| Talk Mode (Android continuous voice) | — | Not designed |
| Media pipeline (images, audio, video) | — | Not designed |
| Transcription hooks | — | Not designed |

**Gap:** Voice and media are not on the current Endo roadmap. These are
device-specific features that would live in the Familiar (Electron for
desktop, future mobile apps). The Chat UI could potentially integrate
Web Speech API for browser-based voice input, but this is speculative.

### Security Model

| OpenClaw Mechanism | Endo Equivalent | Status |
|--------------------|-----------------|--------|
| DM pairing (approval for new contacts) | Guest provisioning (explicit `provideGuest`) | **Available** |
| Owner-only group commands | Host-only privileged operations | **Available** |
| Pairing codes for unknown senders | — | Not designed (no external messaging) |
| Inbound DMs treated as untrusted | All guest inputs are untrusted by SES design | **Available** |
| — | SES lockdown (frozen primordials) | **Available** (Endo-specific) |
| — | Interface guards (`M.interface()`) | **Available** (Endo-specific) |
| — | Structural filesystem confinement | Designed ([daemon-capability-filesystem](daemon-capability-filesystem.md)) |
| — | Command allowlists for shell execution | Designed ([daemon-agent-tools](daemon-agent-tools.md)) |
| — | Caretaker revocation (revoke caps at any time) | Designed ([daemon-capability-filesystem](daemon-capability-filesystem.md)) |

**Endo advantage:** Endo's security model is fundamentally stronger than
OpenClaw's. OpenClaw's agent has ambient authority — it can read
`~/.ssh/id_rsa`, run `curl` to exfiltrate data, or modify
`~/.bashrc` for persistence. Endo's object-capability model makes these
attacks structurally impossible: the agent literally cannot name paths
outside its granted `Dir` root, cannot execute commands outside its
`Shell` allowlist, and cannot access network endpoints outside its
granted scope.

### Companion Apps

| OpenClaw App | Endo Equivalent | Status |
|--------------|-----------------|--------|
| macOS menu bar app | Familiar (Electron, macOS) | **Complete** ([familiar-electron-shell](familiar-electron-shell.md)) |
| iOS node (Canvas, voice, camera) | — | Not designed |
| Android node (voice, camera, screen) | — | Not designed |
| WebChat | Chat UI (packages/chat) | **Complete** |

**Gap:** Mobile companion apps are not on the current roadmap. The Chat
UI served by a self-hosted daemon
([daemon-docker-selfhost](daemon-docker-selfhost.md)) provides mobile
access via browser once [gateway-bearer-token-auth](gateway-bearer-token-auth.md) is
implemented.

### Skills / Plugin Ecosystem

| OpenClaw Feature | Endo Equivalent | Status |
|------------------|-----------------|--------|
| Bundled skills | Bundled agents (Lal, Fae) | Designed ([familiar-bundled-agents](familiar-bundled-agents.md)) |
| Managed skills (curated registry) | — | Not designed |
| Workspace skills (user-installed) | Guest plugins (`endo install`) | **Available** |
| ClawHub (skill registry + auto-install) | — | Not designed |
| `SKILL.md` skill definitions | Agent module with `make(powers)` entry point | **Available** |
| Install gating (approval before install) | `endo install` requires user confirmation | **Available** |

**Endo approach:** Endo's plugin model is guest modules that export
`make(powers)` and receive only the capabilities granted to them. This is
more secure than OpenClaw's skill model (which has full system access).
Endo does not have a centralized skill registry.

**Gap:** No skill registry or marketplace. Community plugins would need
to be distributed as npm packages or git URLs and installed via
`endo install`. A skills directory could index available plugins.

## Summary: Coverage and Gaps

### Already available or complete in Endo

- WebSocket-based local gateway
- Multi-agent isolation with per-guest capabilities
- Inter-agent messaging (`send`, `request`, `form`)
- Chat UI (spaces, inbox, command bar, theming)
- Familiar desktop app (macOS, with Linux/Windows via Electron)
- AI model support (Anthropic, OpenAI, Ollama)
- Persistent state (formula store, durable across restarts)
- Conversation history with reply chains
- Plugin installation (`endo install`)
- SES security (hardened JavaScript, frozen primordials)

### Designed but not yet implemented

- Filesystem capabilities (`Dir`/`File` with structural confinement)
- Shell capabilities (command allowlists, no injection)
- Git capabilities (no push, no hooks)
- Agent coding tools (Claw-like tool registration)
- Form-based agent provisioning (multi-persona via forms)
- Bundled agents in Familiar and Docker
- Docker self-hosting with remote access
- Bearer token gateway authentication

### Not yet designed — would close significant gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| Browser automation capability | Medium | Puppeteer/Playwright-backed `Browser` exo |
| Cron/scheduler capability | Medium | Timer capability in bank taxonomy |
| Proactive agent outreach | Medium | Agent-initiated messages, morning briefings |
| System notifications | Low | Electron `Notification` API in Familiar |
| Productivity integrations (Gmail, Calendar, Notion) | Low | Guest plugins with OAuth capabilities |
| Smart home integrations | Low | Guest plugins with network capabilities |
| Skill registry / marketplace | Low | Index of community plugins |
| Voice input | Low | Web Speech API in Chat UI |
| Mobile companion apps | Low | iOS/Android; browser-based mobile access is interim |

### Endo-specific advantages (no OpenClaw equivalent)

- **Object-capability confinement:** Agents cannot exceed granted authority
- **Interface guards:** Machine-readable method contracts enforce valid calls
- **Caretaker revocation:** Host can revoke any capability instantly
- **Structural filesystem confinement:** Cannot name paths outside granted root
- **Hardened JavaScript (SES):** Frozen primordials prevent prototype pollution
- **Formula-based persistence:** Typed, graph-structured durable state
- **Locator-based identity:** 256-bit cryptographic agent identifiers

## Related Designs

- [daemon-agent-tools](daemon-agent-tools.md) — Claw-like coding tools
- [daemon-capability-filesystem](daemon-capability-filesystem.md) — `Dir`/`File` capabilities
- [daemon-capability-bank](daemon-capability-bank.md) — Capability category taxonomy
- [lal-fae-form-provisioning](lal-fae-form-provisioning.md) — Form-based agent setup
- [familiar-bundled-agents](familiar-bundled-agents.md) — Bundled agents in Familiar
- [daemon-docker-selfhost](daemon-docker-selfhost.md) — Docker self-hosting
- [gateway-bearer-token-auth](gateway-bearer-token-auth.md) — Remote gateway auth
