# EndoPi: Comparative Analysis with the Pi Agent Harness

| | |
|---|---|
| **Created** | 2026-05-15 |
| **Updated** | 2026-05-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Reference |

## Background

Pi is "the pi agent harness" — a minimal terminal coding-agent toolkit
authored by Mario Zechner (`badlogic`) and published under the
`@earendil-works/*` npm scope. The canonical source-of-truth monorepo is
[badlogic/pi-mono](https://github.com/badlogic/pi-mono); a mirror lives
at [earendil-works/pi](https://github.com/earendil-works/pi). License is
MIT.

Pi is the same author's follow-on to OpenClaw (the subject of the
existing [endoclaw](endoclaw.md) reference design). Where OpenClaw is a
personal-assistant daemon glued to messaging platforms, Pi is a
terminal-first coding harness with a deliberately minimal core and a
strong extension model. The two designs (endoclaw, endopi) are
complementary: OpenClaw frames Endo's *assistant* shape; Pi frames Endo's
*coding-agent* shape.

This document maps Pi's surface onto Endo's existing surface (daemon +
chat + familiar + cli + lal + fae) and inventories the gaps worth
closing.

### Target disambiguation

"Pi harness" surfaces several candidates. The chosen reference is
[badlogic/pi-mono](https://github.com/badlogic/pi-mono): a 4100+ commit
TypeScript monorepo, ~49.5k stars, license MIT, currently shipping at
v0.74.x. Alternatives surveyed and rejected:

- **Inflection AI's Pi** (consumer chatbot). Not a harness; no
  capability surface to map onto Endo's daemon.
- **`tibormester/pi-harness`, `werg/pi-harness`, `davidondrej/pi-agent`,
  `Dicklesworthstone/pi_agent_rust`**: forks or ports of the same
  upstream. Mapping the canonical upstream covers them.
- **`can1357/oh-my-pi`**: a downstream skin atop pi. Out of scope; if
  Endo eventually carries pi-style extensions, oh-my-pi can be revisited
  as a packaging precedent.
- **`earendil-works/pi`**: the public mirror. Same content as
  `badlogic/pi-mono`. Both are cited interchangeably in pi's own docs.

The maintainer's existing [endoclaw](endoclaw.md) reference already cites
"Pi-compatible jsonl files" as the desired session-persistence shape (see
endoclaw § *Persistence and Memory*), which is consistent with pi-mono
being the intended target.

## Architecture Comparison

| Aspect               | Pi                                                      | Endo                                                       |
|----------------------|---------------------------------------------------------|------------------------------------------------------------|
| **Runtime**          | Node.js CLI (`pi`), TypeScript monorepo                 | Node.js daemon, `$ENDO_STATE/state`                        |
| **Embedding**        | Library SDK (`createAgentSession`) + RPC over stdio     | Daemon + WebSocket gateway (`ws://127.0.0.1:8920`)         |
| **Agent shape**      | Single-process coding agent, optional sub-agents        | Multi-guest, per-guest formula isolation                   |
| **Tool model**       | Four built-ins (read/write/edit/bash); extensions add   | Capabilities (`Dir`, `Shell`, `Git`, ...) granted per agent|
| **Capability model** | Ambient authority + opt-in container/sandbox            | Object-capability (agent holds only granted caps)          |
| **Provider model**   | `pi-ai`: unified, multi-provider LLM API                | `packages/lal/providers/`: per-provider modules            |
| **Persistence**      | JSONL session files; tree of entries (id, parentId)     | Formula store (typed graph) + Lal reply-chain transcripts  |
| **Branching**        | First-class: `/tree`, `/fork`, `/clone` on a single file| Reply-chain branching via `replyTo`; no in-file tree UI    |
| **Compaction**       | Auto + manual `/compact`; structured summary; iterative | Designed only ([lal-transcript-memory-management](lal-transcript-memory-management.md))|
| **Extensions**       | TypeScript modules; events, tools, commands, UI         | Guest plugins (confined JS modules) with granted caps      |
| **Skills**           | Markdown skills following agentskills.io spec; on-demand| Designed only ([endoclaw-skill-registry](endoclaw-skill-registry.md))|
| **UI**               | Terminal (`pi-tui`), web (`pi-web-ui`), RPC for hosts   | Chat UI (browser), Familiar (Electron)                     |
| **Distribution**     | npm packages (`pi install`), git URLs                   | Guest plugins (`endo install`); no central registry        |
| **Security**         | Ambient; review-before-install for packages             | SES lockdown, structural confinement, interface guards     |

The fundamental difference echoes endoclaw's: Pi takes the *ambient
authority + ergonomics* path; Endo takes the *least authority +
auditable structure* path. The interesting question is not which
architecture wins, but which of Pi's design moves Endo should adopt
verbatim, which it should refract through capabilities, and which it
should decline.

## Feature-by-Feature Mapping

### Built-in tool core

| Pi Tool                         | Endo Equivalent                              | Status                                              |
|---------------------------------|----------------------------------------------|-----------------------------------------------------|
| `read`                          | `Dir.lookup` + `File.read`                   | Designed ([daemon-agent-tools](daemon-agent-tools.md), [daemon-capability-filesystem](daemon-capability-filesystem.md))|
| `write`                         | `Dir.write` + `File.write`                   | Designed (same)                                     |
| `edit` (oldText/newText replace)| `applyEditsToNormalizedContent` analogue     | Not designed                                        |
| `bash` (with timeout, streaming)| `Shell.exec` with allowlist                  | Designed ([daemon-agent-tools](daemon-agent-tools.md))|
| `ls`, `find`, `grep` (internal) | `Dir.list`, `Dir.glob`                       | Designed (same)                                     |

Pi's `edit` tool is the interesting one. It implements unique-match
oldText/newText replacement on normalized line endings, with structured
diff preview. Endo's `daemon-agent-tools` design lists `writeFile` but
not an edit-by-replacement primitive; the [cli-edit-verb](cli-edit-verb.md)
design covers hashline patches for human-on-CLI editing but is not the
primitive a tool-calling LLM uses. See gap [endopi-edit-tool](endopi-edit-tool.md).

### Session model

| Pi Feature                                  | Endo Equivalent                                | Status                                                 |
|---------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| JSONL session file with tree entries        | Lal reply-chain transcripts (in-memory graph)  | **Complete** for in-memory; on-disk JSONL not built    |
| `id` / `parentId` tree linking              | `messageId` / `replyTo` on daemon messages     | **Available** (different naming)                       |
| `/tree` navigation UI                       | —                                              | Not designed                                           |
| `/fork`, `/clone`                           | Reply at a chosen prior message produces a new branch | **Available** (different mechanism)             |
| `--no-session` ephemeral mode               | —                                              | Implicit (formula not persisted on a one-shot guest)   |
| Cross-host session export (Hugging Face)    | —                                              | Not designed                                           |
| `/export` to HTML                           | —                                              | Not designed                                           |
| `/share` as private GitHub gist             | —                                              | Out of scope                                           |
| Auto-compaction (context overflow recovery) | —                                              | Designed only ([lal-transcript-memory-management](lal-transcript-memory-management.md))|

Pi's session-on-disk format is the part of pi worth porting verbatim:
maintainer's existing note on [endoclaw](endoclaw.md) (§ *Persistence
and Memory*) names "Pi-compatible jsonl files" as the desired offline
operator shape. The session-export feature also doubles as the
agent's own form of long-term memory inside its workspace. See gap
[endopi-jsonl-transcript-format](endopi-jsonl-transcript-format.md).

### Multi-provider LLM API

| Pi Feature                                  | Endo Equivalent                                | Status                                                 |
|---------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| Unified provider/model registry             | `packages/lal/providers/` (Anthropic, OpenAI, Ollama, Gemini, Llama.cpp)| **Available**                          |
| 30+ providers, auto-discovered models       | Five providers                                 | Gap                                                    |
| Subscription auth (Claude Pro/Max, ChatGPT Plus, Copilot) | API-key only                       | Gap                                                    |
| Cross-provider session handoff              | —                                              | Not designed                                           |
| Token / cost tracking per usage block       | Per-message usage in Lal transcripts (partial) | Partial                                                |
| Tool-call streaming with partial JSON       | Tool-call extraction (`extractToolCallsFromContent`)| **Available** for Fae                            |
| Image input on user messages                | Designed ([daemon-value-message](daemon-value-message.md)) for `value` types | Designed             |

Pi's `pi-ai` package is a focused dependency Endo could either vendor
(bundling 30+ providers in one place), or take inspiration from while
keeping the Endo per-provider module shape. The "subscription auth"
piece (use a Claude Pro / ChatGPT Plus / Copilot subscription instead
of an API key) is its highest-leverage feature for end users. See gap
[endopi-provider-registry-and-oauth](endopi-provider-registry-and-oauth.md).

### Extension model

| Pi Feature                                  | Endo Equivalent                                | Status                                                 |
|---------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| Extensions: TS modules, full system access  | Guest plugins (`make(powers)`) under SES       | **Available** (and structurally safer)                 |
| Extension API: events (`tool_call`, `session_start`, ...) | Daemon eventual-send patterns       | Different shape                                        |
| `pi.registerTool` (LLM-callable)            | Tool registration in Fae (`makeFooTool`)       | **Available**                                          |
| `pi.registerCommand` (`/foo`)               | Chat command bar; slash-commands designed      | In progress ([chat-slot-slash-commands](chat-slot-slash-commands.md))|
| `pi.registerShortcut` (keybinding)          | Chat UI keyboard system                        | **Available**                                          |
| Async extension factory (await before start)| Guest module top-level init                    | **Available**                                          |
| Hot-reload (`/reload`)                      | Designed for inventory but not for guest code  | Partial                                                |
| Extensions as `pi install` packages         | `endo install` for guest plugins               | **Available**                                          |
| `pi-package` keyword in `package.json`      | —                                              | Gap                                                    |
| Permission gates as extensions              | Caretaker revocation + interface guards        | **Available** (structural, not opt-in)                 |

Endo's existing guest-plugin model is *more* secure than Pi's. The gap
is not the architecture but the *ergonomics*: Pi extensions can ship
both code and resources (skills, prompts, themes) under one keyword in
`package.json`, and a single `pi install` command resolves them all.
Endo's `endo install` is single-purpose. See gap
[endopi-extension-package-manifest](endopi-extension-package-manifest.md).

### Skills system

| Pi Feature                                  | Endo Equivalent                                | Status                                                 |
|---------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| `SKILL.md` with frontmatter (name, description, license)| —                                  | Not designed                                           |
| Progressive disclosure (descriptions in prompt; full body on demand) | —                       | Not designed                                           |
| `/skill:name` slash command                 | —                                              | Not designed                                           |
| Skill discovery (project + global, walking up cwd)| —                                        | Not designed                                           |
| Skills as a directory on disk               | Skills as EndoDirectory                        | Designed ([endoclaw-skill-registry](endoclaw-skill-registry.md))|
| Cross-harness skill paths (`~/.claude/skills`)| —                                            | Not designed                                           |

The Endo design [endoclaw-skill-registry](endoclaw-skill-registry.md) is
the right framing on the daemon side. The complementary piece — a
markdown-frontmatter skill format compatible with the [agentskills.io
spec](https://agentskills.io/specification) used by Pi, Claude Code, and
Codex — is the on-disk side. See gap [endopi-skills-markdown-format](endopi-skills-markdown-format.md).

### Prompt templates

| Pi Feature                                  | Endo Equivalent                                | Status                                                 |
|---------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| Markdown templates with `{{var}}` interpolation| —                                           | Gap                                                    |
| `/templatename` expansion in editor         | —                                              | Gap                                                    |
| Global + project + package locations        | —                                              | Gap                                                    |

Self-contained, low-risk feature. See gap
[endopi-prompt-templates](endopi-prompt-templates.md).

### Context files

| Pi Feature                                  | Endo Equivalent                                | Status                                                 |
|---------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| `AGENTS.md` / `CLAUDE.md` at startup        | System prompt in `packages/lal/agent.js`       | **Available** (but not editable per-project)           |
| Walking parents from cwd                    | —                                              | Gap                                                    |
| Append vs replace via `SYSTEM.md`           | —                                              | Gap                                                    |

This composes with [endopi-skills-markdown-format](endopi-skills-markdown-format.md);
the discovery rule is the same one. Tracked under the skills-format gap.

### Operating modes

| Pi Mode                                     | Endo Equivalent                                | Status                                                 |
|---------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| Interactive (TUI)                           | Chat UI; no first-party TUI                    | Partial (Chat in browser, not terminal)                |
| Print (one-shot, prints + exits)            | `endo run` for one-shot guests                 | **Available** (different shape)                        |
| RPC over stdio (LF-delimited JSONL)         | Daemon WebSocket gateway                       | Gap (different transport, different framing)           |
| SDK (`createAgentSession`)                  | Guest module's `make(powers)`                  | **Available**                                          |

Pi's RPC mode is the part Endo does *not* have: a strict line-delimited
JSON protocol for embedding the agent in another process (an IDE, a CI
harness, a Familiar pane) without WebSocket overhead. The
maintainer's `endor-bus-tui` direction may eventually subsume this; the
short-term gap is real today. See gap
[endopi-stdio-rpc-bridge](endopi-stdio-rpc-bridge.md).

### Compaction

| Pi Feature                                  | Endo Equivalent                                | Status                                                 |
|---------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| Auto-compaction on context overflow         | —                                              | Designed only ([lal-transcript-memory-management](lal-transcript-memory-management.md))|
| Manual `/compact [instructions]`            | —                                              | Gap                                                    |
| Structured summary format                   | —                                              | Gap                                                    |
| Iterative (prior summary feeds next)        | —                                              | Gap                                                    |
| `keepRecentTokens` / `reserveTokens` knobs  | —                                              | Gap                                                    |
| Branch summarization on `/tree` navigation  | —                                              | N/A (no /tree)                                         |

Pi's compaction shape is a refinement of what
`lal-transcript-memory-management` already describes. See gap
[endopi-iterative-compaction](endopi-iterative-compaction.md).

### Session sharing for OSS

| Pi Feature                                  | Endo Equivalent                                | Status                                                 |
|---------------------------------------------|------------------------------------------------|--------------------------------------------------------|
| `pi-share-hf` to publish to Hugging Face    | —                                              | Out of scope (philosophical)                           |
| `/export` to standalone HTML                | —                                              | Gap                                                    |
| `/share` as private GitHub gist             | —                                              | Out of scope                                           |

HTML export is the only piece worth carrying forward; the rest is
philosophical (sharing transcripts is a workflow choice). Tracked as a
follow-on inside the JSONL-transcript gap, not a standalone design.

## Summary: Coverage and Gaps

### Already-available or complete in Endo

- Multi-agent isolation with per-guest formulas
- Reply-chain transcripts (in-memory graph, equivalent to Pi's session
  tree but in RAM)
- Tool-call extraction for Fae
- Pluggable LLM providers (Anthropic, OpenAI, Ollama, Gemini, Llama.cpp)
- SES lockdown + structural capability confinement
- Guest plugin install (`endo install`)
- Familiar (Electron) chat UI
- WebSocket gateway

### Designed but not implemented (Endo already covers)

- Filesystem capabilities (`Dir` / `File`)
- Shell capabilities with allowlist
- Agent coding tools (read / write / bash equivalents)
- Skill registry as EndoDirectory
- Slash commands in chat
- Form-based agent provisioning

### Gaps worth closing — design spinouts

Each gap below has a sibling design at the path indicated.

| Gap                                    | Sibling design                                                    | Pi reference            |
|----------------------------------------|-------------------------------------------------------------------|-------------------------|
| LLM-friendly edit-by-replacement tool  | [endopi-edit-tool](endopi-edit-tool.md)                           | `coding-agent/src/core/tools/edit.ts`|
| Pi-compatible JSONL session format     | [endopi-jsonl-transcript-format](endopi-jsonl-transcript-format.md)| `coding-agent/src/core/session-manager.ts`, `docs/session-format.md`|
| Multi-provider registry + subscription OAuth| [endopi-provider-registry-and-oauth](endopi-provider-registry-and-oauth.md)| `ai/src/oauth.ts`, `ai/src/api-registry.ts`|
| Markdown skill format (agentskills.io) | [endopi-skills-markdown-format](endopi-skills-markdown-format.md) | `coding-agent/src/core/skills.ts`, `docs/skills.md`|
| Prompt templates                       | [endopi-prompt-templates](endopi-prompt-templates.md)             | `coding-agent/src/core/prompt-templates.ts`|
| Iterative compaction with structured summary| [endopi-iterative-compaction](endopi-iterative-compaction.md)| `coding-agent/src/core/compaction/compaction.ts`|
| Stdio JSONL RPC bridge to a daemon agent| [endopi-stdio-rpc-bridge](endopi-stdio-rpc-bridge.md)            | `coding-agent/src/modes/rpc/`, `docs/rpc.md`|
| Extension package manifest (one `package.json` keyword for code + skills + prompts + themes)| [endopi-extension-package-manifest](endopi-extension-package-manifest.md)| `coding-agent/docs/packages.md`|

### Pi-specific moves Endo declines

- **Ambient extension authority.** Pi extensions get full system
  access. Endo's guest plugins are confined by SES + capability
  grants. Endo keeps the confinement.
- **No MCP.** Pi's stance (build CLI tools with READMEs; an extension
  can add MCP if wanted) is compatible with Endo; nothing to do.
- **No built-in sub-agents.** Pi pushes this to extensions. Endo's
  multi-guest formula model already provides confined sub-agents.
- **No permission popups in core.** Endo enforces structurally
  (caretaker revocation, interface guards) rather than runtime-prompt.
- **No background bash.** Pi prefers `tmux`; Endo is symmetric on this.
  No design move needed.
- **Hugging Face transcript publishing.** Out of scope for Endo's
  local-first posture; the `/share` flow assumes a curator infrastructure
  Endo does not have.

### Endo-specific advantages (no Pi equivalent)

- Object-capability confinement at the JS module boundary
- Caretaker revocation of any granted capability
- Multi-guest isolation with per-guest network identity
- Formula-store persistence outliving daemon restarts
- Hardened JavaScript (SES) defeating prototype pollution attacks
- OCapN peer-to-peer message-passing primitives

## Architectural Contrasts

### Capability model

Pi takes the ergonomic path: the agent's process *is* the user's
process. Tools run with the user's permissions; safety is one of
"review extensions before installing", "run pi in a container", or
"write a permission-gate extension". This is fine for a developer who
runs pi in their checkout, less fine for an agent serving a less
technical user.

Endo's [daemon-capability-filesystem](daemon-capability-filesystem.md) +
[daemon-agent-tools](daemon-agent-tools.md) inverts the default: the
agent receives a `Dir(/path/to/project)` and a `Shell({allowed: [...]})`
and *cannot name* anything outside. The user does not have to remember
to review the agent's actions, because the agent's authority is bounded
by what was granted at provisioning time.

Both designs work. The interesting question is which one the user is
willing to live with. The bet of Endo is that capability confinement
will pay off when agents act on behalf of users who cannot evaluate the
agent's source code.

### Persistence

Pi's persistence story is "a JSONL file in `~/.pi/agent/sessions/`".
Reading the file with `jq` or `cat` recovers everything; the agent can
read its own past sessions as files. The agent's "memory" is the same
file the operator inspects.

Endo's persistence is the formula store: a typed graph indexed by 256-bit
formula identifiers, durable, but opaque to the operator without going
through the daemon. The Lal reply-chain transcripts are in-memory only.

Pi's shape is simpler and more debuggable for the operator. Endo's shape
is more structurally sound and survives malicious-formula crashes
without losing history. The gap-closing move
([endopi-jsonl-transcript-format](endopi-jsonl-transcript-format.md))
imports Pi's file shape as a *projection* of Endo's transcript graph —
not a replacement.

### Extensibility

Pi extensions are TS modules with full system access. The shape is
*plug-in*: pi loads them, calls their factory, lets them register tools
and listen to events. The same module can register a tool, replace a
built-in UI component, hook compaction, and emit a status-line widget —
all with no security boundary.

Endo guest plugins are guest modules with bounded authority. The shape
is *guest*: the daemon hands the module a `powers` argument with the
capabilities the host approved. The plugin author cannot escalate by
"just adding another import"; the import resolution itself is mediated
by Endo's compartment mapper.

The right move for Endo is not to copy Pi's plug-in model, but to make
its guest model *as ergonomic as Pi's plug-in model* for the cases where
the user actually wants the broad authority (developer-on-their-own-box).
That is what
[endopi-extension-package-manifest](endopi-extension-package-manifest.md)
is for: one `package.json` keyword, one install command, multiple
resource kinds.

### Security

Pi's security model is "the user reviews the code, or runs pi in a
container". This is fine for one developer auditing their own
environment, weak for any other deployment posture.

Endo's security model is the SES baseline plus capabilities. Even
malicious extensions cannot read `~/.ssh/id_rsa` because they were not
granted a `Dir` containing it.

This is endoclaw's headline contrast as well; carrying it forward here
without repeating it.

### Agent-orchestration shape

Pi's default is *one agent, one session, one cwd*. Sub-agents are a
deliberate non-feature, pushed to extensions ("there's many ways to do
this; tmux is one"). The harness assumes the human stays in the loop.

Endo's default is *many guests, many spaces, many capabilities*. The
multi-guest formula model is the orchestration layer; the human can
delegate one guest to another (`send`, `request`, `form`) without the
human being on the message path. This is the shape that matters for the
Endo bot fleet's eventual self-organization.

Pi and Endo are pointed at different problems. Pi optimizes for a
single developer's coding velocity; Endo optimizes for a multi-agent
system in which the human is one of N participants. The gap-closing
designs in this document are about adopting Pi's *developer-velocity*
moves (edit tool, JSONL transcripts, OAuth providers, skills format,
RPC) without giving up Endo's *multi-agent-system* shape.

## Pi source-file citation index

The sibling gap designs cite Pi sources at the file level. The full
list referenced from this document and its siblings:

- [`packages/coding-agent/README.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md)
- [`packages/coding-agent/docs/session-format.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session-format.md)
- [`packages/coding-agent/docs/sessions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sessions.md)
- [`packages/coding-agent/docs/skills.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md)
- [`packages/coding-agent/docs/extensions.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [`packages/coding-agent/docs/prompt-templates.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/prompt-templates.md)
- [`packages/coding-agent/docs/compaction.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md)
- [`packages/coding-agent/docs/rpc.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md)
- [`packages/coding-agent/docs/sdk.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
- [`packages/coding-agent/docs/settings.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/settings.md)
- [`packages/coding-agent/docs/packages.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md)
- [`packages/coding-agent/src/core/tools/read.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/read.ts)
- [`packages/coding-agent/src/core/tools/write.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/write.ts)
- [`packages/coding-agent/src/core/tools/edit.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit.ts)
- [`packages/coding-agent/src/core/tools/edit-diff.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/edit-diff.ts)
- [`packages/coding-agent/src/core/tools/bash.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/tools/bash.ts)
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts)
- [`packages/coding-agent/src/core/skills.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/skills.ts)
- [`packages/coding-agent/src/core/system-prompt.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/system-prompt.ts)
- [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts)
- [`packages/coding-agent/src/core/compaction/compaction.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts)
- [`packages/coding-agent/src/modes/rpc/`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/src/modes/rpc)
- [`packages/agent/README.md`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md)
- [`packages/agent/src/`](https://github.com/badlogic/pi-mono/tree/main/packages/agent/src) (agent-loop.ts, agent.ts, harness/, types.ts)
- [`packages/ai/README.md`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md)
- [`packages/ai/src/api-registry.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/api-registry.ts)
- [`packages/ai/src/oauth.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/oauth.ts)
- [`packages/ai/src/models.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/models.ts)
- [`packages/ai/src/types.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/types.ts)

Pi's repo head SHA at the time of this analysis is captured in the
`message` journal entry that bookends the dispatch.

## Related Designs

- [endoclaw](endoclaw.md) — companion reference for the OpenClaw mapping
- [daemon-agent-tools](daemon-agent-tools.md) — Claw-like coding tools
- [daemon-capability-filesystem](daemon-capability-filesystem.md) — `Dir` / `File`
- [endoclaw-skill-registry](endoclaw-skill-registry.md) — skills as EndoDirectory
- [lal-reply-chain-transcripts](lal-reply-chain-transcripts.md) — branching transcripts
- [lal-transcript-memory-management](lal-transcript-memory-management.md) — compaction substrate
- [cli-edit-verb](cli-edit-verb.md) — adjacent (human-on-CLI hashline edits)

## Prompt

> Compare the pi harness against endo (daemon, chat, familiar, cli) and
> produce a comparative design mirroring `endoclaw.md`. Spin out gaps
> worth closing as sibling designs. Cite pi source files at the file
> level. Disambiguate the target first.
