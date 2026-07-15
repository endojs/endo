# `@endo/agent-tools`: code-mode tools, adapters, and parked JSON wrappers

| | |
|---|---|
| **Created** | 2026-06-03 |
| **Updated** | 2026-07-15 |
| **Author** | 0xpatrickdev (prompted) |
| **Status** | In Progress |

## Status

`@endo/agent-tools` is the self-sufficient home of everything a harness
consumes from the tool layer: tool records, the code-mode machinery, and
provider adapters.
The pi adapter is the first provider adapter; MCP, Codex, and Claude Code
adapters are planned.
The package is sufficient on its own to ship the code-mode tool through an
MCP server.

`@endo/agentry` is harness assembly only.
It owns `defineAgent`, model and credential resolution, presets, and evals.
The dependency direction is `@endo/agentry` → `@endo/agent-tools`.
`@endo/agent-tools` does not depend on `@endo/agentry`.

The model-facing code-mode tool is
`evaluate({ source, resultName? })`.
The name is deliberate: `execute` sounds like a shell command, while
`evaluate` converges with the daemon and Lal, whose tool is already named
`evaluate`.

The discrete JSON tool-call interface is implemented and kept, but parked
rather than being actively expanded.
This is the per-capability `makeTool`, `makeGitTool`, and `makeMountReadTool`
wrapper surface (and related wrappers) that an LLM drives by emitting one
JSON call per action.
The hard sub-problem of live capabilities crossing that JSON tool-call
boundary as arguments and results is part of this parked scope; see
[endojs/endo-but-for-bots#731](https://github.com/endojs/endo-but-for-bots/issues/731).

## Charter and layering

The package charter has two complementary parts.
The parked JSON wrappers remain the provider-independent record layer for
hosts that need one JSON call per action.
The active code-mode layer gives a harness one host-independent `evaluate`
tool record, declarations for the capabilities it may use, and adapters for
the provider that carries the record.

The code-mode tool record, its prompt declarations, and its provider adapters
are host-independent.
The record is hosted by one of two backends, both implemented in
`@endo/agent-tools` and both dependency-free at runtime.
`makeCompartmentEvaluate` evaluates in an in-process SES `Compartment`, with
no daemon, credentials, or network authority.
It is the host for evals, CI, tests, and the standalone MCP demo, and its
results live only as long as the process.
`makeDaemonEvaluate` forwards the tool to a daemon's `evaluate` through a live
powers reference.
It imports neither `@endo/daemon` nor a daemon implementation, and obtains
durable results through formula capture, pet-name storage, resume, mailbox,
and remote messaging.
The daemon host is the intended host for real agent use.

The `resultName` field is conditional on storage authority.
`EVALUATE_PARAMETERS` includes `resultName` only when a store power is
supplied.
The daemon host supplies that power, while the in-process host defaults to
`{ source }` only.
An explicit store, including a small in-memory map for light tests, re-enables
the parameter through the `storeValue(valueOrPromise, nameOrPath)` hook, which
matches the daemon's existing verb.

The model-facing name and implementation seams follow this decision:
`makeEvaluateTool`, `EVALUATE_PARAMETERS`, `makeCompartmentEvaluate`,
`makeDaemonEvaluate`, and the function type `Evaluate`.

## Target package layout

The target layout keeps the code-mode growth surface visible and keeps the
provider boundary inside `@endo/agent-tools`:

```text
packages/agent-tools/
├── src/json-tools/              # parked JSON wrappers: git, git-mount, fs, shell, http
├── src/code-mode/               # evaluate-tool, compartment, daemon, declarations
├── src/code-mode-globals/       # CodeModeGlobal descriptor factories: git, fs
├── src/adapters/                # pi and SmallCaps renderer; MCP/Codex/Claude Code planned
└── generated/code-mode-globals/ # checked-in generated declaration artifacts
```

`src/code-mode-globals/` is the growth surface for per-capability
`CodeModeGlobal` descriptor factories.
HTTP, timer, and additional capability descriptors are planned there.
The checked-in artifacts under `generated/code-mode-globals/` mirror those
factories and are regenerated as part of code generation.

Agent-tools owns the per-capability declaration bundles and descriptor
factories.
Agentry keeps final system-prompt assembly, so the tool package supplies
prompt fragments without taking ownership of the complete harness prompt.

Provider adapters are scoped exports from `@endo/agent-tools`.
The SmallCaps tool-result renderer relocates here from agentry as
`adapters/smallcaps.js`.
The former rule that agent-tools must not depend on marshalling is deliberately
dropped because this renderer is part of the provider-independent tool layer.

## What is the Problem Being Solved?

The repository grew five agent-tool surfaces (fae, lal-on-`llm`, lal as
proposed for the eval harness, genie, and the pi-agent-core `AgentTool`
contract) across two paradigms.
fae and lal-on-`llm` hand-author full OpenAI-function JSON `parameters`
and ship them verbatim to the model.
genie and the eval-harness lal author `@endo/patterns` matchers and use
them for runtime validation only.
For the retained JSON/MCP layer, neither paradigm gives an agent-builder a
single attenuable **tool shape**: one canonical tool record, a way to bind
each tool's behavior to host authority or to a confined capability, and a
uniform set of attenuation levers (read-only, subtree, git verb tiers) that
narrow what a tool can reach.

The maintainer's decision is to keep genie's `@endo/patterns`
**method-guard** tool shape as the canonical record for the parked JSON
layer.
This design records `@endo/agent-tools`: the retained JSON tools and the
active code-mode machinery, declarations, and adapters that surround them.
The method-guard `makeTool` record, the `Filesystem`-targeted file tools,
the confinement axis and its attenuation levers, and the git authority
tiers remain the package's MCP-consumable shape.
Code mode is the primary agent surface: its single
`evaluate({ source, resultName? })`
tool composes confined operations against petname-bound capability globals.
The consuming agent-builder (`@endo/agentry`'s `defineAgent`) is a
separate design ([agentry-agent-builder](agentry-agent-builder.md)).

The filesystem substrate is settled and is not re-opened here.
File tools target the `@endo/platform/fs/extended` `Filesystem`
interface, which presents both a live worktree (`mountAsFilesystem(mount)`)
and any historical git ref (`Git.filesystemAt(ref)`), with `readOnly()`
as uniform attenuation ([endo-fs-backend-seam](endo-fs-backend-seam.md),
[endo-fs-from-git](endo-fs-from-git.md)).
The retained JSON layer consists of the records, the confinement bindings,
and the attenuation levers.

## Background

Two facts ground the design.

**Genie's `makeTool`.**
`packages/genie/src/tools/common.js` defines a method-guard-first tool
factory: `schema` is a `@endo/patterns` MethodGuard
(`M.call(...).returns(...)`).
It calls `getMethodGuardPayload(schema)` to destructure
`{ argGuards, optionalArgGuards, restArgGuard }`, forms a positional
`paramsPattern` via `M.splitArray`, and validates each call with
`mustMatch(harden([args]), paramsPattern, ...)`, wrapped in a fixup loop
(null to undefined for LLM-emitted optionals, one JSON-string-parse retry
for small models that emit nested structures as strings).

**The narrow bigint coercion.**
`coerceBigintArgs(args, bigintArgs)` (regex `^[+-]?\d+$` to `BigInt`,
copying every non-bigint field verbatim) is the review-correct narrow
coercion that replaced lal-on-`llm`'s full SmallCaps marshal.
The full marshal silently reinterpreted any LLM string with a SmallCaps
prefix (a phone number `"+15551234567"` became a `BigInt`), the footgun
the review flagged.

The pi-agent-core harness contract is given in the sibling design
([agentry-agent-builder](agentry-agent-builder.md) § Background): a `Tool`
carries `parameters` as a TypeBox `TSchema` (which is also a JSON Schema),
and `prepareArguments` is the sanctioned home for the inbound coercion and
the LLM-JSON fixups, run before validation.

## The tool record

The canonical shape, lifted from genie and reconciled across the git tools
and the filesystem read tool (PR #523):

```ts
ToolRecord = {
  name: string;
  description: string;
  parameters: object;   // the JSON Schema used as LLM `parameters`
  inputSchema: object;  // the same JSON Schema, used as MCP `inputSchema`
  invoke: (args: Record<string, unknown>) => Promise<unknown>;
};
```

`makeTool(spec)` is the one factory that produces the retained JSON record.
The `spec` carries a one-line description, the `@endo/patterns`
MethodGuard, the `bigintArgs` field-name list, and the invocation body.
`makeTool` consumes the MethodGuard two ways: as the runtime validation
pattern (`mustMatch`) and as the exo interface guard.
`invoke` validates the supplied args against the guard, then calls the
invocation body.
Tools are always called with one args object, so `argGuards` is length-1
(`[M.splitRecord(required, optional)]`) and the validator reads that
single record pattern.

`bigintArgs` names the fields decoded from their string-encoded form
before validation.
The decode is `coerceBigintArgs`, mapped onto pi-agent-core's
`prepareArguments` hook so it runs before `mustMatch`, alongside the
LLM-JSON fixups (null to undefined, one JSON-string-parse retry).
The pairing is load-bearing: the wire schema names a bigint field as
`{ type: 'string', pattern: ... }` and `coerceBigintArgs` is the decode
that turns that string back into a `BigInt`.
Two halves of one contract; neither stands alone.

## The confinement axis: how a tool's behavior is bound

The retained JSON tool *record* is one shape regardless of what the tool does.
What splits that parked surface is **what each tool's behavior is bound to**,
and the axis is binary: a tool either closes over a `Spawner` holding the
host's ambient authority (**unconfined**), or it closes over a
`@endo/patterns` capability that holds no path and reaches no further than
its grant (**confined**).

| Confinement | Behavior closes over | Authority it holds | Attenuation is a... |
|---|---|---|---|
| **unconfined** (`Spawner`) | a `Spawner` plus policy closures, called with a path *string* | the host process's ambient authority; the path string is advice, not a boundary | **policy closure** (`rejectPatterns`, `rejectFlags`, `enforcePath`) vetoing the command before spawn |
| **confined** (capability) | a `Filesystem`, an exo `Git`, and/or a bounded `GitRemote`, each holding **no path** | only what the granted caps reach: no path outside the `Filesystem` subtree, no raw `git` exec, no network except through `GitRemote` | **capability operation** (`readOnly()` returns a narrowed cap; an absent method, for example no `push` on a plain `Git`) |

The unconfined side is genie today: a command tool over the `Spawner`
seam, holding the process's ambient authority and attenuating by
inspecting the command string.

**The confined capabilities describe one operator-provided workspace.**
Code mode is the primary driver for workspace work: it receives the
petname-bound globals it is granted and composes operations in confined
JavaScript.
The parked JSON tools provide a discrete, MCP-consumable shape over the
same capabilities when a host needs that adapter boundary.
`Filesystem` and `Git` can describe the same worktree: `Git.filesystemAt(ref)`
*returns a `Filesystem`*, so history reads use a `Filesystem` that `Git`
produced; and `GitRemote` ([daemon-git-remotes](daemon-git-remotes.md)) is
the bounded `pull` and `push` capability associated with that `Git`.
A host can grant these capabilities together or separately according to the
code-mode session's endowments.

The invariant that makes this tractable: the method guard and the wire
schema are **identical regardless of confinement**.
Only the binding and the attenuation lever differ.
On the confined side the backing can even vary by environment (the
`Git` / `Filesystem` cap implementation swaps between browser and server)
while the tool record and the LLM's view are unchanged.

## Filesystem-targeted file tools

A retained JSON file-tool set (read, list, edit, stat) over the
`@endo/platform/fs/extended` `Filesystem` interface.
It is a parked, discrete shape; code mode is the primary way to drive a
workspace and calls its confined capability globals directly.
The tools hold a `Filesystem` capability, not a path string and not `fs`;
confinement, symlink-escape rejection, and fail-closed revocation are the
`Filesystem` mount's structural guarantees, not the tool's.

The same retained set reads the live worktree and history uniformly, because
`mountAsFilesystem(mount)` and `Git.filesystemAt(ref)` both present the
**same** `Filesystem` cap.
The tools call the `Filesystem` exo surface (`walk`, `Directory.list`,
`File.read` / `write`, `Node.getStat`) and do not know which backing
produced the cap.
A read-only agent gets a `readOnly()`-attenuated `Filesystem`: the same
read, list, and stat tools work, and edit fails closed at the cap.

PR #523 settled the export shape for this retained JSON/MCP layer.
`makeMountReadTool` was once a standalone `{ schema, body, help }` island that
could not pass `toPiAgentTool`; it now builds through `makeTool` and emits
the canonical `ToolRecord`, at parity with the git tools.
The behavior it preserved (chroot-to-subtree, `maxChars` truncation,
slash normalization, rejection of `../` escapes through the capability) is
the right model for the rest of the file tools.

Inherited mount limits, adopted knowingly (see
[endo-fs-backend-seam](endo-fs-backend-seam.md) § "Removed from base
interface"): no partial-range I/O at the mount backing (whole-file read
via `read(path)`; a bounded slice is the caller's concern), no xattrs or
real OS locks or filesystem events, and file-vs-directory kind via the
`Filesystem` `kind(path)` method rather than a `stat` mode.
These are limits of the substrate, not gaps this design closes.

## Wire schemas and the code-mode declaration renderer

Each tool pairs a **hand-authored** wire schema with its live method
guard, and a property-based **divergence gate** proves the two accept and
reject the same inputs.
A `Pattern → JSON Schema` deriver that would generate the wire schema from
the method guard is **tabled** as a possible future convenience, not the
package's load-bearing export.
The reason is the description problem below: a derived schema has correct
shapes but empty descriptions, the author has to hand-type the
descriptions regardless, and hand-typing the small stable wire schema
beside them removes a moving part.

Whichever way a wire schema is produced, it honors one **deliberate
contract** for the hard cases that a naive matcher-to-JSON mapping gets
wrong:

1. **bigint to string plus pattern, never integer.**
   JSON has no bigint.
   The honest mapping is `{ type: 'string', pattern: '^[+-]?\\d+$' }`,
   paired with `coerceBigintArgs` on the inbound side.
   Emitting `{ type: 'integer' }` would re-open the SmallCaps and
   JSON-number ambiguity the review killed: the model would emit a JSON
   number and the narrow coercion would have no string to key on.

2. **`M.or(X, M.undefined())` to optional, not `oneOf`.**
   The undefined arm means "this field is optional," so emit the schema
   for `X` and drop the key from `required`.
   Emitting `{ oneOf: [X, undefined] }` would mislead the model into
   treating a sentinel undefined as a legal value.

3. **remotable or promise to petname string.**
   A capability is not JSON.
   The LLM passes a **petname string** the tool resolves via
   `E(powers).lookup(petname)` against the guest petstore, mapped to
   `{ type: 'string', description: 'petname of a ...' }`.
   This is settled (see *Capability arguments are petnames* below): no
   bespoke opaque handle, no in-memory cap map as a system of record.

4. **descriptions, because matchers carry none.**
   The model performs markedly better with per-property descriptions, and
   matchers hold no human prose, so the description has to come from the
   author (or a sidecar, or a tuned source) regardless of whether the
   shape is derived.
   This is why deriving the shape buys little: descriptions are the
   sneaky-hard part, and they are not derivable.

5. **parameter names, never `arg0` / `arg1`.**
   Method guards carry no argument names.
   A derived tool advertises author-written method-derived names, the same
   place the descriptions live.
   The single-args-object convention supplies real keys for the common
   case; the `arg0` hazard is only for a positional guard.

**Code mode shipped the practical half of this contract (PR #524).**
Code mode runs any exo invoked through `evaluate`, so it needs the model to
know each global's methods up front rather than discover them at runtime
with `E(cap).__getMethodNames__()`.
PR #524 generates TypeScript declarations for the `git` and `fs`
code-mode globals at build time.
Agent-tools supplies the resulting declaration bundles as prompt fragments;
agentry performs final system-prompt assembly.
The renderer is generic and exo-agnostic, exporting **both** paths:

- a **type to declaration** renderer (the `typescript` compiler API
  printing over a `.d.ts`), and
- a **guard to declaration** renderer (an `M.interface` walker).

The per-capability specifics live in `src/code-mode-globals/` descriptor
factories.
`git` is **TS-canonical**: the `typescript` API prints the `EndoGit`
alias from `packages/exo-git/types.d.ts` (full-fidelity hand-written TS).
`fs` is **guard-walked**: the FS `.d.ts` is a deliberate
four-method stub, so the renderer walks the `@endo/platform/fs/extended`
interface guards (`FilesystemInterface` plus the remotables it reaches:
`Directory`, `File`, `OpenFile`, `Cursor`), the richest available source.
**Neither renderer is canonical**: interface guards are lossy as a type
source (they carry no argument names and no prose), so the TypeScript path
stays valuable where a hand-written `.d.ts` exists.
Guard-canonical *derivation for git* was considered and is **tabled**: it
is unproven and would discard the more expressive hand-written TS.

The **divergence gate is the load-bearing safety property**.
`test/code-mode-types.test.js` asserts the git declaration enumerates
exactly the `GitInterface` guard methods, that the read-only variant is a
mutator-free subset (it does not leak the full surface back through
`readOnly(): EndoGit`), and that `fs` members are a subset of the
`FilesystemInterface` guard.
This keeps the prompt's advertised surface from drifting wider than the
enforcement layer.
Printing happens at build time, so `typescript` stays a dev-only
dependency and never enters the runtime trust base.
The provider-facing SmallCaps renderer is a separate runtime adapter under
`src/adapters/`.

One wire schema serves both targets: the same JSON-Schema object is
`Tool.parameters` (the TypeBox `TSchema` pi sends the provider) and the
MCP `inputSchema` an MCP client renders.
A reverse `JSON Schema → Pattern` deriver (the import path for an external
MCP server's tools, or a hand-authored-JSON harness wanting `mustMatch`
validation) is **deferred until needed**; the method-guard-first
architecture needs only the forward direction first.

## Attenuation model

Lifted from genie's registry and policy machinery.
These are the attenuation primitives retained for the parked JSON/MCP
surface; code mode receives the corresponding narrowed capabilities as
endowments.
The levers split by confinement:

- **Unconfined (`Spawner`).**
  Attenuation is a **policy closure** inside the command tool:
  `rejectPatterns`, `rejectFlags`, and `enforcePath` veto the command
  string before it reaches the `Spawner`.
  Read-only here is a flag the tool enforces by inspection.
  genie ships `git` (network-git banned via a policy closure) and `exec`
  as "registered but off by default" example attenuations, kept here as
  shipped examples of narrower-than-bash command tools.

- **Confined (capability).**
  Attenuation is a **capability operation**, not a tool flag.
  `Filesystem.readOnly()` returns a structurally narrowed `Filesystem`;
  `Git.readOnly()` a narrowed `Git`; the mutating method fails closed at
  the cap, not at the tool.
  The same read, list, and stat tools run unchanged against the narrowed
  cap, and edit has no method to call.
  Subtree rooting is structural too: the `Filesystem` is rooted at a mount
  subtree and no method returns a reference outside it.
  A code-mode session can receive these caps together over one workspace, so
  attenuating one (read-only files) does not disturb the others (`git status`
  and `diff` still work).

So "read-only" means two different things: a flag the unconfined tools
check, but a *different cap* the confined tools are handed.
Conflating them hides the least-authority payoff that the confined tool
holds a cap, not a path.
The attenuation *primitives* (the policy closures, the `Spawner` type, the
`readOnly()` use, the `GitRemote` grant) live here; the attenuation
*configuration* (which agent gets which cap at which attenuation) is
`agentry`'s `defineAgent` concern.

## Git authority tiers

Inside the retained confined tool surface there is a finer **verb** axis
that carves the git surface into three tiers: **read**, **write**, and
**push**.
It is orthogonal to confinement and orthogonal to the object-granularity
(capref) axis: a capref names an object (by petname), a tier names a verb
class.

**Read and write are one cap, one factory.**
`makeGitTool(gitCap)` builds the tools for a local `Git` cap and returns
a `ToolRecord[]` for the parked JSON/MCP surface.
Code mode instead receives the local `Git` cap as a global and composes its
operations through `evaluate`.
The read-only tier is **not a separate factory**: it is the same
`makeGitTool` fed a `readOnly()`-attenuated `Git`.
`makeGitTool` consults `isGitReadOnly(gitCap)` (already exported from
`@endo/exo-git`) and, when the cap is read-only, **omits the write slice**
(`commit` / `createBranch` / `switchBranch` / `add` / `restore`), so a
read-only cap never advertises a write tool to the LLM.
Previously every write tool was built and shown even on a read-only cap,
failing closed at the exo's `assertWritable` only at invoke time: safe,
but it burned a turn per attempt and implied write authority the cap did
not hold.

The filter is driven by a build-time `scope: 'read' | 'write'` tag on each
tool's schema **record**.
`scope` is **build-time only**: it decides which tools are constructed for
a given cap and is never copied onto the wire schema the LLM receives, so
the tool set is fixed at construction (static per session) and the LLM
sees the same schema shape for a tool whether or not its sibling write
tools were filtered out.

**Push is a structurally separate tier.**
Push (`fetch` / `pull` / `push`) is not a method on the local `Git`; it
lives on a separate `GitRemote` cap composed from a writable `Git`, an
HTTPS transport, and a non-extractable credential
([daemon-git-remotes](daemon-git-remotes.md)).
Its seam is a sibling `makeGitRemoteTool(remoteCap)`; the retained JSON
surface does not currently include that wrapper.
The `GitRemoteController` policy facet stays host-side and is never an
agent-facing tool: the agent receives a pre-scoped `GitRemote`, so push
authority is grant-gated, not negotiated by the agent.
A read-only `Git` cannot construct a `GitRemote` at all, so the read tier
structurally excludes push.

## Capability arguments are petnames

A capability argument in the retained JSON layer (a git repo, a filesystem
map, or any remotable the LLM must *name* rather than *spell out*) is carried
on the wire as a **petname string** and resolved against the guest's own
petstore.
Code mode uses the same petnames as its endowment binding names.

**The JSON LLM-facing surface is a petname, never an opaque handle.**
A petname is a friendly host-assigned camelCase identifier (`gitReadOnly`,
`endoRepo`, `gardenRepo`).
There is no `cap:<hex>` opaque handle and no handle-registry indirection;
the model utters the same friendly name a human would, and the wire schema
for a capref-typed arg is `{ type: 'string', description: 'petname of a
...' }`.

**Resolution is the guest petstore, fail-closed.**
A capref-typed arg resolves via `E(powers).lookup(petname)`.
`lookup` walks the guest directory's petstore
(`packages/daemon/src/pet-store.js`), and the daemon directory **throws on
an unknown name**, so an unrecognized petname fails closed rather than
silently resolving to nothing.
This is exactly what every lal tool already does (`packages/lal/agent.js`:
the `lookup`, `inspect`, and `readText` cases); agent-tools adopts that
idiom verbatim.
There is **exactly one resolution path**: the retained JSON layer is used in
the context of an endo daemon, with no second backend and no parallel
in-memory map standing in for the store.

**Binding is host-side, never the LLM.**
The host binds a petname with `E(powers).storeIdentifier(petname,
capFormulaId)` (for a formula-backed cap) or `E(powers).storeValue(value,
petname)` (for a passable, which marshals the value into a `marshal`
formula and then stores that id).
The store outlives any single tool call.
Timing differs by harness, the surface does not: **lal front-loads** every
bind at sub-guest creation (the existing `primer` pattern: bind the cap's
formula id into the fresh sub-guest before the loop starts), while **fae
accretes** names at runtime via `adopt` as caps arrive in its inbox.
Both end in a name in the guest petstore that `E(powers).lookup` resolves.

**`powers` is threaded at construction, not supplied by the LLM.**
The host passes `powers` at tool-set construction and each tool closes
over it, the same way lal's `make(powers)` entry point receives `powers`
once.
A capref arg's value is a *string* (the petname); the held `powers` is
what turns that string into a live cap via `lookup`.
At invoke time, before `mustMatch` sees the args, a `resolveArg` step
replaces each capref string with `await E(powers).lookup(petname)`,
leaving plain-value args untouched, so the guard validates the resolved
cap shape.

**One petstore, two granularities.**
The primary interaction mode is **code mode** (a single
`evaluate({ source, resultName? })` over a set of endowments).
The retained JSON layer is a discrete, per-call mode for hosts that need
that adapter boundary.
Both resolve through the one guest petstore and differ only in granularity:

| Mode | Granularity | In (arg to cap) | Out (cap to name) |
|---|---|---|---|
| **JSON tool mode (parked)** | per call | a capref arg's petname to `lookup` at the invoke boundary | a returned cap to `storeValue` to a petname |
| **code mode** | per session | globals resolved by petname at `Compartment` setup, endowed once for the turn | a result stored under a `resultName` |

The petstore is the **system of record** in both modes; only the moment of
resolution moves.
The principle that unifies them: **petname-for-caps** (the system of
record: every capability is a name in the guest petstore) and
**SmallCaps-for-data** (the wire and display encoding for plain passable
data) are complementary, not competing.
A cap is named; plain data is encoded; neither does the other's job.

**One string, one case (camelCase), no transform anywhere.**
The petname is the single identifier: the name the LLM utters **is** the
petstore key **is** the code-mode endowment binding name.
A camelCase petname is already a valid JS identifier, so the same string
serves both modes with no transform.
Never derive a second form.
The anti-pattern to avoid is a lossy kebab-to-camel transform that yields
two names for one cap.

**An in-process cache is an optimization, not an architecture.**
A tool may memoize resolved caps in a `Map` keyed by petname to skip a
repeated `lookup`, but that cache is a defer-until-measured latency
optimization layered over the petstore, never the system of record, and
never a parallel resolution backend.

**Tests bind through the real daemon.**
A test must not stub the petstore with a hand-rolled `Map`.
It spins up a real daemon-backed guest (`prepareHost` plus
`E(host).provideGuest(...)`), binds petnames through the same
`storeIdentifier` / `storeValue` the host uses in production, then lets the
tool resolve them via the live `lookup`.
This reuses the production resolution path end to end with no test-only
registry to drift from the shipped mechanism.
Daemon-backed tests are `test.serial`.

## Persisting a cap-bearing result across turns

Code mode runs multiple turns per thread, so a result one turn produces (a
workspace location the agent wants to revisit) must survive into the next
turn.
Three rules govern how to persist it.

1. **Prefer (an already-formula-backed cap as a petname) plus (plain data),
   then reconstruct, over inventing a storable cap-bearing value.**
   A workspace location is a pointer into a mount that already has a
   formula.
   Persist the mount as a petname (it already binds via `storeIdentifier`
   / `storeValue`) and the path as plain data, then reconstruct next turn
   via `E(mount).entry(path)`.
   The mount **re-clamps** the path to its own root, so the path string is
   never trusted as authority: it is plain data the mount re-authenticates.
   This is cheaper than minting a storable value and it removes the
   serialization attack surface entirely.

2. **Any descriptor that serializes must not carry recoverable authority.**
   Never slot a live cap into a serialized descriptor: that turns an inert
   descriptor into a handle, and even a read-only mount slot leaks
   whole-worktree observation.
   Never trust caller-authored data fields (for example path segments) for
   authority: a record like `{ mountGrant, segments, displayPath }` that
   checks only `lineageOf(mountGrant)` and then trusts caller-visible
   `segments` is **forgeable**.
   Authenticate by **private object identity** (an inert Exo plus a
   daemon-side WeakMap) or by an opaque, methodless, path-bound marker the
   daemon binds privately.

3. **Mint a formula node only for a value that is genuinely a capability
   with its own identity and lifetime, never for a derived view over a cap
   that already exists.**
   A `Formula` type, a `formulate*` entry point, and a maker give a value
   its own formula id, direct `lookup`-ability, and restart-survival, plus
   independent identity and lifetime.
   A workspace location is data, not a node, so it does not get a
   `formulateMountEntry`.

The worked example is `EndoMountEntry`, which `llm` already ships the
secure way: within a turn it stays an inert `makeExo('EndoMountEntry')`
descriptor authenticated by a private daemon-side `mountEntryRecords`
WeakMap that recovers both provenance and path by object identity, and it
never serializes.
The net-new piece is the code-mode persistence wiring (store the mount
petname and path, re-endow next turn), not a new entry substrate.

## Design Decisions

1. **Method-guard tool record, not hand-authored OpenAI JSON.**
   One canonical retained JSON `ToolRecord` (`makeTool` over a MethodGuard)
   for every parked JSON tool.
   lal-on-`llm`'s hand-authored `parameters` survive only as the lesson
   "ship a real wire schema," which this package delivers by
   hand-authoring the wire schema alongside the guard and keeping the two
   honest with a divergence gate.

2. **The wire schema is hand-authored, pinned to the live guard by a
   divergence gate; the deriver is tabled.**
   Descriptions are hand-typed regardless, so auto-deriving the shape buys
   little.
   The code-mode declaration renderer (PR #524) is the shipped instance of
   this: build-time codegen, two renderers (TypeScript for `git`, guard
   walker for `fs`), neither canonical, gated against the guards.

3. **bigint is a string-encoded field, decoded by `coerceBigintArgs`.**
   Never emit `{ type: 'integer' }`.
   The schema names the field; the runtime decode runs in the provider
   adapters owned by `@endo/agent-tools`.

4. **File tools target `@endo/platform/fs/extended` `Filesystem`, not
   genie's VFS.**
   The retained JSON tool set reads the live worktree and history through the
   same cap with `readOnly()` as uniform attenuation.
   PR #523 reconciled `makeMountReadTool` onto the canonical `ToolRecord`
   so it is pipeline-compatible with the git tools.

5. **Tool machinery here; harness assembly in `agentry`.**
   This package keeps the levers (read-only, subtree, policy and spawner
   command tools) for the parked JSON/MCP surface, and it owns the code-mode
   hosts, declarations, and provider adapters.
   `defineAgent` composes the harness, resolves models and credentials,
   selects presets, runs evals, and assembles the final system prompt.

6. **One git-tool factory across read and write; `scope` is build-time
   only.**
   `makeGitTool(gitCap)` serves both tiers; the read-only tier is the same
   factory fed a `readOnly()` cap.
   It consults `isGitReadOnly` and omits the write slice for a read-only
   cap, driven by a build-time `scope` tag that never reaches the wire.
   Push (`makeGitRemoteTool` over a `GitRemote`) remains a separate tier in
   the design record; the JSON surface is parked rather than expanded into
   it now.

7. **Capability args are petnames resolved against the guest petstore.**
   A capref-typed arg is a camelCase petname string on the wire, resolved
   via `E(powers).lookup` (fail-closed on an unknown name).
   The host binds petnames with `storeIdentifier` / `storeValue` at
   provisioning (lal front-loads via the `primer` pattern; fae accretes via
   `adopt`); the LLM never binds.
   Exactly one resolution path: no opaque `cap:<hex>` handle, no parallel
   in-memory map as backend, an in-process cache only as an optimization
   over the store.
   The petname is the single identifier (LLM-uttered name = petstore key =
   code-mode endowment name).
   `powers` is threaded at construction.
   Tests bind through the real daemon, never a hand-rolled `Map`.

8. **Persist a cap-bearing result as (existing-cap petname plus plain data)
   and reconstruct; never let an inert descriptor carry authority.**
   A workspace location is (mount petname plus path), reconstructed via
   `E(mount).entry(path)`, where the mount re-clamps the path.
   Authenticate any serialized descriptor by private object identity (the
   inert Exo plus daemon WeakMap `llm` already ships for `EndoMountEntry`),
   never a caller-authored field.
   Mint a `formulate*` node only for a value with its own identity and
   lifetime.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [agentry-agent-builder](agentry-agent-builder.md) | Harness assembly design whose `defineAgent` builder consumes `@endo/agent-tools`, resolves models and credentials, selects presets, runs evals, and assembles the final system prompt. |
| [endo-gateway-mcp](endo-gateway-mcp.md) | MCP adapter for the retained tool shape; the Gateway consumes each tool's `inputSchema` wire schema here. |
| [daemon-agent-tools](daemon-agent-tools.md) | Capability-scoped workspace model with file tools, `Git`, and bounded `GitRemote` over one operator-provided workspace, recording the retained filesystem and command-tool shapes over those capabilities. |
| [daemon-mount-capabilities](daemon-mount-capabilities.md) | The `EndoMount` surface (`readOnly()`, `entry(path)`) that backs the confined `Filesystem` binding via `mountAsFilesystem(mount)`. |
| [daemon-git-remotes](daemon-git-remotes.md) | The bounded `GitRemote` (local `Git` plus authorized HTTPS transport plus non-extractable credential) supplying the push tier. A read-only `Git` cannot construct a `GitRemote`, so push authority is grant-gated. |
| [endo-fs-backend-seam](endo-fs-backend-seam.md), [endo-fs-from-git](endo-fs-from-git.md) | The `Filesystem` substrate the file tools target (`mountAsFilesystem`, `Git.filesystemAt(ref)`, `readOnly()`) and the source of the inherited mount limits. |
| [agent-tools-mount-fs-tools](agent-tools-mount-fs-tools.md) | **Superseded.** Its `makeMountReadTool` over raw `MountInterface.readText` is replaced by the `Filesystem` read tool reconciled onto the canonical `ToolRecord` in PR #523. The security framing carries over. |

## Open Questions

1. **Tool record: exo-wrapped vs plain record.**
   genie's tool is exo-guarded; the eval-harness lal uses a plain record.
   Does the package ship one shape or both?
   The guard works either way.

2. **Description sourcing.**
   The descriptions matchers cannot carry have to come from somewhere: a
   structured parse of `help()` prose, a per-tool sidecar map, or a tuned
   source from the optimizer.
   Each trades author ergonomics against derivability.

3. **Strict mode and `additionalProperties: false`.**
   OpenAI strict function-calling wants closed objects; MCP clients vary.
   Default to closed, take a per-target flag, or emit closed for OpenAI
   and open for MCP?

4. **Command-tool surface if the parked lane is revisited.**
   The `makeCommandTool` and `Spawner` seam (the sandbox slice) is the
   heaviest unscoped piece.
   It remains an unresolved design question for when this parked lane is
   revisited, not a current expansion target.

5. **Memory tools placement.**
   genie's `makeMemoryTools` (workspace-path FTS5 plus a pluggable search
   backend) stays host-path because Node-specific FTS5 and atomic writes
   have no `Filesystem`-cap equivalent.
   Does it belong here or stay genie-side until a cap-backed search
   substrate exists?

## Prompt

> Define `@endo/agent-tools` as the self-sufficient home of harness-facing
> tool records, code-mode machinery, and provider adapters.
> Keep `@endo/agentry` as harness assembly only, with dependency direction
> `agentry` → `agent-tools`.
> Name the model-facing code-mode tool `evaluate({ source, resultName? })`,
> with `makeEvaluateTool`, `EVALUATE_PARAMETERS`, `Evaluate`,
> `makeCompartmentEvaluate`, and `makeDaemonEvaluate` as its implementation
> seams.
> Give the tool one host-independent record and two dependency-free hosts:
> an in-process SES `Compartment` host and a daemon powers-reference host.
> Make `resultName` conditional on a `storeValue(valueOrPromise, nameOrPath)`
> power.
> Keep the parked JSON wrappers under `src/json-tools/`.
> Put code-mode machinery, capability-global descriptors, provider adapters,
> and checked-in generated declaration artifacts in their dedicated folders.
> Keep per-capability prompt fragments in agent-tools and final system-prompt
> assembly in agentry.
> Tool shape for the parked JSON layer is genie's `@endo/patterns`
> method-guard `makeTool`, not fae's hand-authored OpenAI JSON.
> Cover the wire-schema contract for the hard cases (bigint to string plus
> pattern, `M.or(X, undefined)` to optional, remotable to petname string,
> descriptions, parameter names).
> File tools target the `@endo/platform/fs/extended` `Filesystem`
> interface so one tool set reads the live worktree and history through the
> same cap with `readOnly()` attenuation.
> Attenuation lifted from genie's registry and policy machinery.
> Settle capability arguments as guest-petstore petnames.
> Cross-reference the sibling `@endo/agentry` `defineAgent` builder,
> `endo-gateway-mcp`, `daemon-agent-tools`, and `endo-fs-backend-seam`.
> Park every uncertainty in Open Questions.
