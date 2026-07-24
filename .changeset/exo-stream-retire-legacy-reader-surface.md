---
'@endo/exo-stream': minor
'@endo/floot': patch
'@endo/chat': patch
'@endo/claude-sandbox': patch
---

Retire the buffered channel's transitional remote-iterator surface. Every
consumer now streams over the exo-stream protocol with `iterateReader`, so
`makeBufferedReader`'s readers no longer carry `next`/`return`/`throw`, and
`BufferedReaderInterface` is the plain responder surface.

A producer that must abort its own stream calls the kit's new `close()`, which
discards undelivered events and fires `onClose` exactly as a consumer close
would. Chat's `makeTextFeed` — the third informal copy of the pattern — is now
built on `makeBufferedReader`.
