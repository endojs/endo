---
'@endo/ocapn': minor
---

- Add the OCapN `op:flush` and `op:flush-done` operations and wire them into the message dispatcher.
- On receiving `op:flush` for an exported promise position, the receiver mints a fresh local promise, swaps it in at the same export position (preserving the slot's refcount) and replies with `op:flush-done`. Subsequent deliveries that target the position queue on the new promise so per-reference FIFO order is preserved during promise shortening.
- Expose `_debug.flushExport(remoteValue)` to send `op:flush` and obtain a promise that resolves when `op:flush-done` is received.
- Add `replaceExportValue` on the pairwise table to support in-place value replacement under flush.
