# Endo daemon xsnap durability-boundary exploration

## Problem statement

We want a new Endo daemon worker/formula flavor that can use xsnap-style heap snapshots (orthogonal persistence) while still fitting the daemon's current formula graph and CapTP session model.

Target outcomes:

- formulas should feel close to existing `worker` + `eval` usage
- formulas should be able to exchange values with other formulas/workers (including non-xsnap workers)
- formula references should remain meaningful across daemon restart
- avoid requiring app code to adopt vat-data-style durable baggage patterns

The core difficulty is the durability regime boundary:

- **daemon/client side**: ephemeral CapTP sessions
- **xsnap side**: durable heap snapshots and incarnation continuity

## Current daemon behavior relevant to the boundary

From the existing code and tests:

1. `worker` formulas are revived after restart, but worker heap state is re-created (closure state resets).
2. Formula identity persists through stored formula records; values are re-incarnated on demand.
3. Host-side marshaling uses `@endo/marshal` with `serializeBodyFormat: 'smallcaps'` for persisted marshal formulas.
4. CapTP transport currently uses `@endo/captp` with `serializeBodyFormat: 'capdata'` (TODO in captp source notes smallcaps compatibility work remains).
5. A client-held remote presence from an old daemon session does not survive restart as a live connection; recovery requires reacquiring through a fresh session and formula reference.

This means today we already have a durable **identifier graph**, but only ephemeral **session bindings**.

## Boundary hazards to design around

### 1. Session-disconnect visibility

An xsnap worker might continue to exist (or be recoverable by snapshot) even when a specific daemon/client CapTP session ends. A client that only has old presences learns about breakage only when sending.

### 2. Identity continuity versus transport continuity

Formula IDs can remain stable while transport endpoints rotate. Durable identity must not be conflated with connection liveness.

### 3. Promise semantics across reincarnation

In Agoric/SwingSet, promises are intentionally not durable across upgrade boundaries. Endo daemon should similarly avoid pretending in-flight promise pipelines survive a full boundary crossing unless explicitly modeled.

### 4. Cross-regime sharing

Non-xsnap worker values may be intrinsically ephemeral. xsnap formulas must tolerate peer formulas being reincarnated and references being rebound.

## Architecture options

## Option A: Epoch-gated direct presence model (minimal change)

Keep existing CapTP object semantics. Add explicit worker/session epoch metadata to xsnap-origin references.

- New worker formula: `xsnap-worker`
- Existing formulas (`eval`, `make-bundle`, `make-unconfined`) optionally target `xsnap-worker`
- Every exported xsnap reference carries `{ formulaId, workerEpoch }` in its recovery metadata
- Method sends reject fast on epoch mismatch, with an error that includes a rebinding hint

Pros:

- Smallest implementation delta
- Fits current cancellation and dependency graphs

Cons:

- Clients must handle rebinding manually
- No transparent continuity for old presences

Best when:

- we prioritize explicit failure over transparent reconnection

## Option B: Direct `xsnapEvaluate` worker model (implemented direction)

Keep formulas explicit and worker-scoped, and formulate directly in an
`xsnap-worker` instead of introducing an extra facade formula type.

- New worker formula: `xsnap-worker`
- New host helper: `xsnapEvaluate(workerName, source, codeNames, petNames, resultName?)`
- Resulting formulas remain normal `eval` formulas, pinned to an `xsnap-worker`
- Heap continuity comes from xsnap snapshots plus formula-id keyed value reuse inside the xsnap worker

Pros:

- Calling conventions stay aligned with existing daemon APIs (`evaluate`, `provideWorker`)
- No extra forwarding layer; cross-boundary calls are direct capability passing
- Explicit worker selection allows daemon enforcement of xsnap regime boundaries

Cons:

- Clients still reacquire values through formula identities after daemon/session restart
- No transparent "old presence revival" for stale sessions (same as existing daemon model)

Best when:

- we want durable xsnap heap behavior with minimal API novelty

## Option C: Durable mailbox endpoint between regimes

Convert boundary crossing into explicit queued messages.

- xsnap side exposes durable inbox/outbox formula(s)
- ephemeral UI session subscribes to stream but protocol truth is durable queue state
- disconnection means missed live updates, not lost protocol state

Pros:

- Clear semantics under disconnection/restart
- Natural place for replay and deduplication

Cons:

- More like actor messaging than direct object call ergonomics
- Higher latency/complexity for request/response patterns

Best when:

- correctness under churn is more important than object-call ergonomics

## Option D: Dual-channel model (fast ephemeral + durable control plane)

Combine direct object calls with durable reattachment metadata.

- fast path: direct CapTP calls while session alive
- durable path: checkpointed formula references + sequence/ack state in durable records
- on disconnect, client library transparently flips to reattach flow

Pros:

- Good latency in normal path
- Better continuity without forcing full queue protocol

Cons:

- Most subtle invariants; hardest to test

Best when:

- high-throughput interactive UX is required

## Option E: Fully durable protocol endpoint (persistent CapTP-like layer)

Define a protocol where object references are always mediated by durable endpoint records instead of transport session object tables.

Pros:

- maximal continuity

Cons:

- effectively a new protocol stack
- significant risk and implementation scope

Best when:

- long-term platform rewrite is acceptable

## Serialization implications

For this repository state today:

- Persisted formula values should continue to use smallcaps (`@endo/marshal`) for `marshal` formulas.
- Worker link transport remains capdata until `@endo/captp` smallcaps support is completed.

Practical interpretation:

- "smallcaps at the durability boundary" is already feasible for formula persistence and rebinding metadata.
- "smallcaps over live worker RPC" is not yet drop-in with current captp.

## Suggested concrete shape for first implementation

1. Add `xsnap-worker` formula type (parallel to `worker`).
2. Add worker power implementation for xsnap process lifecycle and snapshot management.
3. Add `xsnapEvaluate(...)` host API that mirrors `evaluate(...)` but provisions/uses `xsnap-worker`.
4. Ensure daemon enforcement that formulas intended for xsnap execution are bound to `xsnap-worker`.
5. Validate cross-boundary capability traffic (xsnap <-> non-xsnap) before and after full restart.

This gives durable state benefits without forcing user code into vat-data durable object APIs.

## `xsnapEvaluate` implementation plan (ergonomics-first)

This section refines the direct `xsnapEvaluate` model into concrete repository changes.

### Ergonomics goals

#### Formula author ergonomics (inside workers)

Code that receives a boundary value should use ordinary eventual-send style:

- preferred: `E(counterLike).incr()`
- avoid requiring a bespoke wrapper call style

This is preserved by passing ordinary capabilities across the boundary; no facade type is required.

#### Host ergonomics (outside workers)

Creating formulas in an xsnap worker should mirror ordinary `evaluate`:

- new host helper: `xsnapEvaluate(workerName, source, codeNames, petNames, resultName?)`
- semantics intentionally parallel `evaluate`
- the daemon resolves/formulates `workerName` as an `xsnap-worker`
- resulting formula records still use normal `eval` type, but are pinned to the xsnap worker

### Concrete daemon changes

1. Add `xsnap-worker` formula support:
   - `formulateXsnapWorker(deferredTasks)`
   - host caller can request by name, and daemon formulates `xsnap-worker`
2. Add host APIs:
   - `xsnapEvaluate(workerName, source, codeNames, petNames, resultName?)`
   - ensure specified worker is an `xsnap-worker`
   - persist resulting `eval` formulas against that worker
3. Add xsnap runtime support in node powers:
   - use real `@agoric/xsnap` worker process
   - load snapshot on worker startup
   - persist snapshot after evaluate/call operations and termination
4. Add capability wire protocol for host/xsnap method calls and slot identity.

### Concrete tests

1. **Worker regime enforcement**: `xsnapEvaluate` formulas are attached to `xsnap-worker`.
2. **Global heap continuity**: `globalThis` values survive full daemon restart via snapshots.
3. **Ordinary closure heap continuity**: exo closure/object state survives restart.
4. **Cross-boundary non-xsnap -> xsnap**: non-xsnap callers invoke xsnap values before and after restart.
5. **Cross-boundary xsnap -> non-xsnap**: xsnap callers invoke non-xsnap values before and after restart.

## Exploratory tests added in this branch

The tests in `test/xsnap-boundary-exploration.test.js` probe key invariants:

1. Persisted marshal formulas use smallcaps body and slot references for formula values.
2. `xsnapEvaluate` creates formulas tied to `xsnap-worker`.
3. `xsnapEvaluate` recovers `globalThis` heap state across daemon restart via snapshots.
4. `xsnapEvaluate` recovers ordinary closure/object heap state across restart.
5. Cross-boundary calls are covered in both directions across restart:
   - non-xsnap caller -> xsnap value
   - xsnap caller -> non-xsnap value

## Open questions to settle before implementation

1. Should daemon expose explicit worker regime metadata in inspector output for tooling/UX?
2. Is a daemon-level "session ended" notification stream needed, or is call-time failure sufficient?
3. Should we add an explicit conformance test around formula-id stability of repeated `xsnapEvaluate` on named results?
