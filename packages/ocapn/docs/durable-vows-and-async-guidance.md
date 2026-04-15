# Durable OCapN: Vows and async analogue guidance

## Purpose

This note evaluates whether live-slots Vows (durable promise analogue) and
"async function analogue" patterns are needed to ensure that only durable
objects end up in OCapN import/export table state.

It is written against the current OCapN and `@endo/ocapn-durable-client`
implementation in this repository.

## Short answer

- **If durable mode forbids exporting promises across OCapN**, then Vows are
  **not required** for durable table correctness. Durable Exos + copy data are
  enough.
- **If durable mode allows unresolved async references to cross the network and
  survive restart**, then a durable promise representation (for example Vows) is
  **required**, plus explicit integration points.
- The current implementation persists both local object and local promise slots
  in durable tables, so policy must be explicit to avoid accidental persistence
  of non-durable promises.

## What the current code does

### 1) Promise vs object slot typing is native-Promise-based

In `packages/ocapn/src/client/ref-kit.js`, slot type selection for new exports
is:

- `'p'` when `value instanceof Promise`
- `'o'` otherwise

That means any promise analogue that is not a native/recognized Promise object
will be treated as an object export slot (`o+`), not a promise slot (`p+`).

### 2) Durable table persistence currently includes both `o+` and `p+`

In `packages/ocapn-durable-client/index.js` (`makeDurableOcapnTableFactory`),
`registerSlot` persists local slots when:

- slot is local (`+`)
- position > 0
- type is `'o'` or `'p'`

So unresolved local promises can currently be recorded in durable table state.

### 3) Pass-style promise detection is strict

`ocapnPassStyleOf(...)` delegates to `passStyleOf(...)`, and `passStyleOf`
recognizes promises via `isPromise(...)` where:

`Promise.resolve(candidate) === candidate`

So arbitrary thenables are rejected as "non-promise thenables"; only true
promises count as pass-style `promise`.

## Why this matters for durable-only boundaries

The user goal is: only durable references (for example durable Exos) plus
copy-data survive into durable import/export state.

Persisting a normal JS Promise in durable table state is generally unsafe for
cross-incarnation durability. In this repo's fs-backed test baggage, non-plain
objects are encoded as process-local references, which is useful for tests but
not durable across process boundaries.

Therefore, promise policy must be explicit.

## Where Vows are needed

Use Vows (or an equivalent durable promise abstraction) if you need either:

1. **Durable pending export continuity**  
   A local pending async result is exported, and after restart the same logical
   pending reference must still exist and settle correctly for peers.

2. **Durable in-flight session semantics**  
   Protocol/session machinery must survive restart with pending async state
   represented as durable references rather than being failed/aborted.

Without a durable promise analogue, these semantics cannot be made robust across
full restart.

## Where Vows are not needed

Vows are not necessary if durable mode adopts this stricter policy:

1. **No exported promises in durable mode**  
   Reject any attempt to persist/export `p+` slots.

2. **Only durable objects and copy-data cross durable boundary**  
   Exported references are durable Exos; async work is internal and resolved
   before crossing the boundary.

3. **Restart invalidates in-flight transient async references**  
   Any unresolved async interaction is retried/re-established by protocol-level
   logic instead of being persisted as a durable promise capability.

For this policy, durable enforcement can remain at baggage/store layer and
table-layer checks.

## "Async function analogue" guidance

There are two useful analogues to plain `async`/`await` in durable contexts:

1. **Guard-level async semantics** (`M.callWhen(M.await(...))`)  
   This expresses async method contracts without requiring ad hoc promise
   handling at every call site.

2. **Eventual-send continuation style** (`E.when(...)`)  
   This keeps async flow explicit and easier to gate before durable persistence.

Related durable runtime guidance from vat-data ecosystem: durable kind *maker*
definitions are synchronous (no async maker initialization).

## Recommended policy for OCapN durable mode

### Phase A (recommended now): strict no-promise durability

- In durable table adapter, reject registration of local `p+` slots.
- Keep allowing local `o+` durable values and copy-data-based workflows.
- Document that unresolved promise exports are unsupported in durable mode.

This directly enforces "only durable objects end up in durable table state".

### Phase B (optional later): explicit durable-promise support

If promise exports must survive restart:

- Add an explicit `isDurablePromise(value)` hook at durable table boundary.
- Do not infer durable-promise status from `instanceof Promise` alone.
- Add encoding/persistence semantics for durable promises in baggage.
- Add restart tests proving `p+` continuity with durable promise abstractions.

## Concrete enforcement points in current code

Primary places to enforce policy:

1. `packages/ocapn-durable-client/index.js`
   - `makeDurableOcapnTableFactory(...).registerSlot(...)`
   - decide allow/reject for local `p+` persistence

2. `packages/ocapn/src/client/ref-kit.js`
   - `provideSlotForValue(...)` slot kind choice
   - consider replacing `instanceof Promise` with an injected classifier if/when
     durable-promise support is introduced

3. Documentation and tests
   - test that non-durable promises are rejected in durable mode
   - test that durable objects are accepted
   - if Vow support is added: test restart continuity for durable promises

## Research notes / limitations

- This repository does not currently contain live-slots Vow implementation APIs.
- Existing docs in this repo already note that reusable live-slots durability
  primitives (for example vat-data durable stores/exo prep helpers) are outside
  this tree.
- Therefore, Vow integration here should be treated as a composition seam, not
  as an in-repo concrete implementation today.
