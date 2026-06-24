# Gap Analysis: antoinezambelli/forge vs. Endo

| | |
|---|---|
| **Created** | 2026-05-20 |
| **Author** | endolinbot (prompted) |
| **Status** | Reference |
| **Source** | Maintainer directive 2026-05-20 ("dispatch a designer to clone and develop a deep understanding of the design of https://github.com/antoinezambelli/forge and produce a gap analysis for Endo") |

## Summary

`antoinezambelli/forge` (PyPI: `forge-guardrails`) is a Python 3.12+
library that wraps a self-hosted LLM tool-calling loop with retry
guardrails, step enforcement, and context compaction.
Endo is a JavaScript hardened-realm and object-capability platform whose
LLM-agent surface (`@endo/lal`, `@endo/fae`, `@endo/genie`) is one of
many concerns on top of a SES + Compartment + CapTP substrate.
The two projects overlap only in a narrow band: how an agent runs a
tool-calling loop against a possibly-small local model.
Forge's contribution in that band is dense and well-thought-out;
endo's contribution outside that band (sandboxing, capability
discipline, persistence, networking) is orders of magnitude larger
and not addressed by forge at all.

The two highest-signal gaps from endo's perspective are
(1) forge's **tiered context-compaction strategy** with reasoning-trace
preservation as the slowest-cut tier, which directly addresses a known
brittleness of `@endo/lal` on llama.cpp at short context budgets
(`LAL_MAX_MESSAGES` is a blunt instrument by comparison), and
(2) forge's **rescue-parse + retry-nudge pipeline** for malformed
tool calls, which would slot directly under `extractToolCallsFromContent`
in `packages/lal/agent.js:944`.
The highest-signal gap from forge's perspective is that forge has
no isolation story for tool callables: a `ToolDef.callable` is a raw
Python callable invoked in the runner's process, with full ambient
authority.
Endo's `Far`/`Exo`/Compartment substrate, and the `@endo/daemon`
plugin-as-caplet model, are exactly the missing piece on forge's side.

## Forge in brief

Forge head SHA at time of read: `f1b87b05b863c7d12927f3dbdbd716af2dc3ace1`
(tag `v0.6.0`, 2026-05-19).
Repository created 2026-02-16; 542 stars, 26 forks, 4 open issues,
MIT-licensed; primarily one contributor (Antoine Zambelli).
Packaged on PyPI as `forge-guardrails`.

### Problem

Forge solves one problem: an 8B-class local LLM, sitting behind Ollama
or llama-server or Llamafile or the Anthropic API, repeatedly fails
to produce a valid tool call across a multi-step workflow, and the
naive `while True: send(); execute_tool()` loop swallows or amplifies
those failures.
Forge's pitch is that with the right guardrails the same 8B model
scores 86.5% on a 26-scenario eval suite (top self-hosted config:
Ministral-3 8B Instruct Q8 on llama-server), which the author argues
is competitive with much larger frontier configurations on the same
suite.

### Shape

Forge is a library plus an OpenAI-compatible HTTP proxy.
The library exposes a `WorkflowRunner` class that owns the
inference-retry-execute loop;
the proxy (`python -m forge.proxy`) wraps the same loop behind an
HTTP server so any client that speaks the OpenAI `chat/completions`
schema (opencode, Continue, aider) can use forge's guardrails
transparently.
The proxy injects a synthetic `respond` tool to keep the model in
tool-calling mode and strips it from the outbound response so the
client never knows.

### Primitives

The smallest units forge exposes:

- `ToolSpec` — declarative tool schema (name, description, Pydantic
  parameter model).
- `ToolDef` — `ToolSpec` plus the Python callable, plus optional
  per-tool prerequisites.
- `Workflow` — dict of `ToolDef`s plus `required_steps`,
  `terminal_tool(s)`, and a system-prompt template.
- `Message` — typed dataclass with `MessageMeta` (compaction-relevant
  metadata: type, step index, token estimate).
- `LLMClient` — protocol implemented by `OllamaClient`,
  `LlamafileClient` (covers llama-server too), and `AnthropicClient`.
  Returns `list[ToolCall] | TextResponse`, never raw text.
- `ContextManager` + `CompactStrategy` — context budgeting and
  three-phase tiered compaction.
- `StepTracker`, `ResponseValidator`, `StepEnforcer`, `ErrorTracker` —
  composable guardrail middleware extracted from the runner so foreign
  loops can import them.
- `SlotWorker` — priority queue + auto-preemption for serializing
  multiple agents against one shared inference slot (one local GPU).

### Trust model

Forge has none.
A `ToolDef.callable` is invoked with `**args` in the same process as
the runner, with ambient Python authority.
The README example registers `get_weather` as a plain function;
there is no permission surface, no allowlist, no sandbox.
The `Workflow` definition is itself an in-process object owned by the
downstream caller, not a serializable artifact or a capability.

### Boundaries

The only enforced boundary in forge is the **client adapter**: a
`LLMClient` returns parsed `ToolCall` or `TextResponse` objects and
the runner never parses raw text.
This is forge's principal abstraction (P0-2 in the architecture doc).
No process, network, or capability boundary is enforced inside the
runner.
The HTTP proxy in `src/forge/proxy/` is a thin OpenAI-shape adapter
on top of the same runner.

### Dependencies

Two runtime dependencies: `pydantic>=2.0` and `httpx>=0.27`.
Optional `anthropic>=0.40` extra for the Claude baseline client.
No shim layer of its own.
Forge uses Python's native asyncio for streaming and concurrency.

### Maturity signal

- 542 stars, 26 forks, 4 open issues (2026-05-19).
- Active: last push 2026-05-19, eight tagged releases since v0.1.0
  in early 2026.
- One primary contributor (Antoine Zambelli).
- Published as a peer-reviewed paper at
  https://doi.org/10.1145/3786335.3813193;
  preprint at `docs/forge_ieee_preprint.pdf`.
- 865 deterministic unit tests; an eval harness with 26 scenarios
  across an OG-18 baseline tier and an 8-scenario advanced-reasoning
  tier.
- 14 architecture-decision records under `docs/decisions/`.

## The overlap map

| Forge primitive | Closest endo analogue | Divergence |
|---|---|---|
| `ToolSpec` (Pydantic schema) | `@endo/patterns` `M.interface()` guards, `@endo/exo` method schemas | Forge schemas target an LLM JSON-Schema wire format; endo schemas target runtime CapTP invocation. |
| `ToolDef` (spec + callable + prereqs) | Tool helpers in `packages/genie/src/tools/` and `packages/fae/setup-tools.js` | Forge tools are bare callables; endo tools are caplets (or methods on caplets) with capability scoping. |
| `Workflow` (declarative loop config) | The hand-rolled loop in `packages/lal/agent.js` (`runAgenticLoop`, line 1336) and the worker loop in `packages/fae/driver.js` (`spawnWorkerLoop`) | Endo's loops are imperative and bespoke per package; forge's is declarative and parameterized. |
| `WorkflowRunner.run()` | `runAgenticLoop` in `@endo/lal`; `spawnWorkerLoop` in `@endo/fae` | Forge separates loop control from message storage; endo's lal merges them with transcript-tree persistence. |
| `LLMClient` protocol (Ollama, Llamafile, Anthropic) | `@endo/lal` providers under `packages/lal/providers/` | Endo has two providers today (anthropic, llama.cpp/OpenAI-compatible); forge has three first-class backends with a fourth (Llamafile) prompt-injected. |
| `Message` + `MessageMeta` (typed, compaction-aware) | LAL `ChatMessage` (informal dict); FAE transcript records | Endo's lal stores plain dicts; forge's typed metadata enables compaction by message-kind priority. |
| `ContextManager` + `TieredCompact` | `LAL_MAX_MESSAGES` truncation (`packages/lal/README.md`) | Endo's compaction is "keep last N messages"; forge's is type-aware and reasoning-preserving across three phases. |
| `StepTracker` + `StepEnforcer` | No analogue | Endo's loop is reactive (one inbound message → one outbound); no notion of required steps before termination. |
| `ResponseValidator` + rescue parse | `extractToolCallsFromContent` in `packages/lal/agent.js:944` | Endo rescues tool calls from `<tool_call>...</tool_call>` text; forge's pipeline is structured and emits a retry nudge with attempt counter on failure. |
| `ErrorTracker` (retry + tool-error budgets) | No analogue | Endo's loop has no explicit retry budget; failures propagate. |
| `SlotWorker` (priority queue + preemption) | `@endo/fae` factory pattern (sub-guests per agent) | Endo serializes via factory creation and CapTP message-passing; forge serializes one inference slot across competing workflows in-process. |
| HTTP proxy (`python -m forge.proxy`) | `@endo/daemon`'s HTTP gateway (`packages/daemon`); the `endo-gateway` design | Forge's proxy is OpenAI-shape passthrough with guardrails; endo's gateway is a capability gateway carrying OCapN/CapTP. |
| Pydantic dynamic-model build (`ToolSpec.from_json_schema`) | `@endo/patterns` pattern compilation | Forge converts JSON Schema → Pydantic at runtime to validate LLM tool-call args; endo has nothing equivalent in the agent stack. |
| `ToolDef.prerequisites` | No analogue in lal/fae/genie | Endo's tools have no declarative dependency graph; the LLM is expected to call things in a sensible order. |

## What forge does that endo doesn't

### 1. Tiered context compaction with reasoning-trace preservation

Forge's `TieredCompact` strategy
(`src/forge/context/strategies.py`, summarized in `docs/ARCHITECTURE.md`
§ "Compaction Strategies (Built-In)") runs three phases on the message
history when token estimate exceeds `budget_tokens * compact_threshold`:

- Phase 1: drop `step_nudge` and `retry_nudge` messages; truncate
  older `tool_result` payloads to ~200 chars.
- Phase 2: drop older `tool_result` messages entirely; preserve
  `reasoning` messages.
- Phase 3 (emergency): drop `reasoning` and `text_response`; preserve
  only `tool_call` skeletons in the eligible window.

Reasoning traces survive longer than raw tool results because, in
forge's words, "losing raw tool results is recoverable; losing the
model's interpretation of those results is not."
The `keep_recent` parameter holds the last N iterations fully intact.

Endo's analogue is `LAL_MAX_MESSAGES`, which truncates to the last N
messages regardless of kind (`packages/lal/README.md`).
The user sets it to avoid llama.cpp "context size" errors; it has no
type awareness, no reasoning-preservation property, and no notion of
phased escalation.

**Why endo might care.** `@endo/lal` and `@endo/fae` both run against
llama.cpp/Ollama backends with similar context windows, and similar
multi-step workflows (manage pet names, send messages, adopt
capabilities, request capabilities, inspect via `help()`).
The same brittleness forge documents (a 14B model at Q4 paging to RAM
when KV cache grows) applies to endo's local-model story.

**Adoption cost.** Medium.
The message-shape work is the bulk: lal's transcript today is a list
of raw OpenAI-shape `ChatMessage` dicts in
`packages/lal/agent.js:1340-1395`; tagging messages with
`{ type, stepIndex, originalType, tokenEstimate }` is a refactor that
touches every place `transcript` is assembled.
The strategy itself is straightforward to port; ~200 LOC in TypeScript.

**Semantic mismatch with endo's trust model.** None.
Compaction is a local property of the runner; it does not cross
capability boundaries.

### 2. Rescue-parse + retry-nudge pipeline for malformed tool calls

Forge's `ResponseValidator`
(`src/forge/guardrails/response_validator.py`) takes the parsed
`LLMResponse` and:

1. If the response is a `TextResponse` (model produced bare text),
   try `rescue_tool_call()` which scans the text for JSON-shaped tool
   calls and parses them.
2. If rescue succeeds, return the rescued `ToolCall`s as valid.
3. If rescue fails, return a `Nudge` with kind `"retry"` and a
   templated nudge body explaining the failure.
4. If the model returned a `ToolCall` referring to an unknown tool
   name, return a `Nudge` with kind `"unknown_tool"`.

The runner's `ErrorTracker` counts consecutive `Nudge` emissions and
raises `ToolCallError` after `max_retries_per_step` (default 3).
The counter resets on any valid `ToolCall`.

Endo has the rescue-parse fragment (`extractToolCallsFromContent` in
`packages/lal/agent.js:938-988`) but stops there.
If the model produces neither a tool call nor a rescuable text block,
the loop simply terminates (`continueLoop = false` at line 1385).
No retry, no nudge, no budget.

**Why endo might care.** Small local models drop tool-call structure
under context pressure or when the system prompt is poorly tuned;
endo's loop currently ends the conversation in that case, requiring
human re-engagement to recover.

**Adoption cost.** Small.
The validator and `ErrorTracker` are <300 LOC together; the runner
hook is two lines.
A nudge-template module (`packages/lal/src/nudges/`) is the only new
file.

**Semantic mismatch.** None.
The pipeline is a property of the agent loop, not the surrounding
capability graph.

### 3. StepTracker and the "control flow is not memory" discipline

Forge's `StepTracker` (`src/forge/core/steps.py`) and `StepEnforcer`
(`src/forge/guardrails/step_enforcer.py`) record which tools have been
called outside the message history.
The runner consults `step_tracker.is_satisfied()` before allowing the
terminal tool to fire; if the model attempts the terminal tool too
early, an escalating nudge (tier 1/2/3) is injected, and a fourth
attempt raises `StepEnforcementError`.

The principle, documented in `docs/ARCHITECTURE.md` § "Design Principles"
#3, is that *what the model remembers* (message history, subject to
compaction) and *what the runner enforces* (step completion) are
different.
Compaction may drop a tool result; the step-completion fact survives.

Endo's loops have no notion of required steps; the LLM decides when
to stop by failing to emit a tool call.

**Why endo might care.** Workflows in `@endo/genie`'s tool system
(filesystem ops, memory writes, heartbeat triggers) sometimes need a
pre-write step (e.g., "look at the existing memory file before
overwriting") that the model elides.
A step tracker would let a tool author declare that pattern.

**Adoption cost.** Small per se (~150 LOC) but the design question is
larger: who owns the step list?
The agent's host? The workflow author? A capability granted to the
agent at provisioning time?
This question maps to endo's existing capability discipline and is
likely worth a separate design rather than a port.

### 4. Prerequisites between tools (`ToolDef.prerequisites`)

A `ToolDef` may declare prerequisites — either bare tool names or
arg-matched entries like `{"tool": "verify_target", "city":
"$city"}`.
The `StepEnforcer.check_prerequisites()` blocks a batch whose
prerequisites are unsatisfied at pre-batch state.
This is essentially a declarative tool dependency graph enforced by
the runner.

Endo has no analogue.

**Why endo might care.** Composable agent skills
(in `packages/genie/src/tools/`) sometimes have ordering invariants;
a `commit` tool needs `stage` to have been called.
Today the LLM is trusted to call them in order; declarative
prerequisites would catch mistakes structurally.

**Adoption cost.** Small (~200 LOC).
Same design question as step tracking: who declares the dependency,
the tool itself or the workflow?
Forge's answer is "the tool itself" (`ToolDef.prerequisites`).

### 5. Synthetic `respond` tool for proxy mode

The forge proxy injects a synthetic `respond(message="...")` tool
into every request so the model stays in tool-calling mode even when
the natural completion is a text reply.
The proxy strips the `respond` call from the response and renders it
as a normal text completion (`finish_reason: "stop"`) to the client.
ADR-013 (`docs/decisions/013-text-response-intent.md`) is the design
record.

Endo has no proxy-shape integration with external LLM clients today,
so this is an idiom forge developed in response to its specific
deployment pattern (sitting between opencode/Continue/aider and a
local llama-server).
Mentioned for completeness; likely not adoptable.

### 6. Backend auto-management and budget resolution

Forge's `ServerManager` (`src/forge/server.py`) can launch and
supervise the backend (llama-server, llamafile) as a child process,
resolve a context budget from one of:

- Backend-reported `/props` `n_ctx`.
- Manual override (`budget_tokens=...`).
- Hardware-derived tier (via `detect_hardware()` reading
  `nvidia-smi`).

The `BudgetMode` enum (`BACKEND`, `MANUAL`, `HARDWARE`) is the
explicit configuration surface.

Endo expects the user to start the backend out of band
(`packages/lal/local.env.example` and friends).
Auto-launching is feasible but tied to endo's daemon model (the
backend would become a daemon-owned process with its own pet name),
which is a different shape than forge's "library launches a
subprocess" pattern.

## What endo does that forge doesn't

### 1. Capability-based tool isolation

In endo, a tool is not a callable; it is a caplet (`Exo` or `Far`
object) with a method interface, a pet name, and a place in a
capability graph.
A guest agent receives tools via capability delegation (its host
adopts a capability into the guest's petstore) and the agent can only
invoke methods it has been granted.

Forge has no analogue.
`ToolDef.callable` is a Python function in the runner's address
space.
A misbehaving tool can read environment variables, open files, fork
processes, exfiltrate via `httpx`.

**Why forge might benefit.** Self-hosted agents running with broad
tool surfaces (filesystem read/write, shell, browser automation) are
where forge's "8B model wired up to real tools" pitch becomes a
deployment hazard.
A capability-style abstraction would let forge authors hand an agent
a `Shell` cap that is allowlisted to a directory, not raw subprocess
authority.

Whether forge wants to absorb this is a separate decision and not
this designer's call.

### 2. Persistent agent identity and capability survival

Endo agents live in a `@endo/daemon` and survive restart via the
`PINS` mechanism (`packages/fae/README.md` § "Restart survival").
A pinned driver caplet's formula ID is written to `PINS/`; on daemon
start, `revivePins()` re-imports the driver and restarts its inbox
loop with the same provider config and the same petstore.

Forge has no persistence.
A `WorkflowRunner` is per-process; on Python exit, all state vanishes
unless the caller serializes the conversation history themselves.

### 3. Inter-agent capability passing

Endo's `@endo/lal` and `@endo/fae` agents can adopt capabilities from
inbox messages (`packages/lal/README.md` § "tool calls to interact
with the Endo daemon").
An agent receiving a `Mount` capability from another agent gains
access to that subtree of the filesystem; no other agent has it.

Forge has no equivalent.
Each `WorkflowRunner` is a closed world; tool sharing happens by
copying the `Workflow` definition into a new runner.

### 4. CapTP message-passing and OCapN networking

The transport layer in `packages/captp`, `packages/ocapn`, and
`packages/netstring` carries object references across processes and
across hosts, with promise pipelining via `E()`.
Forge has HTTP only;
its proxy mode is an OpenAI-compatible REST API.

### 5. SES lockdown and hardened JavaScript

The realm shim and intrinsic taming
(`packages/ses`, `packages/init`, `packages/harden`, `packages/lockdown`)
are the foundation under everything endo does and have no Python
counterpart, primarily because Python's primordials are not as
prototype-graph-shaped as JavaScript's.

### 6. Compartment Mapper and module-level isolation

`@endo/compartment-mapper` (and the sister LavaMoat project) isolate
modules at the npm-package boundary with per-module endowments.
This is endo's deepest object-capability claim: a malicious transitive
dependency cannot reach `process` or `fs` unless its `package.json`
endows it.
Forge stands on `pip`'s flat dependency graph with no module-level
isolation.

### 7. Designs and roadmap discipline

`designs/` on `endojs/endo-but-for-bots@llm` carries 104 design
documents tracked against a six-milestone roadmap with calibrated
velocity estimates and a Gantt timeline
(`designs/README.md`).
Forge documents architecture and ADRs but does not maintain a
multi-milestone forward plan;
its release cadence is driven by eval-suite scores and per-model
ablations.

## Where the trust models clash

Forge's trust model is **ambient authority within a single Python
process**, with the only enforced boundary being the LLM client
adapter (so the runner sees parsed `ToolCall` objects, never raw
text).
A tool callable executes with the runner's full Python privileges.

Endo's trust model is **object-capability throughout**, with three
overlapping enforcement boundaries:
- The SES realm boundary (`@endo/init` + `lockdown()`).
- The Compartment boundary (per-module isolation, explicit
  endowments).
- The CapTP message boundary (cross-process, cross-host references).

A tool in endo is invoked only because the agent caplet holds a
reference to its method;
a reference exists only because some chain of authority delegated it.

**Verdict.** The two models are **compatible at the loop layer and
incompatible at the tool layer.**

The loop machinery (compaction, validation, step enforcement, retry
budgeting) is below the capability surface: it operates on message
arrays and `ToolCall` value objects, not on the caplets behind them.
Porting forge's `TieredCompact`, `ResponseValidator`, and
`ErrorTracker` into `@endo/lal` or a new `@endo/forge` package does
not violate ocap discipline; the imported code never sees a
capability, only the wire-format strings.

The tool-binding layer is different.
Forge binds `ToolDef.callable` to a raw Python function;
adopting `ToolDef` verbatim in endo would erase the capability
discipline that is endo's principal value.
The right adaptation is to keep forge's `ToolSpec` (the LLM-visible
schema) and replace `callable` with a method invocation on a caplet:
`E(toolCap).call(args)`.
That mapping is straightforward but it is a renaming and a binding
change, not a copy-paste.

There is no point at which forge's design *contradicts* endo's; the
clash is one of scope, not of philosophy.

## Recommendations

### Adopt as-is

None.
Forge is sufficiently different in language, dependency stack, and
trust model that no module ports cleanly without adaptation.

### Adopt with adaptation

1. **Type-tagged transcript messages.**
   Replace `@endo/lal`'s plain-dict transcript with a typed message
   record carrying `{ kind, stepIndex, originalKind, tokenEstimate }`
   metadata, mirroring forge's `MessageMeta`.
   This is a prerequisite for any compaction strategy and is also
   useful for the lal transcript-tree persistence work
   (`packages/lal/agent.js` already maintains a `leafNode` chain).
   Size: M. Land as a standalone design under `designs/` and reference
   forge's `MessageMeta` shape as prior art.

2. **Tiered context compaction.**
   Port the three-phase `TieredCompact` strategy into a new
   `@endo/llm-compact` (or as a module of `@endo/lal`).
   Drop forge's char/4 token heuristic in favor of whatever endo's
   provider stack reports.
   Replace `LAL_MAX_MESSAGES` with this once typed messages are in
   place.
   Size: M.

3. **Rescue-parse + retry-nudge pipeline.**
   Extend `extractToolCallsFromContent` to emit a structured nudge on
   failure and add an `ErrorTracker`-equivalent counter to the lal
   loop.
   Size: S.

4. **`ToolSpec`-style declarative tool schemas.**
   Endo's tools today are caplet methods discovered via CapTP
   introspection (`E(ref).__getMethodNames__()` per the project
   `CLAUDE.md`).
   Wrapping a caplet's method set in a forge-shape `ToolSpec`
   (name, description, parameter schema in JSON Schema) at the agent
   boundary would give the LLM a uniform tool-call shape regardless
   of which caplet hosts the method.
   Size: M.
   This is partly what `packages/genie/src/tools/` already does;
   formalizing the schema is the addition.

### Do not adopt, but note for future reference

1. **The synthetic `respond` tool (ADR-013).**
   Tied to forge's proxy deployment shape;
   endo has no equivalent integration target.
   Worth re-reading if endo ever ships an OpenAI-compatible gateway
   for external clients.

2. **`StepTracker` and `ToolDef.prerequisites`.**
   Useful patterns, but the question of "who declares the
   prerequisite graph" deserves its own design under endo's
   capability discipline.
   File a follow-up design rather than a port.

3. **`SlotWorker` (priority-queued single inference slot).**
   Endo serializes inference at the daemon-worker level via the
   factory pattern (`packages/fae`);
   forge's in-process priority queue is a different shape that
   doesn't compose with capability isolation.
   Note as an alternative model for scenarios endo does not currently
   target.

4. **Backend auto-management (`ServerManager`, `BudgetMode`).**
   Endo could absorb this as a daemon-owned subprocess, but the
   integration is daemon-shaped, not library-shaped.
   File a separate design if and when endo wants to manage the local
   model server lifecycle.

## Open questions

1. **Is endo's existing transcript-tree persistence
   (`packages/lal/agent.js` `leafNode` chain) compatible with
   forge-style compaction?**
   Compacting a transcript that is also the spine of a persistent
   reply chain is subtle: which node holds the compacted summary, and
   what happens to replies that branched from a node now elided?
   The maintainer is best placed to call this.

2. **Should a "forge-port" land in `@endo/lal`, in `@endo/fae`, or in
   a shared `@endo/llm-loop` package?**
   `@endo/lal` and `@endo/fae` both have a hand-rolled loop today
   (`runAgenticLoop` in lal; `spawnWorkerLoop` in fae's driver).
   A shared package would reduce duplication but would have to settle
   the differences in transcript shape between the two.

3. **Does the maintainer want a separate `forge` reference document
   under `journal/library/`?**
   The keyword-indexed library
   (`journal/library/keywords.md`, `journal/library/concepts/`) is
   the right place for cross-cutting design references.
   If "forge" becomes a recurring touchstone, a concept page would
   amortize the lookup cost.

4. **Is the forge proxy worth a deeper look as a prior-art reference
   for `designs/endo-gateway.md`?**
   The proxy shows one concrete shape (OpenAI-compatible REST
   passthrough with synthetic tool injection) that endo's gateway
   does not currently address.
   The shapes diverge, but the deployment problem (sitting between
   an external client and a local model server) is the same.

5. **Does the maintainer want a follow-up dispatch to scope a
   `@endo/forge-loop` package** (or whatever name fits the endo
   convention), or is this analysis sufficient as a one-off
   reference?

## References

### Forge

- Repository: https://github.com/antoinezambelli/forge
- Head SHA at read: `f1b87b05b863c7d12927f3dbdbd716af2dc3ace1`
  (tag `v0.6.0`, 2026-05-19).
- Key files: `src/forge/__init__.py`, `src/forge/core/runner.py`,
  `src/forge/core/workflow.py`, `src/forge/context/strategies.py`,
  `src/forge/guardrails/response_validator.py`,
  `src/forge/guardrails/step_enforcer.py`,
  `src/forge/guardrails/error_tracker.py`,
  `src/forge/core/slot_worker.py`, `src/forge/proxy/proxy.py`.
- Documentation: `docs/ARCHITECTURE.md`, `docs/WORKFLOW.md`,
  `docs/USER_GUIDE.md`, `docs/decisions/*.md`.
- Paper: Zambelli, A. *Forge: A Reliability Layer for Self-Hosted
  LLM Tool-Calling.* https://doi.org/10.1145/3786335.3813193.
- Stats at read: 542 stars, 26 forks, 4 open issues, MIT, last push
  2026-05-19.

### Endo

- `packages/lal/agent.js` lines 938-988
  (`extractToolCallsFromContent`) and 1336-1395 (`runAgenticLoop`).
- `packages/lal/README.md` (`LAL_MAX_MESSAGES`).
- `packages/lal/CLAUDE.md` (manager-loop architecture).
- `packages/fae/agent.js`, `packages/fae/driver.js`,
  `packages/fae/FAE-ARCHITECTURE.md`,
  `packages/fae/COMPARISON-FAE-LAL.md`.
- `packages/genie/DESIGN.md`, `packages/genie/src/tools/`.
- `packages/ses`, `packages/init`, `packages/harden`,
  `packages/compartment-mapper`, `packages/captp`, `packages/ocapn`
  for the substrate referenced in § "Where the trust models clash".
- `designs/endo-gateway.md` (related to forge's proxy shape).

## Prompt

> Please dispatch a designer to clone and develop a deep understanding
> of the design of https://github.com/antoinezambelli/forge and
> produce a gap analysis for Endo.
