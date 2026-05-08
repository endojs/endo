---
'@endo/ocapn': minor
---

Implement the `op:flush` operation. `op:flush` carries a promise reference and a "shortener" object; the receiver, after processing all prior messages on the same reference in receive order, invokes `run(target)` on the shortener so the sender can confirm the flush has reached the current end of the chain. This is the per-reference FIFO marker needed to preserve point-to-point FIFO ordering when promise shortening is in play.
