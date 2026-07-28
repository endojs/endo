---
'@endo/cbor': major
---

Add `@endo/cbor`, a hardened, single-item canonical CBOR codec (phase 1 of
`designs/cbor-codec.md`). It reads and writes one CBOR item at a time over the
shared subset (canonical minimal-length heads, definite-length byte strings and
arrays, unsigned integers, null and the sibling simple values, strict EOF
discipline) plus the grammar OCapN also needs (text strings, maps, tag-2/3
bignums, float64 with a canonical NaN). Writers are always canonical and readers
are strict: they reject non-minimal heads and non-minimal bignum payloads, and a
non-canonical NaN. There is no lenient mode — every implementation of this subset
is required to use the strict, canonical subset. Head arguments are `bigint`,
spanning the full unsigned 64-bit CBOR domain; lengths, element counts, and tag
numbers are `number`, which JavaScript already bounds to four bytes. OCapN
protocol policy stays in `@endo/ocapn`; framing stays in `@endo/cbor-frame`.
