---
'@endo/bytes': major
---

Add `@endo/bytes` package providing `concatBytes`, `bytesEqual`, `bytesFromText`, `bytesToText`, `bytesToImmutable`, and `bytesFromImmutable` for platform-neutral byte handling.
Built on `Uint8Array` with `TextEncoder`/`TextDecoder` captured once at module load.
`bytesToImmutable` and `bytesFromImmutable` cross between mutable views and the immutable `ArrayBuffer` shape produced by the proposal-immutable-arraybuffer shim, so passable bytes can be carried across vat boundaries.
Hardened, SES-safe; usable across Node, XS, and browser realms.

The release is the first publish, going out as `1.0.0` from the `0.1.0` workspace floor (major bump from a `0.x.y` baseline lands at `1.0.0`).
