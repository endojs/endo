---
'@endo/exo-stream': minor
---

Add `@endo/exo-stream/buffered-channel.js`, exporting `makeBufferedReader`: a
push-fed Reader responder for producers that cannot be backpressured. Unlike
the pull-based `makeReaderPump`, it acknowledges eagerly (no synchronize
credit), delivers terminal events in band, and runs a live close watcher on the
synchronize chain so an early consumer `return()`/`throw()` fires the producer's
`onClose` even while the producer is idle.

Consolidates the twin buffered reply channels formerly carried by
`@endo/floot` and `@endo/claude-sandbox`. The reader carries a dual surface
under the new `BufferedReaderInterface`: the responder protocol for
`iterateReader` consumers, plus deprecated legacy `next`/`return`/`throw`
methods that existing remote-iterator consumers keep using until they migrate.
