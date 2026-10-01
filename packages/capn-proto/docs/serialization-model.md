# Serialization Model: `@endo/capn-proto` vs `@endo/ocapn`

This document catalogues the JavaScript values that round-trip cleanly
through `@endo/capn-proto`'s wire format, with side-by-side reference
to the [OCapN data model][ocapn-model]. It is descriptive, not
aspirational — it reflects what the package implements today.

  [ocapn-model]: https://github.com/ocapn/ocapn/blob/main/draft-specifications/Model.md

The package has **one encode path**: schema-typed Cap'n Proto. Method
parameters and results are encoded as Cap'n Proto structs at the
`Payload.content` AnyPointer slot, byte-compatible with `capnpc`-
generated code in any language. There is no JSON-over-bytes fallback;
every interface method requires a registered `methodCodec` (typically
auto-derived via `loadSchema(text).registerInterface(registry, name)`).

---

## Atoms (primitives)

OCapN [Model.md §"Atoms"][ocapn-model] defines: Undefined, Null,
Boolean, Integer (arbitrary precision), Float64, String, Symbol,
ByteArray.

| Atom | OCapN | capn-proto |
|---|---|---|
| `undefined` | first-class (distinct from Null) | not directly representable as a value; only as the absent state of an optional pointer or a `Void` field |
| `null` | first-class | not directly representable as a value |
| Boolean | `true` / `false` | `Bool` field (1-bit slot) |
| Integer | arbitrary precision | `Int8`/`Int16`/`Int32`/`Int64`/`UInt8`/…/`UInt64` field types — fixed-width, no arbitrary precision |
| Float64 | IEEE 754, distinguishes `-0` and `+0`, preserves NaN, ±∞ | `Float32`/`Float64` field types — full IEEE 754 fidelity (including `-0`, NaN, ±∞) |
| String | Unicode code points excluding surrogates | `Text` (UTF-8, NUL-terminated) — surrogates are not validated |
| Symbol | first-class as `selector` (registered/well-known) | **✗** — no Symbol field type |
| ByteArray | first-class | `Data` field type, raw bytes |

**Numeric note.** Where OCapN cleanly distinguishes Integer (arbitrary
precision) from Float64, capn-proto's schema-typed encoding uses
explicit fixed-width fields per the `.capnp` declaration. A schema
that wants both shapes must declare both kinds of fields.

**JS-only value losses.** `Date`, `Map`, `Set`, `RegExp`, `URL`,
`Symbol`, registered/well-known symbols, function-as-value, and
sparse arrays have no Cap'n Proto wire representation. This is the
largest delta vs OCapN's pass-style codec, which routes through
`@endo/marshal` and supports `makeTagged`-based extensibility.

---

## Containers

OCapN defines: List, Struct (string-keyed records), Tagged (a
`{ tag: String, value: Value }` pair).

| Container | OCapN | capn-proto |
|---|---|---|
| Heterogeneous List | `desc:list-of-values` | **✗** for heterogeneous types; `List(T)` is homogeneous; `List(AnyPointer)` not yet supported |
| Struct (string-keyed record) | `desc:record` (key-ordered) | named `struct` declarations from the schema; field names + ordinals are part of the schema, not the wire |
| Anonymous union | n/a (use Tagged) | first-class: `union { ... }` inside a struct produces a `which` discriminator + a synthetic `which` field at decode time |
| Tagged value | first-class — `{ tag, value }`, the protocol-emergence hook | **✗** — the schema language has no tagged type. Users encode tag+value as a struct with a discriminator. |
| Capnp-only: `enum` | n/a | named enum declaration; encodes as `UInt16` on the wire, surfaces as the member-name string at decode time |
| Capnp-only: `group` | n/a | a struct's fields can be syntactically nested under a group name without changing the wire layout — purely a JS-shape concern |

**Tagged-type extensibility is the headline gap.** OCapN's tagged-value
mechanism is the protocol-emergence hook — sturdy refs, handoff
envelopes, error values, and any user-defined extension all live there.
capn-proto's schema-typed codec is structural, not tagged: any new
"kind" requires updating the schema and republishing.

---

## Reference values (capabilities and promises)

OCapN models references as a unified `Target` (local or remote) plus
`Promise`. capn-proto has the Cap'n Proto `CapDescriptor` enum, which
distinguishes how the reference is reached on the wire:

| Capnp `CapDescriptor.kind` | What it means | OCapN equivalent |
|---|---|---|
| `senderHosted` | "I (the sender) host this cap; my export id is N" | `desc:remote-object` from sender to receiver |
| `senderPromise` | "I host this promise; my export id is N; expect a `Resolve` later" | `desc:remote-promise` |
| `receiverHosted` | "*You* (the recipient) host this cap; this is the import id you gave me, bouncing back" | pass-back; receiver recognises its own id |
| `receiverAnswer` | "Pipelining target: address it via question id Q, transform path T" | promise pipelining; OCapN's transform-path equivalent |
| `thirdPartyHosted` | "C hosts this cap; here's how to reach C" (L3 handoff) | `desc:handoff-give` / `desc:handoff-receive` (with cryptographic envelope in OCapN) |
| `none` | null cap | absence |

`thirdPartyHosted` is the closest analogue to OCapN's signed handoff,
but **without OCapN's PublicKey + Signature.** capn-proto's L3 handoff
is unauthenticated by design — Cap'n Proto's spec leaves crypto-backed
attestation to the VatNetwork layer, and the in-package
`makeTwoPartyVatNetwork` does not provide one.

**No sturdy refs.** capn-proto has no equivalent to OCapN's
`desc:sturdyref` — there is no representation for a persistent,
location-plus-swissnum reference that survives across reconnects.
The Cap'n Proto spec puts that at Level 2, which is not implemented
here. References in this package are connection-local: when the
connection drops, every Presence backed by it becomes dead.

---

## Errors

OCapN treats errors as a copy-data type with a rejection reason, with
spec details around content invariants.

In capn-proto, errors are **not values** — they are control-flow on
the wire. A `Return` whose `result` is `kind: 'exception'` carries an
`Exception { type, reason }` struct, and the recipient rethrows it
out of the awaiting question. There is no schema field type for
"Error-as-data"; if a user tries to put an Error in a struct field
the encoder either rejects it (no matching field) or treats it as a
capability (which then fails to export). OCapN passes `Error` as a
copy value; in capn-proto it is not.

---

## Identity and equality

OCapN's [§"Pass Invariant Equality"][ocapn-model] requires that
copy-data round-trips preserve equality across passage, and that
References preserve identity (a Target equals only itself).

capn-proto matches the **identity-of-References** half:

| Property | capn-proto behaviour |
|---|---|
| Same Presence imported repeatedly on one connection | identical reference (`importIdToPresence` weak-value map in `src/imports.js`) |
| Same JS object exported repeatedly on one connection | identical export id (`valToExportId` WeakMap in `src/exports.js`) |
| Same Presence across two connections in the same vat | distinct reference; the `CapHomeRegistry` records origin so the encoder doesn't mis-route, but no equality |
| Lifetime | `refCount` reaches zero ⇒ entry dropped, peer expected to send `Release`; `FinalizationRegistry` on the import side fires `Release` automatically when the user-facing Presence is GC'd |

The **copy-data equality** half is implicit: the schema-typed codec is
deterministic and has no nondeterministic encoding, so two
structurally-equal inputs encode to byte-equal outputs and decode to
structurally-equal outputs. capn-proto does not promise stronger
equality than that — for example a struct containing two
physically-different but structurally-equal sub-structs encodes them
as two separate copies, not as a deduplicated pointer.

---

## Bidirectional table

The condensed view, JS value → wire representation:

| JS value | OCapN pass-style | capn-proto |
|---|---|---|
| `undefined` | passable | `Void` slot only |
| `null` | passable | absent pointer |
| `true` / `false` | passable | `Bool` field |
| `42` (number) | passable as Float64 | `Int*`/`UInt*`/`Float*` field |
| `42n` (bigint) | passable as Integer | `Int64`/`UInt64` only |
| `"hi"` | passable | `Text` field |
| `Symbol.for('x')` | passable | **rejected** |
| `Uint8Array` | passable | `Data` field |
| `[1, 2, 3]` | passable | `List(Int*)` etc. |
| `{ a: 1 }` | passable | named struct |
| `new Date(...)` | **not passable** | **rejected** |
| `new Map()` | **not passable** | **rejected** |
| `new Set()` | **not passable** | **rejected** |
| `/regex/` | **not passable** | **rejected** |
| `new Error('...')` | passable | **rejected** |
| `Promise` | passable as remote-promise | n/a — settle to a cap, not a value |
| Exo / remote presence | passable as remote-object | dedicated cap-pointer field type |
| `makeTagged('foo', value)` | passable | **no equivalent** |
| Sturdy ref | passable as `desc:sturdyref` | **no equivalent** |
| Signed handoff | passable as `desc:handoff-{give,receive}` | unauthenticated `thirdPartyHosted` (no signature) |

---

## Summary deltas

The three concrete gaps with the OCapN model:

1. **No tagged-type extensibility.** OCapN has a single mechanism
   (`makeTagged`) for everything from `Date` to `Error` to sturdy
   refs. capn-proto's schema-typed codec is structural-only — a new
   "kind" requires updating the `.capnp` schema and redeploying.

2. **No persistent / signed identity.** OCapN's sturdy refs and
   signed handoff envelopes give crypto-backed identity that survives
   reconnects and lets a third party verify custody. capn-proto's
   identity is connection-local: same WeakMap discipline as OCapN
   *within* a connection, but no equivalent to `desc:sturdyref` or
   the PublicKey + Signature on `desc:handoff-{give,receive}`. This
   is consistent with the Cap'n Proto spec — persistence is L2 and
   isn't implemented here.

3. **Error-as-data.** OCapN passes `Error` as a copy value; in
   capn-proto an Error has no field type to hold it. A fix would
   require a schema convention (e.g. an `ErrorRecord` struct with
   reason/type fields).
