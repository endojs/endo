# Serialization Model: `@endo/capn-proto` vs `@endo/ocapn`

This document catalogues the JavaScript values that round-trip cleanly
through `@endo/capn-proto`'s wire formats, with side-by-side reference
to the [OCapN data model][ocapn-model]. It is descriptive, not
aspirational — it reflects what the package implements today.

  [ocapn-model]: https://github.com/ocapn/ocapn/blob/main/draft-specifications/Model.md

The package has **two encode paths**, and they have different value
spaces:

1. **JSON-payload codec** (`src/payload-codec.js`) — the default for
   Call/Return parameters when no schema is registered. Uses a private
   tagged-string convention layered on top of standard JSON, plus a
   side `capTable` for capabilities.
2. **Schema-typed codec** (`src/schema/codec.js`) — used for Call/Return
   parameters when an interface registers a `methodCodecs` entry, and
   directly available via `loadSchema(text).encode(...)`. Pure
   Cap'n Proto wire format, byte-identical to `capnpc`-generated code.

The two paths share the same capability descriptor mechanism (see
*Reference values* below) but serialise data values quite differently.

---

## Atoms (primitives)

OCapN [Model.md §"Atoms"][ocapn-model] defines: Undefined, Null,
Boolean, Integer (arbitrary precision), Float64, String, Symbol,
ByteArray.

| Atom | OCapN | capn-proto JSON-payload | capn-proto schema-typed |
|---|---|---|---|
| `undefined` | first-class (distinct from Null) | first-class (preserved by `JSON.stringify`/`JSON.parse` round-trip via `replace`/`restore` — though strict JSON loses it; `decodePayload` on an empty payload returns `undefined`) | not directly representable as a value; only as the absent state of an optional pointer or a `Void` field |
| `null` | first-class | first-class | not directly representable as a value |
| Boolean | `true` / `false` | first-class | `Bool` field (1-bit slot) |
| Integer | arbitrary precision | `bigint` round-trips via the `@bigint:<decimal>` tagged string; `number` (Float64) flows as plain JSON | `Int8`/`Int16`/`Int32`/`Int64`/`UInt8`/…/`UInt64` field types — fixed-width, no arbitrary precision |
| Float64 | IEEE 754, distinguishes `-0` and `+0`, preserves NaN, ±∞ | passes through `JSON.stringify`/`JSON.parse`; `-0` collapses to `0`, NaN and ±∞ become `null` (standard JSON limitations) | `Float32`/`Float64` field types — full IEEE 754 fidelity (including `-0`, NaN, ±∞) |
| String | Unicode code points excluding surrogates | first-class | `Text` (UTF-8, NUL-terminated) — surrogates are not validated |
| Symbol | first-class as `selector` (registered/well-known) | **✗** — encoder throws `unencodable value of type symbol` | **✗** — no Symbol field type |
| ByteArray | first-class | `Uint8Array` round-trips via `@bytes:<base64>` tagged string | `Data` field type, raw bytes (no base64) |

**Numeric note.** Where OCapN cleanly distinguishes Integer (arbitrary
precision) from Float64, capn-proto's JSON-payload codec leans on the
JS `bigint` / `number` split. Inside a schema-typed struct the
distinction is sharper — the schema explicitly tags each field as
`IntN`/`UIntN`/`FloatN`, and that's what flows on the wire.

**JS-only value losses through JSON.** `Date`, `Map`, `Set`, `RegExp`,
`URL`, `Symbol`, registered/well-known symbols, function-as-value, and
sparse arrays are all rejected (or mangled) by the JSON-payload codec.
The schema-typed path doesn't admit them either — Cap'n Proto's wire
format has no slots for them. This is the largest delta vs OCapN's
pass-style codec, which routes through `@endo/marshal` and supports
makeTagged-based extensibility.

---

## Containers

OCapN defines: List, Struct (string-keyed records), Tagged (a
`{ tag: String, value: Value }` pair).

| Container | OCapN | capn-proto JSON-payload | capn-proto schema-typed |
|---|---|---|---|
| Heterogeneous List | `desc:list-of-values` | plain JSON arrays; element types per entry are independent | `List(T)` — homogeneous; `List(AnyPointer)` not yet supported |
| Struct (string-keyed record) | `desc:record` (key-ordered) | plain JSON objects; insertion order preserved by JSON.parse | named `struct` declarations from the schema; field names + ordinals are part of the schema, not the wire |
| Anonymous union | n/a (use Tagged) | n/a — would be modeled as a discriminated record with a literal `kind` field by convention | first-class: `union { ... }` inside a struct produces a `which` discriminator + a synthetic `which` field at decode time |
| Tagged value | first-class — `{ tag, value }`, the protocol-emergence hook | **✗** — there is no end-user-visible "tagged" mechanism. The four hardcoded `@kind:` markers (`@cap:`, `@promise:`, `@bigint:`, `@bytes:`) are private to the codec and not extensible. | **✗** — the schema language has no tagged type. Users encode tag+value as a struct with a discriminator. |
| Capnp-only: `enum` | n/a | n/a | named enum declaration; encodes as `UInt16` on the wire, surfaces as the member-name string at decode time |
| Capnp-only: `group` | n/a | n/a | a struct's fields can be syntactically nested under a group name without changing the wire layout — purely a JS-shape concern |

**Tagged-type extensibility is the headline gap.** OCapN's tagged-value
mechanism is the protocol-emergence hook — sturdy refs, handoff
envelopes, error values, and any user-defined extension all live there.
capn-proto has no equivalent: the JSON-payload codec recognises four
fixed `@kind:` markers and rejects any new ones (a stray
`"@anything:..."` string round-trips as a literal string), and the
schema-typed codec is structural, not tagged.

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
out of the awaiting question. A user trying to *pass* an `Error`
object as a Call argument hits the JSON-payload codec's `typeof
'object'` branch, falls into the cap-detection path (Errors have a
non-Object prototype), and is treated as a capability — which fails
when the codec tries to export it. This is a real divergence: in OCapN
an Error is a passable copy value; in capn-proto it is not.

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

The **copy-data equality** half is implicit: both codecs are
deterministic and have no nondeterministic encoding (e.g. no
random object key ordering), so two structurally-equal inputs encode
to byte-equal outputs and decode to structurally-equal outputs.
capn-proto does not promise stronger equality than that — for example
a struct containing two physically-different but structurally-equal
sub-structs encodes them as two separate copies, not as a deduplicated
pointer.

---

## Bidirectional table

The condensed view, JS value → wire representation in each codec:

| JS value | OCapN pass-style | capn-proto JSON-payload | capn-proto schema-typed |
|---|---|---|---|
| `undefined` | passable | passable (lossy via JSON) | `Void` slot only |
| `null` | passable | passable | absent pointer |
| `true` / `false` | passable | passable | `Bool` field |
| `42` (number) | passable as Float64 | passable | `Int*`/`UInt*`/`Float*` field |
| `42n` (bigint) | passable as Integer | tagged `@bigint:42` | `Int64`/`UInt64` only |
| `"hi"` | passable | passable | `Text` field |
| `Symbol.for('x')` | passable | **rejected** | **rejected** |
| `Uint8Array` | passable | tagged `@bytes:<b64>` | `Data` field |
| `[1, 2, 3]` | passable | passable | `List(Int*)` etc. |
| `{ a: 1 }` | passable | passable | named struct |
| `new Date(...)` | **not passable** | **rejected** | **rejected** |
| `new Map()` | **not passable** | **rejected** | **rejected** |
| `new Set()` | **not passable** | **rejected** | **rejected** |
| `/regex/` | **not passable** | **rejected** | **rejected** |
| `new Error('...')` | passable | **rejected** (treated as cap, exportCap fails) | **rejected** |
| `Promise` | passable as remote-promise | tagged `@promise:N` (cap table entry, kind=senderPromise) | n/a — settle to a cap, not a value |
| Exo / remote presence | passable as remote-object | tagged `@cap:N` (cap table entry) | dedicated cap-pointer field type |
| `makeTagged('foo', value)` | passable | **no equivalent** | **no equivalent** |
| Sturdy ref | passable as `desc:sturdyref` | **no equivalent** | **no equivalent** |
| Signed handoff | passable as `desc:handoff-{give,receive}` | unauthenticated `thirdPartyHosted` (no signature) | n/a |

---

## Summary deltas

The two main gaps with the OCapN model:

1. **No tagged-type extensibility.** OCapN has a single mechanism
   (`makeTagged`) for everything from `Date` to `Error` to sturdy
   refs. capn-proto's JSON-payload codec has four hardcoded `@kind:`
   markers and the schema-typed codec is structural-only. Adding a
   `Date` would today require either a new private marker
   (closed-set, breaks compatibility with anyone else using the same
   codec) or replacing the JSON-payload codec with `@endo/marshal`
   (open-set via tagged values).

2. **No persistent / signed identity.** OCapN's sturdy refs and
   signed handoff envelopes give crypto-backed identity that survives
   reconnects and lets a third party verify custody. capn-proto's
   identity is connection-local: same WeakMap discipline as OCapN
   *within* a connection, but no equivalent to `desc:sturdyref` or
   the PublicKey + Signature on `desc:handoff-{give,receive}`. This
   is consistent with the Cap'n Proto spec — persistence is L2 and
   isn't implemented here.

A cleaner solo-package gap is **Error-as-data**: OCapN passes
`Error` as a copy value; in capn-proto an Error in user data is
silently misclassified as a cap and the encode fails. Even within the
existing tagged-marker framework this could be fixed with a fifth
`@error:` marker.
