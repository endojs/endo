---
title: Error Tracing Across Workers
group: Documents
category: Design
---

# Error Tracing Across CapTP Workers

## Summary

Errors that cross CapTP connections between a daemon and its workers
today arrive as terse rejections that identify only the unserializer
as the call site — the originating worker, compartment, turn, and
stack are unreachable from the CLI or any other downstream receiver.
This design adds a causal error trace facility wherein

- each worker retains a small, bounded ring buffer of the errors it
  has emitted (thrown, rejected, or logged) together with their
  locally observed stacks, annotations, and any error-id tags the
  marshal layer has attached,
- the daemon aggregates these worker-local records into a larger ring
  buffer keyed by error-id, eagerly on worker connection close and
  lazily when asked, and
- `EndoHost` exposes a privileged `traces` facet whose methods assemble
  per-error causal reports by walking the aggregated ring buffer, so
  that the CLI (and other confidential observers such as a chat UI)
  can render a usable explanation of a failure rather than
  `CapTP cli exception: (RemoteSyntaxError ...)`.

This design addresses issue [#1879 "usable traces across workers"]
and is complementary to [#1843 "Error Serialization Issue"] and the
plans sketched in [`docs/errors.md`](./errors.md).
It intentionally does not propose changes to the on-the-wire error
encoding: the enriching information flows out-of-band, not through
the `Error` object itself.

## Goals

- Make asynchronous failures that originate in a worker legible
  through the CLI and other hosts, including:
  a short causal chain of prior turns on the local worker that led
  to the throw, any annotation trail accumulated along the way, and
  the error's stack as captured in the emitting realm.
- Preserve SES's redaction model: hidden diagnostic data stays
  server-side by default.
  Only a party holding the privileged `EndoHost` facet can obtain
  the enriched trace; a confined guest still sees only the
  already-marshalled error.
- Stay bounded.
  Workers and daemon each cap their ring buffers by count and by
  approximate byte size so that a noisy worker cannot drag the
  daemon into unbounded memory growth.
- Avoid requiring new CapTP-level metadata or wire changes.
  Correlation runs on `errorId` strings that `@endo/marshal` already
  mints when `errorTagging` is `'on'` (the default).
- Fit the existing formula and connection lifecycle.
  Traces are ephemeral, not persisted to SQLite, and are lost on
  daemon restart — matching the worker log files that live at
  `<state>/worker/<id>/worker.log` today.

## Non-goals

- Distributed tracing across remote peers.
  OCapN peer-to-peer error correlation is tracked separately; this
  design stops at the boundary of a single daemon and the workers
  it spawns.
- A persistent causal log or time-travel debugger.
  The ring buffers are in-memory only; durable collection is left to
  a future "other kind of logging system" of the kind already
  discussed in `docs/errors.md`.
- Changing the serialized shape of `Error` values or adding a new
  pass style.
  Existing `errorId` tagging is load-bearing for this design; nothing
  else on the wire changes.
- Promise-level deep-stack instrumentation of every `E()` and `then`
  in a worker.
  Deep stacks are useful but belong in a separate proposal; here we
  only capture the error at the moment it is observed by the marshal
  layer or the worker's top-level rejection handler.

## Background: where errors come from today

Four call sites in the worker-side code are the points at which a
value-turned-error first becomes visible to the daemon:

1. A rejection of the promise returned by
   `makeWorkerFacet.evaluate`, `makeBundle`, or `makeUnconfined` in
   [`packages/daemon/src/worker.js`](../packages/daemon/src/worker.js).
   CapTP serializes the rejection as the answer to the outstanding
   question, invoking `encodeErrorCommon` in
   [`packages/marshal/src/marshal.js`](../packages/marshal/src/marshal.js),
   which already allocates an `errorId`, annotates the error with
   `X\`Sent as ${errorId}\``, and calls `marshalSaveError(err)`.
2. An uncaught rejection inside the worker's top-level code (for
   example, in an unconfined caplet's background task).
   Today this surfaces only as a `console.error` entry in the
   worker's log file.
3. A CapTP-level decode failure on either side, such as the
   `RemoteSyntaxError` that motivates #1879.
   The `onReject` handler in
   [`packages/daemon/src/connection.js`](../packages/daemon/src/connection.js)
   prints the message and stack, then the error is re-thrown to the
   original caller's promise.
4. Direct `console.error` calls in a worker.
   These are not errors per se, but they carry annotations and are
   the normal way asynchronous diagnostic context is revealed in the
   causal console.

All four sites already have an `Error` object in hand at the moment
of emission; what is missing is a side channel that records the
local causal context against a stable correlation key and lets a
privileged peer retrieve it.

## Design

### Correlation key

Every outgoing error that traverses a CapTP connection with
`errorTagging: 'on'` receives an `errorId` of the form
`error:<marshalName>#<N>` where `marshalName` today is the
connection name (`Endo`, `Worker <id>`, etc.).
That string is the correlation key for the rest of this design.
We explicitly accept that it is not globally unique across restarts
and that two workers can mint the same `error:Endo#20001` if they
are configured identically; the daemon namespaces its aggregate
buffer by the worker's formula id to disambiguate.
A future revision can mix a random nonce into `errorIdNum`; that is
a change to `makeMarshal` options, not this design.

### Worker-local ring buffer

Each worker process gets a single in-process ring buffer, created in
`worker.js` and shared across every CapTP connection the worker
holds (today there is exactly one, to the daemon; the design does
not assume that).
The buffer is a fixed-capacity circular queue of hardened records:

```js
/**
 * @typedef {object} WorkerTraceRecord
 * @property {string} errorId            // correlation key
 * @property {string} name               // err.name
 * @property {string} message            // err.message, already in the clear
 * @property {string} stack              // err.stack at emission, unredacted
 * @property {string[]} annotations      // strings from assert annotations
 * @property {WorkerTraceRecord[]} causes // err.cause / err.errors, bounded
 * @property {number} t                  // Date.now() at emission
 * @property {string} site               // 'evaluate' | 'makeBundle' | ...
 * @property {string} workerId           // formula id, set by the daemon side
 * @property {string} [compartmentId]    // optional compartment tag
 */
```

Capacity defaults to 256 records or roughly 64 KiB of JSON-encoded
payload, whichever is reached first.
Both are tunable by environment variables (`ENDO_TRACE_COUNT`,
`ENDO_TRACE_BYTES`) read once at worker startup; `0` disables the
buffer entirely, which is appropriate for deterministic replay.
The ring buffer is a plain JavaScript data structure hardened at
construction; nothing inside it is a remotable.
It is portable across engines because we use `Uint8Array` and
`TextEncoder`/`TextDecoder` rather than Node `Buffer` anywhere the
encoded payload is measured.

#### Capture points

The worker installs capture shims at the four emission sites listed
in the background section:

- `makeWorkerFacet`'s `evaluate` / `makeUnconfined` / `makeBundle`
  wrap their body in `try { ... } catch (err) { traces.record('...',
  err); throw err; }`.
  This keeps the existing throw semantics intact; CapTP still sees
  the same rejection.
- The worker's top-level `process.on('unhandledRejection')` handler
  (added by a small change in `worker-node.js`) records and then
  logs as today.
- The `connection.js` `defaultOnReject` gets a `beforeReject` hook
  that, when provided, is invoked with the error before the
  `console.error` line.
  The worker's `main` supplies a hook that records the error.
- The `console` wrapper that SES already installs in the worker is
  extended via a small filter that, when it is handed an `Error`
  argument, records it if it has an `errorId` annotation.
  This reuses the existing side table for annotations; it does not
  open a new channel.

Every capture site invokes a single `traces.record(site, err)`
function so that the capture logic is one place in the worker.

#### Interaction with the marshal layer

The marshal layer's `marshalSaveError` callback is the load-bearing
hook for associating the `errorId` with the error object.
`makeNetstringCapTP` today does not override it, so the default
`console.log('Temporary logging of sent error', err)` runs.
The worker's CapTP construction in `worker.js` will pass a
`marshalSaveError` that calls `traces.record('marshal', err)` and
suppresses the default log.
Because `encodeErrorCommon` calls `annotateError(err, X\`Sent as
${errorId}\`)` *before* `marshalSaveError`, the recording function
can read the freshly-added annotation off the error via the SES
annotation side table (exposed as `getErrorNote` in the console
API) and persist the exact `errorId` string the far side will see.

### Daemon aggregation

The daemon's worker connection code in
[`packages/daemon/src/daemon-go-powers.js`](../packages/daemon/src/daemon-go-powers.js)
constructs the `makeNetstringCapTP` for each worker.
It registers, via the existing `capTpConnectionRegistrar`
hook, an `onReject` that forwards the error (plus its `errorId` if
any) into a daemon-level ring buffer.
This catches rejections the daemon observes but the worker did not,
such as CapTP-level framing errors on ingestion.

The daemon also adds one method to the
`EndoDaemonFacetForWorker` interface (currently empty):

```js
reportTraces: M.call(M.arrayOf(TraceRecordShape))
  .returns(M.promise()),
```

The worker calls this periodically and one final time during
graceful shutdown, draining its local ring buffer into the daemon's
larger aggregate buffer.
This keeps almost all traces in the daemon even after a worker
exits, which matters because the CLI's failed invocation is the
exact moment a user wants the trace.

The daemon buffer is structured as a `Map<workerId,
CircularBuffer<WorkerTraceRecord>>` nested inside an overall LRU on
worker ids.
Default caps are 64 workers tracked, 1024 records per worker, and
8 MiB total encoded size.
A second index, `Map<errorId, { workerId, recordIndex }>`, makes
`get(errorId)` O(1) up to the cost of resolving indirection into the
per-worker buffer.

The daemon does not persist any of this.
On daemon restart the aggregate is empty, which matches the
lifetime of worker log files under `<state>/worker/<id>/`.
Durable collection is out of scope.

### EndoHost `traces` facet

A new capability is added to `EndoHost`, reached by
`E(host).traces()` (or whatever name emerges during review — the
present `host.js` places most facets at top level, but `traces` is a
small cluster of related methods).

The facet is an Exo with the following methods, specified by an
`M.interface` guard:

```js
export const TracesInterface = M.interface('EndoTraces', {
  help: M.call().optional(M.string()).returns(M.string()),
  lookup: M.call(M.string())                       // errorId
    .returns(M.promise()),                          // TraceReport | undefined
  recent: M.call()
    .optional(M.splitRecord({}, {
      workerId: IdShape,
      limit: M.number(),
    }))
    .returns(M.promise()),                          // Array<TraceReport>
  follow: M.call().returns(M.promise()),            // async iterator
  clear: M.call().optional(IdShape).returns(M.promise()),
});
```

A `TraceReport` is a pass-by-copy record of the form:

```js
/**
 * @typedef {object} TraceReport
 * @property {string} errorId
 * @property {string} workerId
 * @property {string} name
 * @property {string} message
 * @property {string} stack
 * @property {string[]} annotations
 * @property {TraceReport[]} causes
 * @property {number} t
 * @property {string} site
 * @property {string} [formulaId]     // formula under execution, if known
 * @property {string} [compartmentId]
 * @property {TraceReport[]} related  // earlier records the daemon pairs by
 *                                    // matching causes[].errorId or by
 *                                    // adjacency in the same worker buffer
 * @property {boolean} partial        // true when buffer truncation ate data
 */
```

`related` is the key user-visible lift: when the daemon assembles a
report it walks the worker's buffer backwards from the target
record, collecting entries whose `errorId` appears in any `causes`
chain of the target, plus a small window of preceding entries from
the same site.
This is the asynchronous analogue of the deep stack described in
`docs/errors.md`: it cannot be a true causal DAG without
eventual-send instrumentation, but the buffer adjacency is already
a usable proxy for "what else was this worker doing when it
threw."

Access to `traces` is gated the same way as the rest of
`EndoHost`: a guest only sees what its host exposes via an edge in
its pet store.
By default, guests do not get it.
A host that wants a confined guest to debug itself can store the
`traces` facet under a pet name the way it would any other
capability.

### CLI integration

The CLI's error exit handler in
[`packages/cli/bin/endo.cjs`](../packages/cli/bin/endo.cjs) is four
lines; we extend it (and the CLI entry in `packages/cli/src/endo.js`)
so that:

- If the error carries an `errorId` annotation, the CLI attempts an
  `E(host).traces().lookup(errorId)` against the already-open
  client.
- On success it prints, in addition to the current one-liner, the
  assembled causal report indented beneath, terminated by a
  `(end trace errorId=...)` sentinel.
- On failure (no such error, daemon restarted, etc.) it falls back
  to the current behavior and notes `trace unavailable`.

This addresses the exact failure mode reported in #1879, where a
direct-eval rejection in a worker surfaces as a naked
`RemoteSyntaxError` on the CLI.
With the trace lookup in place, the CLI prints the originating
compartment's error stack, the annotations that led to the throw,
and the surrounding recent records from the same worker.

### Confidentiality and security

- Worker trace records are never shared with a guest unless the host
  explicitly hands them out.
- The daemon does not expose the aggregate buffer over the gateway
  to remote peers.
  The `traces` facet is reachable through the host formula only, and
  the existing gateway check (`src/daemon.js`'s
  "Gateway can only provide local values" guard) is sufficient.
- Error messages in the buffer are the same strings SES's causal
  console would already print to the worker log.
  Adding this facility does not widen the secrecy boundary; it
  narrows it in practice, because today operators have to enable
  `--feral-errors` globally to get the same information, whereas the
  trace facet can be granted selectively.
- The worker buffer holds stacks that may include file paths from
  the worker's filesystem.
  This is the same information already written to
  `<state>/worker/<id>/worker.log`, and is appropriate for a
  debugging channel.

### Lifecycle and failure modes

- On worker crash the daemon drains whatever portion of the worker's
  buffer was last delivered via `reportTraces`.
  Anything not yet reported is lost.
  This is acceptable because a crashing worker is exactly the case
  where the stdio log file is also available, and the aggregated
  daemon buffer is the complement of, not replacement for, that log.
- On daemon restart the buffer is empty; any CLI that holds a stale
  `errorId` from a previous daemon session receives `undefined` and
  falls through to the existing behavior.
- Buffer eviction under pressure is LRU by worker, FIFO within
  worker, and is a silent effect: the caller sees `partial: true` on
  any `TraceReport` whose assembly touched an evicted record.

## Affected code

This design touches, at minimum:

- `packages/daemon/src/worker.js` — install the worker ring buffer
  and wire capture sites, pass `marshalSaveError` through
  `makeNetstringCapTP`.
- `packages/daemon/src/connection.js` — add a `beforeReject` hook
  analogous to the existing `onReject` so callers can observe errors
  without overriding the log path.
- `packages/daemon/src/daemon-go-powers.js` — allocate per-worker
  aggregate buffers and install the daemon-side `onReject`.
- `packages/daemon/src/interfaces.js` — add `reportTraces` to
  `EndoDaemonFacetForWorkerInterface`; add `TracesInterface`; extend
  `HostInterface` with a `traces` method.
- `packages/daemon/src/host.js` — expose the `traces` facet on the
  Exo the host maker returns.
- `packages/daemon/src/daemon.js` — own the aggregate buffer and its
  indices, wire them to host construction.
- `packages/cli/bin/endo.cjs` and
  `packages/cli/src/client.js` — hydrate errors via `traces.lookup`
  on exit when an `errorId` annotation is present.
- `docs/errors.md` — cross-reference this design from the
  "asynchronous diagnostic information" section.

No changes to `@endo/marshal` or `@endo/captp` are required.
All new state is in the daemon package.

## Test plan

- Unit tests for the worker ring buffer:
  eviction by count, eviction by byte budget, and the record shape
  produced by each capture site.
- A daemon integration test that forces a rejection inside an
  `evaluate` call and asserts that the resulting `TraceReport`
  obtained through `E(host).traces().lookup(errorId)` contains the
  expected `stack`, `name`, and annotations.
- A regression test reproducing the exact CLI scenario in
  [#1879](https://github.com/endojs/endo/issues/1879):
  `endo make src/hdWallet.js -n w1` against a module with a
  direct-eval expression should print the enriched trace, with the
  old one-liner as the first line and the causal body following.
- A confidentiality test asserting that a guest without an explicit
  `traces` edge in its pet store cannot reach the daemon's
  aggregate.

## Open questions

- Should `traces.follow()` be offered at all?
  A streaming view is useful for a chat UI that wants to surface
  errors as they happen, but it exposes a fairly powerful timing
  channel.
  It may be safer to require the caller to hold a separate
  capability and gate streaming behind it.
- Is the correlation key robust enough?
  If two workers use the same `marshalName` and converge on the same
  `errorIdNum`, they will mint duplicate `errorId` strings.
  Namespacing by workerId on the daemon side is sufficient when the
  daemon is the aggregator, but a future remote-peer trace facility
  will need a stronger key.
- Should the worker proactively push traces on every emission, or
  only in batches?
  Pushing on every emission makes the CLI lookup always current at
  the cost of extra CapTP traffic; the design defaults to batching
  on a short timer plus on graceful shutdown, but the choice is
  easy to revisit once the feature is in use.

## References

- [#1879 usable traces across workers](https://github.com/endojs/endo/issues/1879)
- [#1843 Error Serialization Issue](https://github.com/endojs/endo/issues/1843)
- [`docs/errors.md`](./errors.md), the existing SES/causal console
  story
- [`packages/daemon/DEBUGGING.md`](../packages/daemon/DEBUGGING.md),
  covering `ENDO_CAPTP_TRACE` and the `--feral-errors` flag, which
  this design complements rather than replaces
