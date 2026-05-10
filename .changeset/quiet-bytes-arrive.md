---
'@endo/bytes': major
---

Add `@endo/bytes` package providing `concatBytes`, `bytesEqual`, `bytesFromText`, and `bytesToText` for platform-neutral byte handling.
Built on `Uint8Array` with `TextEncoder`/`TextDecoder` captured once at module load.
Hardened, SES-safe; usable across Node, XS, and browser realms.

The release is the first publish, going out as `1.0.0` from the `0.1.0` workspace floor (major bump from a `0.x.y` baseline lands at `1.0.0`).
