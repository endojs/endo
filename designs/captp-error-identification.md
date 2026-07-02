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

**OCapN/CapTP change:** a new, versioned/negotiated per-message `errorIds` field
(parallel to `slots`) in the OCapN message framing, and the CapTP marshal glue
that populates and consumes it. This is a wire-format addition and must be
specified in OCapN and gated by capability negotiation so pre-change peers
degrade gracefully (an absent side channel means "no identification available",
never a decode failure).

### Sender-scoped, stable identifiers (invariants 1 and 5)

The sending marshal assigns identifiers from its own namespace. To make re-sends
stable, the send side keeps a **WeakMap `sourceError → assignedId`**: the first
serialization of a given error object allocates a fresh id from the sender's
monotone counter; subsequent serializations of the *same* object reuse it. The
namespace is dictated entirely by the sender (`marshalName`-scoped counter, or an
OCapN-defined per-session sender sequence).

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

## An alternative to `unredacted-stack.js` (@erights)

Inline on `packages/daemon/src/unredacted-stack.js:53`, kriskowal wrote, tagging
@erights: *"This should not be. We need an alternative."* Line 53 is the tap of
`globalThis.getStackString`; the module also reaches
`globalThis[Symbol.for('MAKE_CAUSAL_CONSOLE_FROM_LOGGER_KEY_FOR_SES_AVA')]` — the
same undocumented SES start-compartment hooks `@endo/ses-ava` uses to surface
unredacted causal traces. The daemon should not depend on an ses-ava-internal
symbol and an undocumented global accessor to render unredacted error diagnostics.

**Proposed alternative (design intent; final shape is @erights' call):**

1. **Capture at the throw site, not by reconstruction.** The unredacted rendering
   is privileged information that belongs to the party that *holds* the error —
   the worker where the error originated. Capture the unredacted diagnostic in the
   worker at `marshalSaveError` time (in the trusted start compartment, where the
   information is legitimately available) and ship the **pre-rendered** text as
   the `TraceRecord` payload. The daemon aggregator then stores rendered text and
   performs **no** SES-internal access of its own — the tap disappears from the
   daemon entirely.

2. **Consume a sanctioned SES API, not the ses-ava symbol.** Even at the worker
   throw site, the capture should call a **first-class, supported SES export** for
   privileged unredacted rendering rather than the `MAKE_CAUSAL_CONSOLE_…` symbol
   or `getStackString`. This design proposes that `ses` grow (or bless) such an
   API — e.g. a start-compartment-only `getErrorDiagnostic(err)` / public
   causal-console factory — and that both `@endo/ses-ava` and this daemon consumer
   migrate onto it, retiring the shared symbol hack. That SES change is an
   upstream endo issue to be filed and is a **dependency** of the build, not part
   of this fork's build.

3. **Feature-test against the sanctioned API.** The daemon keeps a narrow
   feature-test/fallback (to `err.stack`) but tests for the *sanctioned* API, so
   the daemon no longer breaks when SES retires the ses-ava symbol.

@erights: this section is the specific request for your input — whether the
sanctioned-SES-API path is the alternative you have in mind, or whether unredacted
capture should be structured differently (e.g. never leaving the worker at all).

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

## Open Questions

1. **Wire-format negotiation.** How is the new `errorIds` side channel negotiated
   so mixed-version peers interoperate? Likely an OCapN capability bit; absent it,
   errors carry no identification (graceful, not fatal).
2. **Namespace form.** Is the sender namespace the `marshalName`-scoped counter or
   an OCapN-defined per-session sequence? The latter is cleaner for pairwise
   scoping but requires OCapN to own the numbering.
3. **SES API shape.** Exact signature of the sanctioned unredacted-diagnostic SES
   export — @erights to steer (see the alternative above). This is the gating
   upstream dependency.
4. **Facet placement.** Where the closely-held `identifyError` facet is minted
   (per-session bootstrap vs. explicit grant) and its relationship to the existing
   host `traces` facet.
