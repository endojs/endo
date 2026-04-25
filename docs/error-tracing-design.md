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

- each worker eagerly pushes an error trace record to the daemon at
  every emission site (thrown, rejected, or logged), keyed by the
  `errorId` that the worker's outbound CapTP marshal layer just
  minted on the wire,
- the daemon retains those records in a per-worker ring buffer
  indexed by a `(workerId, errorId)` pair, and additionally records
  every error its own outbound CapTP layer marshals so that the
  `errorId` the CLI sees is the same key the daemon stores under, and
- `EndoHost` exposes a privileged `traces` facet whose `lookup` and
  `recent` methods assemble per-error causal reports by walking the
  aggregate, with explicit synchronization so that a CLI lookup
  always sees the trace for an error it just observed.

This design addresses issue [#1879 "usable traces across workers"]
and is complementary to [#1843 "Error Serialization Issue"] and the
plans sketched in [`docs/errors.md`](./errors.md).
It intentionally does not propose changes to the on-the-wire error
encoding: the enriching information flows out-of-band, not through
the `Error` object itself.

## Goals

- Make asynchronous failures that originate in a worker legible
  through the CLI and other hosts, including:
  the originating compartment's stack, any annotation trail
  accumulated along the way, and a small window of preceding records
  from the same worker.
- Keep the CLI lookup timely.
  By the time an error reaches the CLI and the CLI asks the daemon
  for its trace, the daemon must already hold the corresponding
  record — no "try again, the worker hasn't flushed yet."
  This is the central reason the design pushes eagerly on every
  emission rather than batching.
- Preserve SES's redaction model: hidden diagnostic data stays
  server-side by default.
  Only a party holding the privileged `EndoHost` facet can obtain
  the enriched trace; a confined guest still sees only the
  already-marshalled error.
- Stay bounded.
  Workers do not retain trace records locally beyond a small
  in-flight window (just enough to retry an in-progress push).
  The daemon caps its aggregate by per-worker count and total bytes.
- Reuse the `errorId` strings that `@endo/marshal` already mints
  when `errorTagging` is `'on'` (the default) as the correlation
  key, and namespace the daemon's index by the worker's unique
  formula identifier so that two workers minting identical
  `errorId` strings cannot collide.
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
  The aggregate buffer is in-memory only; durable collection is
  left to a future "other kind of logging system" of the kind
  already discussed in `docs/errors.md`.
- Changing the serialized shape of `Error` values or adding a new
  pass style.
  Existing `errorId` tagging is load-bearing for this design;
  nothing else on the wire changes.
- Promise-level deep-stack instrumentation of every `E()` and
  `then` in a worker.
  Deep stacks are useful but belong in a separate proposal; here we
  only capture the error at the moment it is observed by the
  marshal layer or the worker's top-level rejection handler.
- A streaming `follow()` API on the `traces` facet.
  Streaming a live error feed exposes a powerful timing channel and
  has no chat-UI use case that cannot be satisfied with `lookup`
  driven by an external event signal; it can be added later behind
  its own capability if a use case emerges.

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
   The `defaultOnReject` handler in
   [`packages/daemon/src/connection.js`](../packages/daemon/src/connection.js)
   prints the message and stack, then the error is re-thrown to the
   original caller's promise.
4. Direct `console.error` calls in a worker.
   These are not errors per se, but they carry annotations and are
   the normal way asynchronous diagnostic context is revealed in
   the causal console.

The marshal-layer site (1) is load-bearing: it is the only place
where the worker side knows the exact `errorId` string that the
daemon will see on the wire.
The other three sites are useful for capturing context the
marshal-only path would miss (uncaught rejections, framing errors,
explicit logs).

## Design

### Correlation key

Every outgoing error that traverses a CapTP connection with
`errorTagging: 'on'` receives an `errorId` of the form
`error:<marshalName>#<N>` from the marshal layer.
That string is the correlation key.
On the daemon side the aggregate is indexed by the pair
`(workerId, errorId)`, where `workerId` is the worker's formula
identifier — the same string the daemon already uses in
`worker.js`'s connection name and in `<state>/worker/<workerId>/`.
This namespacing is what guarantees uniqueness within a daemon
session even if two workers happen to converge on the same
`errorIdNum`.

For the CLI's view, the daemon's outbound CapTP connection mints
its own `errorId` when the daemon forwards a worker's rejection to
the CLI.
The daemon captures both ids: the worker-side id (received via the
worker's eager push) and the CLI-side id (captured at the moment
the daemon's marshal serializes the error onward).
A single trace record can be reachable under either key.

### Eager push from worker to daemon

The previous draft proposed a per-worker ring buffer plus periodic
batched flushes.
That model loses the timeliness invariant: an error can arrive at
the CLI before the worker has scheduled its next batch, leaving the
CLI unable to find the trace.
The revised design pushes a record to the daemon at the moment
the worker emits an error.

Specifically, the worker installs a `marshalSaveError` callback on
its CapTP connection's marshal options.
That callback runs synchronously after `annotateError(err, X\`Sent
as ${errorId}\`)` and before the encoded message is handed to
`send`, so by the time the CapTP frame leaves the worker the
matching trace record is already in flight to the daemon.

The push uses a new method `reportTrace(record)` on
`EndoDaemonFacetForWorker` (currently empty).
The CapTP connection both transports the error and carries the
trace push, but they are independent messages: the trace push does
not block the error message and the error message does not block
the trace push.
Because both ride the same CapTP session and are both sent
synchronously from the worker turn that produced the error, they
arrive at the daemon in send order.

To preserve the timeliness invariant under daemon-to-CLI
forwarding, the daemon does not relay an outbound error to a
subscribed peer (e.g. the CLI) until the corresponding trace record
has been observed and indexed.
Concretely, the daemon's outbound CapTP installs its own
`marshalSaveError` that, in the same turn it mints the new
CLI-facing `errorId`, registers a synchronous index entry pointing
at the already-aggregated worker record.
A CLI that calls `traces.lookup(errorId)` after receiving the
error sees a populated record on the very first call.

### Worker-side capture sites

The worker installs capture wiring at the four emission sites:

- `makeWorkerFacet.evaluate` / `makeUnconfined` / `makeBundle` rely
  on the marshal-layer hook: the rejection of their returned
  promise reaches `encodeErrorCommon`, which calls
  `marshalSaveError`, which records and pushes.
  No try/catch wrapping is needed here.
- A `process.on('unhandledRejection')` handler installed by
  `worker-node.js` records and pushes errors that never reach the
  marshal layer (for example, background work in an unconfined
  caplet that nobody is awaiting).
  These records carry a synthetic `errorId` of the form
  `error:<marshalName>#unhandled-<seq>` so that the daemon's index
  can store them, and they are addressable by `recent()` even
  though no CLI will ever see a marshalled `errorId` for them.
- `connection.js`'s `defaultOnReject` is given an additional
  `onCapTpError` hook that the worker's `main` populates with a
  function that records the error and pushes it.
- The console wrapper SES already installs is extended with a
  filter that, when handed an `Error` argument, records and pushes
  it if it carries an `errorId` annotation.
  This reuses the existing annotation side table; it does not open
  a new channel.

All capture sites converge on a single `pushTrace(site, err,
errorId?)` function.

### Trace record shape

```js
/**
 * @typedef {object} TraceRecord
 * @property {string} errorId            // correlation key on the wire
 * @property {string} workerId           // formula id of emitting worker
 * @property {string} name               // err.name
 * @property {string} message            // err.message, already in the clear
 * @property {string} stack              // err.stack at emission, unredacted
 * @property {string[]} annotations      // strings from assert annotations
 * @property {TraceCauseRef[]} causes    // ids of cause/aggregate errors
 * @property {number} t                  // Date.now() at emission
 * @property {string} site               // 'marshal' | 'unhandled' | 'captp' | 'console'
 * @property {string} [compartmentId]    // optional compartment tag
 * @property {string} [parentErrorId]    // worker-side id this is forwarded from
 */
```

`TraceCauseRef` is a small `{ errorId, name, message }` triple
recorded for `err.cause` and each entry of `err.errors` so the
daemon can stitch causal chains without recursing into untrusted
data.

The record is portable across engines: it uses only strings,
numbers, and arrays, and any byte budgeting on the daemon side
uses `TextEncoder.encode(JSON.stringify(record)).length` rather
than a Node `Buffer`-specific calculation.

### Daemon aggregator

The aggregate lives in `daemonCore` (in
[`packages/daemon/src/daemon.js`](../packages/daemon/src/daemon.js))
and is constructed once per daemon process.
Its shape is:

```js
/**
 * @typedef {object} TraceAggregator
 * @property {(workerId: string, record: TraceRecord) => void} record
 *   Called from the worker→daemon CapTP path on every push.
 * @property {(opts: { workerId: string, errorId: string,
 *                     forwardedErrorId: string }) => void} alias
 *   Called from the daemon→CLI marshal hook to add a second key
 *   pointing at an already-recorded trace.
 * @property {(errorId: string) => TraceReport | undefined} lookup
 * @property {(opts?: { workerId?: string, limit?: number }) =>
 *            Array<TraceReport>} recent
 * @property {(workerId?: string) => void} clear
 */
```

Storage:

- A `Map<workerId, CircularBuffer<TraceRecord>>` keyed by worker
  formula id.
  Default cap: 1024 records per worker, 8 MiB total encoded across
  all workers.
- A `Map<errorId, { workerId, slot }>` index for O(1) lookup.
  Both the worker-side `errorId` and any CLI-side aliases register
  entries here.
- An LRU cap of 64 distinct workers tracked at once; older
  workers' buffers are evicted whole.

The daemon does not persist any of this.
On daemon restart the aggregate is empty; a CLI holding a stale
`errorId` from a previous daemon session receives `undefined` and
the CLI falls back to its old terse output.

### Synchronization for CLI timeliness

The daemon's outbound CapTP (the connection to the CLI) installs a
`marshalSaveError` whose body is, in order:

1. Read the inbound annotation chain on the error to find the
   worker-side `errorId` (the `Sent as error:Worker abc#N` note
   that the worker's marshal already attached).
2. Look up the matching record in the aggregate.
   If present, register `alias({ workerId, errorId: workerErrorId,
   forwardedErrorId: clientFacingErrorId })` and return.
3. If absent, that means the worker push is in flight or the error
   originated in the daemon itself.
   Record a daemon-local trace stub so the CLI's `lookup` will at
   least find a stub with the daemon's stack and can poll for the
   worker record on its own (a one-shot retry, not a stream).

Because step (2) runs in the same turn as the daemon's marshal,
and because the worker push and the worker's outbound error ride
the same CapTP session in send order, the daemon almost always has
the worker record on hand before it is asked to forward the error.
The fallback in step (3) covers the narrow window where a
non-CapTP daemon-internal error fires before any worker push has
been received.

### EndoHost `traces` facet

A new capability is added to `EndoHost`, reached by
`E(host).traces()`.

```js
export const TracesInterface = M.interface('EndoTraces', {
  help: M.call().optional(M.string()).returns(M.string()),
  lookup: M.call(M.string()).returns(M.promise()),     // TraceReport | undefined
  recent: M.call()
    .optional(M.splitRecord({}, {
      workerId: IdShape,
      limit: M.number(),
    }))
    .returns(M.promise()),                              // Array<TraceReport>
  clear: M.call().optional(IdShape).returns(M.promise()),
});
```

A `TraceReport` is a pass-by-copy record:

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
 * @property {string} [compartmentId]
 * @property {TraceReport[]} related  // adjacent records from the same worker
 * @property {boolean} partial        // true when buffer truncation ate data
 */
```

`related` is the user-visible lift: when the daemon assembles a
report it walks the worker's buffer backwards from the target
record, collecting entries whose `errorId` appears in any `causes`
chain of the target, plus a small window of preceding entries from
the same site.
This is the asynchronous analogue of the deep stack described in
`docs/errors.md`.

Access to `traces` is gated the same way as the rest of
`EndoHost`: a guest only sees what its host exposes via an edge in
its pet store.
By default, guests do not get it.

### CLI integration

The CLI's error exit handler in
[`packages/cli/bin/endo.cjs`](../packages/cli/bin/endo.cjs) and
[`packages/cli/src/client.js`](../packages/cli/src/client.js) is
extended so that:

- If the error name decoded by `@endo/marshal` matches the
  `RemoteFoo(error:...)` shape, the CLI extracts the `errorId` and
  attempts an `E(host).traces().lookup(errorId)` against the
  already-open client.
- On success it prints, in addition to the current one-liner, the
  assembled causal report indented beneath, terminated by a
  `(end trace errorId=...)` sentinel.
- On failure (no such error, daemon restarted, etc.) it falls back
  to the current behavior and notes `trace unavailable`.

A new CLI command `endo trace <errorId>` and `endo trace --recent
[--worker <workerId>] [--limit N]` exposes the same lookups
without requiring an exit-error context.

### Confidentiality and security

- Worker trace records are never shared with a guest unless the
  host explicitly hands them out.
- The daemon does not expose the aggregate over the gateway to
  remote peers.
  The `traces` facet is reachable through the host formula only,
  and the existing gateway check (`src/daemon.js`'s "Gateway can
  only provide local values" guard) is sufficient.
- Error messages in the buffer are the same strings SES's causal
  console would already print to the worker log.
  Adding this facility does not widen the secrecy boundary; it
  narrows it in practice, because today operators have to enable
  `--feral-errors` globally to get the same information, whereas
  the trace facet can be granted selectively.
- The daemon trusts the worker's pushed record only for its own
  `workerId` namespace.
  A misbehaving worker cannot inject records that `lookup` will
  return for another worker's `errorId`, because the daemon stamps
  `record.workerId` from the connection identity, ignoring any
  `workerId` field the worker sends.

### Lifecycle and failure modes

- On worker crash, in-flight pushes that have not yet reached the
  daemon are lost, but every emission that produced a wire-visible
  error has already been pushed by the time the wire frame leaves
  the worker, so any error the daemon (or CLI) actually saw is
  recorded.
- On daemon restart the aggregate is empty; any CLI that holds a
  stale `errorId` from a previous daemon session receives
  `undefined` and falls through to the existing behavior.
- Buffer eviction under pressure is LRU by worker, FIFO within
  worker, and is a silent effect: the caller sees `partial: true`
  on any `TraceReport` whose assembly touched an evicted record.
- When the trace push fails (e.g. the daemon connection is
  already closed), the worker logs at `console.error` with the
  same content and continues; the worker never blocks an error
  emission on a successful trace push.

## Affected code

- `packages/captp/src/captp.js` — accept `marshalSaveError` in
  `CapTPOptions` and forward it to `makeMarshal`.
  This is the only change outside `daemon` and `cli`.
- `packages/daemon/src/connection.js` — accept and forward a
  `marshalSaveError` option to `makeCapTP`; add a `onCapTpError`
  hook alongside the existing `defaultOnReject`.
- `packages/daemon/src/worker.js` — install the worker-side
  `pushTrace`, wire it as `marshalSaveError` for the worker's
  CapTP, and as the unhandled-rejection / console / `onCapTpError`
  handlers.
- `packages/daemon/src/worker-node.js` — install the
  `process.on('unhandledRejection')` handler that calls
  `pushTrace`.
- `packages/daemon/src/daemon-go-powers.js` and
  `packages/daemon/src/daemon-node-powers.js` — pass the daemon's
  per-worker `marshalSaveError` through `makeNetstringCapTP` so
  the daemon side records the daemon-side `errorId` and registers
  aliases.
- `packages/daemon/src/daemon.js` — own the aggregate buffer and
  its indices; expose `recordTrace`, `aliasTrace`, `lookupTrace`,
  and `recentTraces` through `daemonCore`; thread them into
  `makeDaemonFacetForWorker` and into `makeHostMaker`.
- `packages/daemon/src/interfaces.js` — add `reportTrace` to
  `DaemonFacetForWorkerInterface`; add `TracesInterface`; extend
  `HostInterface` with a `traces()` method.
- `packages/daemon/src/host.js` — expose the `traces` facet on
  the Exo the host maker returns.
- `packages/cli/bin/endo.cjs` and
  `packages/cli/src/client.js` — extract the `errorId` from a
  `RemoteFoo(error:...)` exit error name and look up the trace
  through `E(host).traces().lookup`.
- `packages/cli/src/commands/trace.js` — new `endo trace`
  command.
- `packages/cli/src/endo.js` — register the new command.
- `docs/errors.md` — cross-reference this design from the
  "asynchronous diagnostic information" section.

No changes to `@endo/marshal` are required; the
`marshalSaveError` option is already there.

## Test plan

- Unit tests for the daemon aggregator: per-worker eviction by
  count, total-byte eviction, LRU eviction by worker, alias
  registration, lookup by either id, and the `partial` flag set
  by a report that crosses an evicted record.
- A daemon integration test that forces a rejection inside an
  `evaluate` call and asserts that the resulting `TraceReport`
  obtained through `E(host).traces().lookup(errorId)` contains
  the expected `stack`, `name`, annotations, and the worker's
  formula id.
- A regression test reproducing the CLI scenario in
  [#1879](https://github.com/endojs/endo/issues/1879):
  `endo make src/hdWallet.js -n w1` against a module with a
  direct-eval expression should print the enriched trace, with
  the original one-liner first and the causal body following.
- A timeliness test that confirms `traces.lookup` returns the
  worker record on the first call after the CLI observes the
  error, with no retry needed.
- A confidentiality test asserting that a guest without an
  explicit `traces` edge in its pet store cannot reach the
  daemon's aggregate.
- A misbehaving-worker test asserting that a worker pushing a
  record with a forged `workerId` field has that field ignored
  and replaced with the connection identity.

## References

- [#1879 usable traces across workers](https://github.com/endojs/endo/issues/1879)
- [#1843 Error Serialization Issue](https://github.com/endojs/endo/issues/1843)
- [`docs/errors.md`](./errors.md), the existing SES/causal console
  story
- [`packages/daemon/DEBUGGING.md`](../packages/daemon/DEBUGGING.md),
  covering `ENDO_CAPTP_TRACE` and the `--feral-errors` flag, which
  this design complements rather than replaces
