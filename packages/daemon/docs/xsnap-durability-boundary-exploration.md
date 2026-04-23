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

## Option B: Durable reference facade formula (recommended incremental direction)

Introduce a new formula type that acts as a stable rebinding facade.

- Example formula: `xsnap-ref`
- Stores stable target formula ID plus rebinding strategy
- Client receives facade object, not raw xsnap export
- Facade internally resolves latest incarnation before each call
- If peer formula restarted, facade re-provides and retries (policy-controlled)

Pros:

- Strong alignment with daemon formula model (IDs are already durable)
- Can communicate with non-xsnap formulas while insulating clients from session churn
- Compatible with smallcaps persisted marshal records (`body + slots`)

Cons:

- Added call indirection and policy complexity (retry idempotence, timeout, backoff)

Best when:

- we want "normal Endo formula feel" with durable backing

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
3. Add `xsnap-ref` formula type for stable client-facing references.
4. Keep daemon dependency graph semantics (`thisDiesIfThatDies`) but define rebinding policies for `xsnap-ref`:
   - no retry
   - retry once on epoch mismatch
   - bounded retry with backoff
5. Expose explicit diagnostics on references:
   - current epoch
   - last rebind time
   - last rebind failure reason

This gives durable state benefits without forcing user code into vat-data durable object APIs.

## Exploratory tests added in this branch

The tests in `test/xsnap-boundary-exploration.test.js` probe key invariants:

1. Persisted marshal formulas use smallcaps body and slot references for formula values.
2. Cross-worker references survive restart by formula identity, while worker heap state still resets (current baseline behavior).

These tests do not implement xsnap workers; they establish baseline facts the xsnap design must preserve or intentionally change.

## Open questions to settle before implementation

1. Should `xsnap-ref` auto-retry calls by default, or fail fast with explicit rebinding?
2. What methods are safe to replay after rebind (idempotence policy)?
3. Should old-epoch references expose a specific error class for client tooling?
4. Do we allow mixed graphs where xsnap durable references point to purely ephemeral non-xsnap exports, and if so with what downgrade behavior?
5. Is a daemon-level "session ended" notification stream needed, or is call-time failure sufficient?
