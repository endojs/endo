# Sequential Syrup Message Framing (`@endo/syrups`)

| | |
|---|---|
| **Created** | 2026-05-04 |
| **Updated** | 2026-05-05 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Deprecated |
| **Superseded by** | [`ocapn-tcp-syrup-framing.md`](./ocapn-tcp-syrup-framing.md) (PR 29) |

## Status

This design is consolidated with PR 29's `@endo/syrup-frame`
([`ocapn-tcp-syrup-framing.md`](./ocapn-tcp-syrup-framing.md)).
The two packages are the same in shape: each adapts a stream of
`Uint8Array` chunks into a stream of `Uint8Array`-delimited messages,
using length-prefixed Syrup byte-string framing on the wire
(`<digits>:<payload>`, no separator).

The earlier reading in this design (that `@endo/syrups` was a separate
"message-stream" layer carrying decoded structured Syrup values, one
rung above PR 29's byte-string framer) was wrong.
Both `@endo/cbors` (the sibling design in this PR) and
`@endo/syrup-frame` (PR 29) carry `Uint8Array` at their boundaries;
the value codec sits above either of them, not inside.
Under the corrected reading, `@endo/syrups` and `@endo/syrup-frame` are
the same package by different names, and only one need ship.

## Recommendation

Adopt PR 29's design and rename the package and design from
`@endo/syrup-frame` to `@endo/syrups`, so that the two streaming
message-framing packages in this PR pair (`@endo/cbors` and
`@endo/syrups`) share a naming convention.
The steward will dispatch a fixer against PR 29 to perform the rename
across the package directory, `package.json`, exported reader and
writer identifiers, design doc title, and PR title and body.

## Effect on the sibling `@endo/cbors` design

[`cbors.md`](./cbors.md) (the sibling design in this PR) is unaffected.
It already carries `Uint8Array` at its boundaries and is the precise
peer of `@endo/syrup-frame` / `@endo/syrups`.
Its cross-references to `@endo/syrup-frame` will become accurate once
PR 29's rename lands; in the meantime the cross-reference points at
the existing in-flight name (`@endo/syrup-frame`) with a note that
the rename is queued.

## Prompt

> Please dispatch a designer to propose two designs. I would like a
> design that creates a replica of the netstring proposal for sequential
> Syrup byte string messages (consider name: syrups) and a similar
> package that encodes and decodes sequential CBOR byte arrays.
