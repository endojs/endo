---
'@endo/cbor': minor
---

Add `@endo/cbor`, a hardened, single-item canonical CBOR codec (phase 1 of
`designs/cbor-codec.md`). It reads and writes one CBOR item at a time over the
shared subset (canonical minimal-length heads, definite-length byte strings and
arrays, unsigned integers, null and the sibling simple values, strict EOF
discipline) plus the grammar OCapN also needs (text strings, maps, tag-2/3
bignums, float64 with a canonical NaN). Writers are always canonical; readers are
**strict by default** — they reject non-minimal heads and non-minimal bignum
payloads — with a `{ lenient: true }` opt-out for interop with a peer that emits
non-canonical heads. A non-canonical NaN is rejected in every mode. OCapN protocol
policy stays in `@endo/ocapn`; framing stays in `@endo/cbor-frame`.
