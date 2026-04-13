# Durable OCapN Refactor Plan (Incremental, Commit-Sized)

## Scope

This plan breaks the durable-session effort into small, individually committable refactors.

It intentionally avoids implementation details that require one large migration.  
Each step should preserve green tests and keep ephemeral behavior working throughout.

## Guiding strategy

- First introduce **abstraction seams** in `@endo/ocapn` with no behavior change.
- Then add **parallel durable adapters** in a new package.
- Finally wire resume behavior and durable boundary validation behind explicit composition.

## Step-by-step plan

### 1) Add architecture docs and ADR scaffolding

**Commit type:** `docs(ocapn): ...`  
**Change set:**

- Add architecture + staged refactor docs (this document and companion architecture doc).
- Add a short ADR index section in `packages/ocapn/README.md` (optional) linking to new docs.

**Why first:** aligns contributors before any API churn.

---

### 2) Introduce explicit `ClientStorageKit` interface (no behavior change)

**Commit type:** `refactor(ocapn): ...`  
**Change set:**

- Define type/interface for storage dependencies currently implicit in:
  - `swissnumTable`
  - `giftTable`
  - in-memory slot table internals
- Keep existing defaults by adapting current `Map` usage into this interface.

**Tests:**

- No semantic changes; existing client/session tests should pass unchanged.

---

### 3) Extract OCapN table creation into factory hook

**Commit type:** `refactor(ocapn): ...`  
**Change set:**

- Replace direct `makeOcapnTable(...)` call in `client/ocapn.js` with injected factory.
- Add default factory that returns current table implementation.
- Ensure factory is used both at first session creation and reconnect path (even if reconnect still creates a fresh logical session for now).

**Tests:**

- Existing table/gc/pipeline tests.
- New unit test: custom table factory is invoked.

---

### 4) Split session identity from connection identity

**Commit type:** `refactor(ocapn): ...`  
**Change set:**

- Add internal `LogicalSession` concept in session manager.
- Keep existing external API unchanged (`provideSession`, `abort`).
- Continue current behavior (logical session ends when connection ends), but with internal shape now ready for resume.

**Tests:**

- Existing handshake and reconnect-after-abort tests unchanged.

---

### 5) Add boundary-policy hook for import/export validation

**Commit type:** `refactor(ocapn): ...`  
**Change set:**

- Add `boundaryPolicy` hook with default permissive behavior equivalent to today.
- Invoke before export registration and on imported values where appropriate.

**Tests:**

- Existing behavior unchanged under default policy.
- New tests showing policy can reject a value and causes deterministic protocol error path.

---

### 6) Replace internal protocol-visible helper objects with injectable constructors

**Commit type:** `refactor(ocapn): ...`  
**Change set:**

- Extract constructors for bootstrap/resolver helper remotables currently using `Far`.
- Default constructor still uses current behavior.
- Durable mode can later swap in durable-exo-compatible constructors.

**Tests:**

- Pipeline and resolver tests must still pass.

---

### 7) Introduce resumable-handshake extension points (disabled by default)

**Commit type:** `refactor(ocapn): ...`  
**Change set:**

- Extend handshake/session manager with optional resume metadata hooks:
  - provide resume token
  - verify resume token
  - map connection to existing logical session
- Default hook implementation is no-op and preserves current start-session behavior.

**Tests:**

- Existing handshake tests.
- New tests for hook invocation order and fallback path.

---

### 8) Create new package scaffold `@endo/ocapn-durable-client`

**Commit type:** `feat(ocapn-durable-client): ...`  
**Change set:**

- Add workspace package skeleton:
  - `package.json`
  - `README.md`
  - `src/index.js`
  - type/test/lint scaffolding
- Export a client constructor that composes `@endo/ocapn` with placeholders for durable adapters.

**Tests:**

- Package smoke test that constructor can be imported and instantiated in no-op mode.

---

### 9) Implement baggage-backed sturdyref store adapter

**Commit type:** `feat(ocapn-durable-client): ...`  
**Change set:**

- Add sturdyref store implementation using live-slots baggage-backed maps/stores.
- Adapt core sturdyref APIs to consume abstract store interface added earlier.

**Tests:**

- Port sturdyref tests to run against both:
  - in-memory adapter
  - baggage adapter (or deterministic mock of baggage interface if needed).

---

### 10) Implement baggage-backed import/export table adapter

**Commit type:** `feat(ocapn-durable-client): ...`  
**Change set:**

- Implement durable `OcapnTable` backend preserving interface expected by `referenceKit` and codecs.
- Keep GC/refcount semantics explicit and deterministic in durable mode (no reliance on host finalization timing).

**Tests:**

- Dual-mode table conformance tests:
  - slot registration
  - refcount commit/abort
  - settler lifecycle
  - drop behavior.

---

### 11) Add durable boundary policy implementation

**Commit type:** `feat(ocapn-durable-client): ...`  
**Change set:**

- Enforce durable mode passability rules:
  - allow copydata
  - allow durable remotables only
  - reject ephemeral remotables crossing boundary
- Wire policy into durable package composition.

**Tests:**

- Positive tests for durable-capable objects.
- Negative tests for plain `Far` exports where durability metadata is absent.

---

### 12) Add resume-aware netlayer adapter

**Commit type:** `feat(ocapn-durable-client): ...`  
**Change set:**

- Implement adapter that layers resume metadata over existing netlayer contract.
- Supports reconnect attaching to existing logical session when policy approves.

**Tests:**

- Simulated disconnect/restart/reconnect integration tests.
- Validate session continuity expectations for slot and sturdyref tables.

---

### 13) Integrate durable package end-to-end with restart test harness

**Commit type:** `test(ocapn-durable-client): ...`  
**Change set:**

- Add integration tests demonstrating:
  - process/vat restart
  - resumed session (or session rebind) without losing durable tables
  - sturdyref table continuity
  - expected handling of in-flight ephemeral answers.

**Tests:**

- New restart harness tests become required for durable package CI.

---

### 14) Cleanup and API stabilization

**Commit type:** `refactor(ocapn): ...` and `chore(...)`  
**Change set:**

- Remove temporary compatibility shims introduced during migration.
- Finalize naming for hook interfaces and durable package entrypoints.
- Update documentation and API snapshots.

**Tests:**

- Full package lint/test pass across modified workspaces.

## Cross-cutting test matrix to maintain each step

1. Existing `@endo/ocapn` tests (handshake, session, gc, pipeline, handoffs, sturdyrefs)
2. New conformance tests for pluggable table/store interfaces
3. Dual-mode integration tests:
   - ephemeral baseline
   - durable composition
4. Restart-focused tests for durable package

## Risks and mitigations

- **Risk:** table interface too narrow for durable backend  
  **Mitigation:** add conformance tests before durable backend implementation.

- **Risk:** resume semantics conflict with existing crossed-hello logic  
  **Mitigation:** isolate resume negotiation behind handshake extension hooks with strict fallback.

- **Risk:** durable-only boundary checks break existing tests unexpectedly  
  **Mitigation:** keep default permissive policy in core package; enforce strict policy only in durable package.

- **Risk:** accidental protocol divergence between modes  
  **Mitigation:** shared protocol core + adapter pattern, no duplicated message handlers.

## Suggested commit granularity

- Keep commits small enough to review independently:
  - one new seam/hook + tests
  - one new adapter + tests
  - one resume behavior increment + tests
- Avoid combining core seam introduction and durable adapter implementation in the same commit.
