# Genie Loop: Architecture

Detailed design for the four layered concerns introduced in
[`genie_loop_overview.md`](./genie_loop_overview.md) § "Proposed
architecture":

1. [Tool gate](#tool-gate)
2. [Tool registry](#tool-registry)
3. [Agent pack](#agent-pack)
4. [Specials dispatcher](#specials-dispatcher)
5. [IO adapter](#io-adapter)

Plus the cross-cutting concern:

- [Observer/reflector parity](#observer-reflector-parity)
- [Prefix choice](#prefix-choice)
- [Heartbeat ownership](#heartbeat-ownership)

## Tool gate

### Problem

`src/reflector/index.js` contains a module-private helper
`makeToolGate({ did, doArg })` that tracks whether the agent actually
called the tools we expected during a multi-attempt prompt loop.
The observer duplicates the same shape inline inside
`runObservation` (look for the `did` / `doing` booleans around line
388).
Neither the plugin (main.js) nor the dev-repl can reuse it because it
is not exported.

The current implementation also has three bugs that only happen to
be masked by low usage:

- `argVal === 'string' && argVal` should be `typeof argVal ===
  'string'` — the gate never records a successful call, so every
  reflection currently runs the full attempt budget.
- `args[argName] in did` checks the outer did-map rather than the
  per-tool one, so even with the `typeof` bug fixed the gate would
  look up paths against the wrong key set.
- `default: doing = ''` inside the event switch clears the in-flight
  doing-state on any intervening event (e.g. a `Message` during tool
  call), causing the matching `ToolCallEnd` to miss.

### Proposal

Move the helper into a dedicated module:

```
packages/genie/src/agent/tool-gate.js
```

exported from `@endo/genie` as `makeToolGate` alongside the other
agent-level helpers.

Generalise the argument-matcher so both the reflector's "path in a
set" and the observer's "path equals a constant" can use the same
shape:

```js
const gate = makeToolGate({
  memorySet: {
    argKey: 'path',
    expected: [OBSERVATION_PATH, REFLECTION_PATH],
  },
});
```

Return API (same as today, but with typed Generator and a `reset()`
for reuse across retries):

```ts
interface ToolGate {
  done(): boolean;
  update(event: ChatEvent): void;
  pending(): Iterable<[toolName: string, missingArg: string]>;
  reset(): void; // optional — clears "doing" state between rounds
}
```

Rewrite observer's inline gate as a call to the shared helper —
confirms the abstraction covers at least two real call sites.

### Options

| Option                  | Pros                                               | Cons                                              |
|-------------------------|----------------------------------------------------|---------------------------------------------------|
| A. Drop-in fix + export | Minimal churn; ships with phase 2                  | Keeps the awkward `did` / `doArg` split           |
| B. Redesign (above)     | Single config object, typed, eliminates duplicates | Slightly bigger diff; needs observer rewrite      |
| C. Skip generalisation  | Zero risk                                          | Leaves observer's dup and blocks reuse in main.js |

Recommend **B** — the bug fixes require a rewrite anyway, and the
reuse unlocks a clean reflector/observer symmetry.

## Tool registry

### Problem

Both entry points construct the tool registry by hand.
`dev-repl.js` builds `fileTools + memoryTools + git + bash + exec +
webFetch + webSearch` inline in `runMain`; `main.js` builds a nearly-
identical subset (no `git`, no `exec`) inside a closure-local
`buildTools`.
Adding a new tool or changing a default means touching both files and
keeping them in sync by hand.

### Proposal

Add `packages/genie/src/tools/registry.js` exporting
`buildGenieTools`:

```js
/**
 * @param {{
 *   workspaceDir: string,
 *   include?: Array<'bash'|'exec'|'git'|'files'|'memory'|'web'>,
 *   searchBackend?: SearchBackend,
 * }} options
 * @returns {{
 *   tools: Record<string, Tool>,
 *   listTools: () => ToolSpec[],
 *   execTool: (name: string, args: unknown) => Promise<unknown>,
 *   memoryTools: { memoryGet, memorySet, memorySearch, indexing },
 *   searchBackend: SearchBackend,
 * }}
 */
export const buildGenieTools = (options) => { ... };
harden(buildGenieTools);
```

Defaults: include `['bash', 'files', 'memory', 'web']` — i.e. the
plugin's current behaviour, with the shell tool limited to `bash`
only.
dev-repl passes `['bash', 'exec', 'git', 'files', 'memory', 'web']`.

`exec` and `git` are deliberately **not** on the plugin default.
They stay in the registry as example attenuations that demonstrate
how to grant narrower shell access than full `bash`; future
deployments that want a read-only or git-only guest can opt in via
the `include` list without forking the tool-build code.

Outputs intentionally mirror what dev-repl and main.js already
destructure locally, so the migration is mostly deletion.

### Scope creep to avoid

Do **not** try to abstract over "tool allow-lists by guest identity"
or "tools with pluggable policies" in this pass.
`git` already has a policy closure baked into `makeCommandTool`;
leave that alone.
The registry helper is just a dedup factor.

## Agent pack

### Problem

Both entry points independently spin up:

- the main `piAgent` via `makePiAgent`,
- (dev-repl only) a separate `heartbeatAgent`,
- an `observer` via `makeObserver`,
- a `reflector` via `makeReflector`,

and wire the memory tools / search backend through each constructor.
Changing the set of sub-agents means editing both files.

### Proposal

Add `packages/genie/src/loop/agents.js` exporting `makeGenieAgents`:

```js
/**
 * @typedef {object} GenieAgents
 * @property {PiAgent} piAgent
 * @property {PiAgent} heartbeatAgent
 * @property {Observer} observer
 * @property {Reflector} reflector
 */

/**
 * @param {{
 *   hostname: string,
 *   workspaceDir: string,
 *   tools: ReturnType<typeof buildGenieTools>,
 *   config: {
 *     model?: string,
 *     observerModel?: string,
 *     reflectorModel?: string,
 *     heartbeatModel?: string,
 *     dedicatedHeartbeatAgent?: boolean, // see "Heartbeat ownership"
 *   },
 * }} options
 * @returns {Promise<GenieAgents>}
 */
export const makeGenieAgents = async (options) => { ... };
```

### Lifecycle

`makeGenieAgents` does not own the loop — it just returns the bag
of agent references.
Callers supply the message dispatch and the event handling.
The pack's only responsibility is ensuring every sub-agent sees the
same `workspaceDir`, `tools`, and `searchBackend`, and that per-agent
model overrides are applied consistently.

### Model-override policy

Both deployments keep the same policy:
`model` is the baseline, and `observerModel` / `reflectorModel` /
`heartbeatModel` override per sub-agent when set.
The pack does **not** hard-code "main model for all" — dev-repl
exposes the same override surface as the daemon plugin's
configuration form, so operators can tune sub-agent models
independently in either deployment.
When only `model` is set (the common case today), every sub-agent
falls back to it.

### What stays outside

- Heartbeat interval scheduler (daemon-only — stays in main.js).
- Form provisioning for child guests (daemon-only).
- Background event printer (dev-repl-only; daemon has its own
  adapter — see [Observer/reflector parity](#observer-reflector-parity)).

## Specials dispatcher

### Problem

Both files implement prefix-based command dispatch with
subtly-different shapes:

- dev-repl:
  - prefix `.`,
  - handlers are `async function*` that yield rendered strings,
  - dispatch is a big `if/else` ladder with fallthrough to a
    `specials[head]` map for `heartbeat`/`observe`/`reflect`/
    `background`.
- main.js:
  - prefix `/`,
  - handlers are async blocks that call `reply()` directly,
  - dispatch is a big `if/else` ladder inside `runAgentLoop`.

Shared logic (e.g. "observe cycle currently running") lives twice,
and adding a new command to both deployments means two diffs.

### Proposal

Add `packages/genie/src/loop/specials.js` exporting
`makeSpecialsDispatcher`:

```js
/**
 * @template Chunk
 * @typedef {(tail: string[]) => AsyncGenerator<Chunk>} SpecialHandler
 */

/**
 * @template Chunk
 * @param {{
 *   prefix: string, // e.g. '.' or '/'
 *   handlers: Record<string, SpecialHandler<Chunk>>,
 *   onUnknown?: SpecialHandler<Chunk>,
 * }} options
 * @returns {{
 *   isSpecial(input: string): boolean,
 *   dispatch(input: string): AsyncGenerator<Chunk>,
 *   listCommands(): string[],
 * }}
 */
export const makeSpecialsDispatcher = (options) => { ... };
```

Provide a `makeBuiltinSpecials({ agents, io })` helper that returns
the `{ heartbeat, observe, reflect, help, tools, clear, exit }`
handlers.
Each entry point merges it with deployment-specific specials:

- dev-repl adds `background` (on/off/status).
- main.js could add `status`, `stop`, etc. later.

Handlers yield `Chunk` — a type parameter so dev-repl can yield
ANSI-coloured strings and main.js can yield `{ strings, blobs,
packages }` tuples for `reply()`.

### Prefix choice

**Decision**: keep `/` in daemon mail and `.` in the REPL for now.

The dispatcher is parameterised on `prefix`, so the default is just a
per-deployment constant; the machinery to change it is already there
if we need it later.

The open question behind the original action-item ("make sure we can
flexibly change to a different special character") was whether `/`
survives the endo mail path cleanly.
That is an empirical question: integration tests exercising the
specials dispatcher through a live daemon (once the shared loop
lands — overview step 5+) will show whether `/` is acceptable.
If an integration test reveals a problem — e.g. the daemon
mis-interprets `/foo` as a pathname or other routing token — we
revisit and either:

- switch the daemon prefix to something else (e.g. `:`), or
- surface the prefix as a per-deployment config option on the
  configuration form.

Until such a test fails, we ship the behaviour-preserving defaults.

### Why not just unify with a single prefix now?

Two reasons to defer the choice:

- Real users may type `/foo` naturally less often than `.foo` (URLs,
  file paths, sentence starts).
- Endo mail messages currently have no other reserved semantics at
  the start of a line; changing it has no forced-deadline.

Ship behaviour-preserving defaults, let integration tests surface
real problems, revisit only if needed.

## IO adapter

### Problem

The two entry points differ most strongly in their IO model:

- **dev-repl** reads lines from stdin (`readline`), writes rendered
  ANSI chunks to stdout, and signals the background printer via
  `onIdle` / `onBusy` callbacks.
- **main.js** iterates `E(agentPowers).followMessages()`, replies
  via `E(agentPowers).reply(number, strings, …)`, dismisses
  processed messages, and coalesces heartbeat messages.

### Proposal

Factor the shared loop into `runGenieLoop({ agents, specials, io })`
where `io` is an interface:

```ts
interface GenieIO<Chunk> {
  prompts(): AsyncIterable<InboundPrompt>;
  render(event: ChatEvent): Iterable<Chunk>; // ANSI or mail-chunks
  write(chunk: Chunk): Promise<void> | void;
  reply?(promptId: InboundPromptId, chunks: Chunk[]): Promise<void>;
  dismiss?(promptId: InboundPromptId): Promise<void>;
  onIdle?(): void;
  onBusy?(): void;
}

type InboundPrompt = {
  id: InboundPromptId; // readline: sequence; daemon: message.number
  text: string;
  kind: 'user' | 'heartbeat' | 'special';
  // daemon-only:
  from?: string;
  raw?: unknown;
};
```

`runGenieLoop` then:

1. Awaits the next prompt.
2. Classifies it: special-prefix? heartbeat? user?
3. Dispatches to the specials dispatcher or `runAgentRound` (with
   event streaming through `io.render` + `io.write` in the REPL
   case, or buffered-then-`io.reply` in the daemon case).
4. Calls `io.dismiss` (daemon) or no-op (REPL) on completion.

### Migration order

1. Introduce the `GenieIO` type + a dev-repl-backed adapter.
2. Migrate dev-repl to `runGenieLoop`.
3. Introduce the daemon-backed adapter (mapping `followMessages` /
   `reply` / `dismiss`).
4. Migrate main.js to `runGenieLoop`.

Only after both use the shared loop do we attempt the remote-mode
dev-repl — see [`genie_loop_remote.md`](./genie_loop_remote.md).

## Observer/reflector parity

The plugin currently:

- creates observer + reflector (good),
- calls `observer.check()` / `observer.scheduleIdle()` in the
  message loop (good),
- calls `reflector.checkAndRun()` after heartbeat (good),

but does **not** subscribe to their event streams.
All tool calls, thinking, and assistant text from observer,
reflector, and the heartbeat sub-agent are invisible to the daemon
operator.

### Proposal

Add a `makeDaemonBackgroundAdapter({ agentName })` in
`packages/genie/src/loop/daemon-background.js` that subscribes to
observer, reflector, **and the heartbeat sub-agent** and:

- logs one structured `[genie:main-genie:observer] ToolCallStart
  memorySet {...}` line per event at debug level, and
- optionally, when an explicit `/observe`, `/reflect`, or
  `/heartbeat` is in flight, forwards the events to the caller via
  `reply()` so the requesting human sees them in the conversation.

Keep it symmetric with dev-repl's `makeBackgroundPrinter`:

- all three sub-agents expose a `subscribe`-capable interface
  (heartbeat gains one as part of this work — see
  [Heartbeat ownership](#heartbeat-ownership)),
- all support mute/unmute while a caller-driven command streams,
- the daemon version just replaces "stdout with readline redraw"
  with "console.log + optional mail reply".

Factor the shared parts (the mute/unmute semantics, the event-
filtering used by `renderBackgroundEvent`) into
`packages/genie/src/loop/background.js` so both adapters get the
same filter rules.

## Heartbeat ownership

Currently:

- dev-repl: dedicated `heartbeatAgent` PiAgent, same config as main
  but separate state.
  Heartbeats do not pollute the user-visible message history.
- main.js: reuses the main `piAgent`.
  Heartbeats land in the main agent's state (context growth over
  time).

**Decision**: dedicated heartbeat agent (matching dev-repl), made
optional via `config.dedicatedHeartbeatAgent` (default `true`) so the
old shared-agent behaviour stays reachable for debugging.
The observer's `hwm`-based unobserved-message estimation then stays
clean by construction.

Trade-offs for reference:

- **Dedicated heartbeat agent** (chosen) — isolates heartbeat tool
  calls from user-visible context.
  Costs one extra PiAgent construction per spawn.
  Pro: the observer's serialisation of "unobserved messages" stays
  clean.
- **Shared agent** — one context, one history.
  Pro: debugging is easier because `piAgent.state.messages` is the
  whole story.
  Con: heartbeat tool calls expand the observer's view of what the
  user "said".

### Convergence toward observer/reflector shape

Beyond just isolating state, the heartbeat sub-agent should grow
toward the shape of observer and reflector:

- expose a `subscribe` API so the daemon background adapter can
  stream its `ChatEvent`s;
- render its tool calls and text through the same
  `renderBackgroundEvent` pipeline as observer and reflector
  (prefixed, e.g. `[genie:main-genie:heartbeat] …`);
- honour the same mute/unmute semantics when an explicit
  `/heartbeat` is in flight so the requesting caller sees the
  heartbeat's work inline in the conversation.

This gives daemon operators the same visibility into heartbeat
progress that they gain for observer and reflector under the
[Observer/reflector parity](#observer-reflector-parity) work, and
keeps the three "background" sub-agents uniform.

## Minimum viable refactor

If the full plan is too large to land in one pass, the minimum that
unlocks most of the value is:

1. Drive-by syntax fixes (main.js + dev-repl.js).
2. Extract + fix `makeToolGate`.
3. Extract `buildGenieTools` (plugin default stays `['bash']` plus
   the non-shell tools; `exec`/`git` remain example attenuations).
4. Subscribe the daemon to observer, reflector, **and heartbeat**
   events (console-log only; no mail relay yet).

Those four changes alone dedupe ~80% of the per-deployment
boilerplate and add visibility into sub-agent work in the daemon.
Remaining steps from the overview phasing (shared loop, specials
dispatcher, full parity) then become incremental cleanups.
Remote-mode dev-repl is explicitly out-of-scope for this refactor —
see [`genie_loop_remote.md`](./genie_loop_remote.md).
