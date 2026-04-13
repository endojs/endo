# Durable OCapN Client Architecture (Live-slots Baggage Backed)

## Context and goal

This document describes a target architecture for adding a **durable OCapN client mode** that survives process/vat restarts while preserving the existing ephemeral mode.

The goal is to support:

- durable import/export tables backed by live-slots baggage
- durable sturdyref registry backed by baggage
- reconnect/resume of an existing logical OCapN session after restart
- modular composition so we can run:
  - current in-memory mode
  - durable/baggage mode
  - future variants

without forking OCapN logic or feature-flag branches inside protocol flow code.

## Relevant current implementation (research summary)

### Session and client lifecycle

- `packages/ocapn/src/client/index.js`:
  - `makeClient()` manages netlayers, pending/active sessions, and connection ownership.
  - Session state is in-memory (`Map`/`WeakMap`) and rebuilt from scratch on restart.
  - `makeClient()` already allows injecting:
    - `swissnumTable` (`Map<string, any>`)
    - `giftTable` (`Map<string, any>`)
  - `prepareOcapn(...)` directly instantiates per-session OCapN state.

### Slot tables and reference tracking

- `packages/ocapn/src/captp/pairwise.js` and `ocapn-tables.js`:
  - slot/value mapping relies on:
    - `WeakMap valueToSlot`
    - in-memory import/export tables
    - in-memory refcount map
    - `FinalizationRegistry`/`WeakRef` (optional import collection)
  - this is process-local and non-durable.

### Object construction across network boundary

- Multiple network-visible objects use `Far(...)` directly:
  - bootstrap object in `client/ocapn.js`
  - resolver/settler objects in `client/ocapn.js` and `client/ref-kit.js`
  - many tests send arbitrary `Far` objects.
- This permits ephemeral remotables, which conflicts with a strict durable mode.

### Sturdyrefs

- `packages/ocapn/src/client/sturdyrefs.js`:
  - sturdyref token representation uses `makeTagged('ocapn-sturdyref', undefined)`.
  - lookup/registration uses injected `swissnumTable`.
  - details are held in module-level `WeakMap` (non-durable metadata).

### Netlayer contract

- `packages/ocapn/src/client/types.js` netlayer contract is connection-oriented:
  - `connect(location) -> Connection`
  - no built-in resume token or reconnect semantics.
- `packages/ocapn/src/client/handshake.js` supports start-session + crossed-hello handling, but not logical-session resume.

## Architectural principles

1. **Separate protocol engine from storage policy**  
   OCapN message semantics stay in `@endo/ocapn`; slot/sturdyref/session persistence moves behind injected factories.

2. **No protocol forks by mode**  
   Durable and ephemeral clients share the same core state machine and operation handlers.

3. **Durable mode is explicit composition**  
   A new package assembles durable adapters and policies; core package remains usable standalone.

4. **Boundary enforcement at export/import seam**  
   Durable mode enforces that only copy data + durable remotables cross the boundary.

5. **Resume-aware transport abstraction**  
   Logical session continuity is separate from socket continuity.

## Proposed package split

### 1) Keep `@endo/ocapn` as protocol core + composable hooks

`@endo/ocapn` should expose hook points for:

- import/export table factory (per session, and on reconnect)
- sturdyref store factory
- session persistence/resume policy
- passability/durability boundary validator
- optional resumable netlayer protocol adapter

### 2) New package: `@endo/ocapn-durable-client` (name tentative)

Responsibilities:

- construct an OCapN client using live-slots baggage-backed stores
- provide durable implementations of required factories
- provide durable policy defaults:
  - durable object boundary validator
  - resume-aware netlayer adapter
- avoid duplicate protocol logic by delegating to core `@endo/ocapn`.

## Proposed extension seams

### A. Table factory seam

Introduce an abstract session table provider (names illustrative):

- `makeImportExportTableKit(context) -> OcapnTableLike`
- called:
  - at initial session creation
  - at resumed session creation

`context` should include:

- local peer identity
- remote peer identity/location
- logical session key (stable across reconnect)
- mode metadata (`ephemeral` vs `durable`)

Core OCapN should depend only on the table interface currently consumed in `client/ocapn.js` / `client/ref-kit.js`.

### B. Sturdyref store seam

Replace direct `Map` assumptions with a store interface:

- `lookupSwissnum`
- `registerSwissnum`
- `makeSturdyRefToken` / `parseSturdyRefToken` (or equivalent)

Ephemeral mode can use current `Map + WeakMap` behavior.
Durable mode can bind swissnum metadata and object references in baggage.

### C. Boundary policy seam (durability gate)

Add a pluggable boundary validator invoked before export and after import decode:

- default policy: current behavior (remotables allowed)
- durable policy:
  - allow copydata
  - allow durable remotables only
  - reject ephemeral remotables/promises that cannot survive restart semantics

This is where replacing selected `Far` usage with `makeExo`/durable-exo constructions (provided by higher-level package) can be enforced.

### D. Session resume seam

Introduce logical session identity separated from connection object identity.

Need stable records for:

- logical session id / resume token
- peer binding (who this session is with)
- resume epoch and/or replay protection state
- table linkage key for import/export continuity

Reconnect flow should create a new `Connection` but attach it to prior logical session state when authenticated.

### E. Netlayer resume adapter seam

Extend netlayer composition with optional resume-aware behavior:

- preserve transport abstraction
- allow durable mode to inject protocol extensions for resume handshake
- keep default netlayer behavior unchanged.

Suggested layering:

- base netlayer: bytes in/out
- optional session-resume adapter: handshake metadata + resume negotiation
- OCapN core consumes normalized connection/session events

## Durable mode data model (live-slots baggage)

Durable mode should persist at least:

1. **Import/export slot tables**
   - slot -> durable reference metadata
   - durable reference key -> slot
   - committed refcounts

2. **Sturdyref registry**
   - swissnum -> durable target reference
   - sturdyref token metadata where needed for reconstruction

3. **Logical session registry**
   - peer key/location binding
   - active/inactive epoch
   - reconnect/resume token data

4. **Gift/handoff durable records (if required by semantics)**
   - pending handoffs and replay protections that must survive restart

## Mode composition matrix

| Capability | Ephemeral mode (`@endo/ocapn`) | Durable mode (`@endo/ocapn-durable-client`) |
|---|---|---|
| Import/export tables | in-memory map/weakmap | baggage-backed |
| Sturdyref table | in-memory map + weak metadata | baggage-backed |
| Session continuity | connection lifetime | logical session across reconnect |
| Netlayer | existing contract | resume-aware adapter |
| Boundary object policy | current permissive remotables | durable-only remotables + copydata |

## Compatibility expectations

- Existing `@endo/ocapn` users should not need changes for ephemeral operation.
- Durable mode should be opt-in through the new package.
- Hook interfaces should be additive and default to existing behavior.

## Open design questions

1. Should session resume be represented as new OCapN handshake operations, netlayer-private metadata, or both?
2. How are unresolved answer promises treated across restart (abort vs resumable replay)?
3. Which exact durable-object predicate should be enforced at boundary (source of truth)?
4. Are gifts/handoff tables required to persist across restart for correctness, or can they be invalidated?
5. Should sturdyref token internals remain weakly held in-memory for ergonomics while canonical data is baggage-backed?

## Proposed deliverables from implementation phase

- New package scaffold (`@endo/ocapn-durable-client`)
- Hook-enabled core OCapN refactor
- Durable table and sturdyref adapters backed by baggage
- Resume-aware netlayer adapter and protocol tests
- Boundary policy tests proving non-durable remotables are rejected in durable mode
