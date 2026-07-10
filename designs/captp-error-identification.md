# CapTP Error Identification

| | |
|---|---|
| **Created** | 2026-07-02 |
| **Updated** | 2026-07-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Draft — design only, no implementation |

## What is the Problem Being Solved?

Error tracing across CapTP workers landed in
[#58](https://github.com/endojs/endo-but-for-bots/pull/58) (implementing the
design from #50, addressing
[endojs/endo#1879](https://github.com/endojs/endo/issues/1879)). Workers push a
`TraceRecord` for every error their outbound CapTP marshal serializes; the
daemon aggregates records under the worker's authoritative formula id; the CLI
resolves an operator-visible id back to the originating worker's stack.

In review [4612637233](https://github.com/endojs/endo-but-for-bots/pull/58#pullrequestreview-4612637233)
(2026-07-02, on the merged PR) kriskowal asked for **a follow-up design** that
preserves the same functionality but improves OCapN and CapTP so that error
**identification** obeys a precise set of invariants that the #58 mechanism does
not yet satisfy. The shipped mechanism embeds the sender's `errorId` **as a data
field inside the pass-style error record on the wire**, and reflects it onto the
decoded error's `.name` (`Remote${name}(${errorId})`). That places the identifier
*on the error object* — exactly what the invariants below forbid.

This design specifies how each invariant is met and names the OCapN- and
CapTP-level changes required. It is a **design-phase deliverable**; the build is
a separate PR.

### The hard invariants (verbatim intent from the review)

1. **In-band, sender-namespaced id.** The error id is communicated **in-band on
   the wire**, assigned in a **namespace dictated by the sender**.
2. **Aggregator key is a pair.** For the aggregator, an error is identified by
   the pair **(worker formula identifier, worker-assigned error identifier)**.
3. **Not on the error object.** The error id **must not** be on the pass-style
   error object — not on the heap, not on the wire. It **must be possible, and
   proven with tests**, that an error carries an `errorId` **data property that
   is unrelated to and different from** the sender-assigned error identifier.
4. **Closely-held `identifyError` + side table.** A CapTP client's holder of a
   closely-held server object identifies an error via a **closely-held method
   (e.g. `identifyError`)**, with the identifier in a **side table (WeakMap)**,
   never a property of the error.
5. **Stable id, distinct identity on re-send.** An error sent twice through the
   same CapTP arrives with the **same identifier** but **different JavaScript
   object identities** (neither `===` nor `Object.is`).
6. **Identification is pairwise-pass-invariant; identity is not.** Identification
   is **not** invariant across multiple CapTP hops; **identity is scoped to the
   sender**.

## Current State (what #58 ships)

`packages/marshal/src/marshal.js`, error encode path:

```js
// encodeErrorCommon
const errorId = encodeRecur(nextErrorId());      // `error:${marshalName}#N`
annotateError(err, X`Sent as ${errorId}`);
marshalSaveError(err, errorId);                  // out-of-body hook
return harden({ errorId, message, name });       // <-- id ON the wire record
```

Decode path names the reconstructed error `Remote${name}(${errorId})` and passes
`(decodedError, errorId)` to the optional `marshalLoadError` hook. `@endo/captp`
forwards both hooks through `CapTPOptions`. `@endo/daemon`'s `trace-aggregator.js`
keys records by `(workerId, errorId)` where `workerId` is stamped from connection
identity (authoritative), and the worker pushes records over an **out-of-band**
`reportTrace` daemon method.

Two properties of the current mechanism conflict with the invariants:

- The identifier travels **inside** the error record (`{ errorId, message, name }`)
  and is reflected onto `.name` — violating invariant 3.
- `nextErrorId()` increments on **every** serialization, so the *same* source
  error serialized twice gets *two different* ids — violating invariant 5.

The sender-namespacing (`error:${marshalName}#N`) and the authoritative
worker-id stamping are already correct and are preserved.

## Description of the Design

### The core move: hoist error ids out of the error body, into a frame side channel

CapTP already hoists passable **capabilities** out of the serialized body into a
parallel `slots` array, referencing them positionally from the body. We apply the
same shape to error identifiers.

- The wire encoding of a pass-style error carries **only** `{ name, message }`
  (and, once decoders tolerate them, `cause` / `errors`). It carries **no**
  `errorId`.
- Each serialized error is assigned a **sender-scoped identifier** and that
  identifier is emitted **out of the body** into a parallel per-message
  structure — an `errorIds` side channel on the CapTP message descriptor,
  analogous to `slots`. The body references errors positionally (an error-slot
  marker) whose id is resolved through the side channel.
- The identifier remains **in-band** in the OCapN sense: it rides the same CapTP
  frame as the message that carries the error, not a separate out-of-band push.
  (This retires #58's dependence on a separate `reportTrace` round-trip for the
  *identifier*; see "Relationship to the aggregator" below.)

This satisfies **invariant 1**: in-band on the wire, namespace dictated by the
sender. The receiver treats the identifier as opaque and meaningful only relative
to the sending peer.

**OCapN/CapTP change:** a new per-message `errorIds` field (parallel to `slots`)
in the OCapN message framing, and the CapTP marshal glue that populates and
consumes it. This is a wire-format addition to be specified in OCapN. Per
kriskowal's review of #595 — *"we do not yet have existing deployments of any
consequence"* — backward compatibility with pre-change peers is **not** a
constraint on this change: the wire format may change outright rather than being
gated behind capability negotiation for old peers. (Version negotiation may still
be added later as OCapN matures, but it is not a requirement of this change, and
its absence is not a blocker.)

### Sender-scoped, stable identifiers (invariants 1 and 5)

The sending marshal assigns identifiers from its own namespace. To make re-sends
stable, the send side keeps a **WeakMap `sourceError → assignedId`**: the first
serialization of a given error object allocates a fresh id from the sender's
monotone sequence; subsequent serializations of the *same* object reuse it.

Per kriskowal's review of #595 — *"it will be good for OCapN and CapTP to own the
numbering"* — the id is drawn from an **OCapN-defined per-session sender
sequence** owned by OCapN/CapTP, **not** an ad-hoc `marshalName`-scoped marshal
counter. This does not weaken invariant 1: the namespace is still *dictated by the
sender* — OCapN defines the *scheme* and owns the sequence, while the sender
remains the party that allocates the next id from it. Making OCapN own the
numbering keeps the id space uniform across marshal instances and gives the
pairwise scoping a single authoritative definition rather than a per-marshal
convention.

On the receive side, CapTP decodes each transmission into a **fresh** Error
object (errors are by-copy pass-style; nothing interns them). Therefore two
transmissions of one source error arrive as two distinct objects that share one
sender id:

```js
const a = await bob.echo(theError);
const b = await bob.echo(theError);
assert(a !== b && !Object.is(a, b));                 // distinct identities
assert(identifyError(a) === identifyError(b));       // same sender id
```

This is **invariant 5**, and it drops out of the design rather than being
engineered specially: the send-side WeakMap gives id stability; by-copy decode
gives identity distinctness.

### Identifier lives only in a side table; never on the error (invariant 3)

The decode path **must not** write the identifier onto the decoded error — not
onto `.name`, not as an own property. Instead, the receiving CapTP maintains a
**WeakMap `decodedError → senderId`**, populated as each error arrives (the
existing `marshalLoadError(err, senderId)` hook is the natural population point,
redefined so that the hook records into the side table and never mutates `err`).

Because the side table is a WeakMap keyed by object identity, it collects with
the error and exposes nothing ambiently.

**The independence proof (invariant 3, "proven with tests").** Application code
may legitimately use a data property named `errorId` on its own errors for its
own purposes. The CapTP identification scheme must never read from, collide with,
or overwrite such a property. The test constructs an error whose own `errorId`
data property holds an application value, sends it, and asserts:

```js
const err = harden(makeError('boom'));
err.errorId = 'app-chosen-value';                    // unrelated application data
const received = await peer.roundTrip(err);
// The CapTP identifier is a different, sender-assigned value:
assert(identifyError(received) !== 'app-chosen-value');
// and it is NOT reachable as a property of the error object at all:
assert(received.errorId === undefined || received.errorId === 'app-chosen-value');
assert(!('errorId' in received) || received.errorId !== identifyError(received));
```

The essential proof obligation: `identifyError(received)` (from the side table)
is unrelated to and different from any `errorId` property observable on the error
object. This forces the transport identifier and any application `errorId` field
to occupy strictly separate namespaces.

### `identifyError` is closely held (invariant 4)

Identification is an authority, not ambient. The holder of a CapTP client's
closely-held server object obtains identifiers through a **closely-held method**
on a facet it was explicitly granted — e.g. a per-session diagnostics facet:

```js
E(diagnostics).identifyError(err) // -> senderId | undefined
```

`identifyError` reads the receive-side WeakMap. It returns `undefined` for any
error that did not arrive over this CapTP (nothing to identify), and never
enumerates or lists — it only answers "what is this specific error's id, from my
direct peer's namespace?". Confined guests do not receive this facet by default;
it is granted like any other capability.

This replaces #58's more list-shaped `traces.lookup(errorId)` surface with an
ocap-clean `identifyError(err)`: you must already hold the error object *and* the
diagnostics facet to identify.

Per kriskowal's review of #595, the new `identifyError` diagnostics facet and the
existing host `traces` facet are **related**, and **consolidating them is left to
the builder's discretion**: the build may fold `identifyError` into the existing
`traces` facet, or mint a distinct per-session diagnostics facet, whichever reads
cleaner in the daemon at build time. Either way the identifier lives only in the
side table and never on the error.

**OCapN/CapTP change:** define where the closely-held identification facet is
minted (per-session bootstrap or an explicit grant) and that it reads only the
session-scoped side table.

### Identification is pairwise-pass-invariant; identity is not (invariant 6)

Across a single CapTP session A↔B, the identifier B observes for an error is
stable and corresponds to A's assignment — identification is **pairwise pass
invariant**. But:

- **Identity is not.** Every hop decodes a fresh object; JS identity never
  survives a hop.
- **Identification is not multi-hop invariant.** If B forwards the error to C, B
  re-serializes it as B's sender, assigning an id from **B's** namespace, unrelated
  to A's id. From C's view the id is scoped to its direct peer B. The id is
  **scoped to the sender**, meaning the immediate CapTP peer.

The design makes this explicit rather than accidental: identifiers are
session-and-sender scoped by construction (the send-side counter belongs to one
marshal instance; the receive-side WeakMap belongs to one session). There is no
global error identity and no attempt to make one; a stable cross-network identity
would require a fundamentally different (and unwanted) mechanism.

### Relationship to the aggregator (invariant 2)

The daemon aggregator continues to identify an error by the pair **(worker
formula identifier, worker-assigned error identifier)**:

- The **worker formula identifier** is stamped by the daemon from connection
  identity — authoritative, unspoofable, unchanged from #58.
- The **worker-assigned error identifier** is now the in-band, sender-scoped id
  from the worker↔daemon session (the worker is the sender; the daemon is its
  direct pairwise peer, so the id is meaningful to the daemon). This is precisely
  the pairwise-invariance of invariant 6: it works *because* worker↔daemon is a
  single hop.

The composite key `(workerFormulaId, senderErrorId)` is well-formed because the
daemon disambiguates same-numbered ids across different workers by the formula
id. The daemon-side side table maps *its own* CLI-facing pairwise id (a fresh
daemon-scoped id assigned when the daemon re-serializes to the CLI) to the
`(workerFormulaId, workerErrorId)` pair internally. The CLI thus identifies via
the daemon↔CLI pairwise id and never sees the worker's namespace directly — the
formal version of #58's ad-hoc "alias the daemon-side outbound errorId onto the
worker record".

This lets the aggregator drop its reliance on an id embedded in the error body;
it reads the worker id from connection identity and the error id from the frame
side channel.

## An alternative to `unredacted-stack.js` — moved to its own design

Per kriskowal's review of #595 — *"Let's post a separate design for this
improvement and hand that to @erights for review."* — the alternative to the
`packages/daemon/src/unredacted-stack.js` SES-internal tap is now its own design:
[`unredacted-stack-sanctioned-ses-api.md`](./unredacted-stack-sanctioned-ses-api.md).
It is split out because that fix depends on an upstream `ses` API decision that is
@erights' to steer, on a review track independent of error *identification*. The
two are independent changes to the same `@endo/daemon` error-diagnostics
subsystem: identification (the side-channel id) does not depend on how unredacted
diagnostics are *rendered*, and vice versa.

## Testing plan (proof obligations)

The build must prove, with tests:

- **Inv. 1/6 pairwise:** an error round-tripped A→B yields a stable
  `identifyError` id on B corresponding to A's assignment.
- **Inv. 2:** the aggregator keys by `(workerFormulaId, workerErrorId)`; two
  workers emitting the same-numbered id do not collide.
- **Inv. 3:** an error carrying its own `errorId` data property arrives with the
  transport identifier *different from and unrelated to* that property, and the
  transport id is reachable only via the side table (the independence test
  above). Also: the wire encoding of an error contains no `errorId` field
  (assert on the serialized body) and the decoded error's `.name` does not embed
  the id.
- **Inv. 4:** `identifyError` is only reachable through the granted facet;
  returns `undefined` for a locally-made error; a confined guest without the
  facet cannot identify.
- **Inv. 5:** same source error sent twice → equal ids, `!==` and
  `!Object.is(...)` object identities.
- **Inv. 6 multi-hop:** A→B→C yields a B-scoped id at C unrelated to the A→B id;
  identity differs at every hop.

## Out of scope for this design (build-phase cleanups)

Called out in the same review, to be carried by the **build** PR, not here:

- `packages/daemon/src/daemon-go-powers.js:176` — remove the unnecessary trailing
  comma / dangle.
- Move typedefs into `.d.ts` files (e.g. `packages/daemon/src/trace-aggregator.js:41`)
  rather than inline JSDoc `@typedef`. (kriskowal also asked that the garden itself
  grow builder directives + a reviewer that prevent inline typedefs recurring —
  a garden-infra follow-up, tracked separately.)

## Open Questions (all resolved by kriskowal's review of #595)

1. **Wire-format negotiation — RESOLVED (kriskowal, #595).** There are no existing
   deployments of any consequence, so mixed-version interop is not a constraint:
   the `errorIds` wire-format change lands outright, without a backward-compat
   capability-negotiation gate. (Negotiation may be added later as OCapN matures;
   it is not a prerequisite of this change.)
2. **Namespace form — RESOLVED (kriskowal, #595).** OCapN and CapTP own the
   numbering: the sender namespace is an OCapN-defined per-session sender sequence,
   not a `marshalName`-scoped marshal counter. (See *Sender-scoped, stable
   identifiers* above.)
3. **SES API shape — MOVED (kriskowal, #595).** The sanctioned unredacted-diagnostic
   SES export, and the whole `unredacted-stack.js` alternative, are now a separate
   design handed to @erights:
   [`unredacted-stack-sanctioned-ses-api.md`](./unredacted-stack-sanctioned-ses-api.md).
   Out of scope for this design.
4. **Facet placement — RESOLVED (kriskowal, #595).** The `identifyError` facet and
   the existing host `traces` facet are related; **consolidation is at the
   builder's discretion** (fold into `traces`, or mint a distinct diagnostics
   facet). See *`identifyError` is closely held* above. Where exactly the facet is
   minted (per-session bootstrap vs. explicit grant) follows from that build-time
   choice.
