---
'@endo/ocapn': minor
---

- Add a WebSocket netlayer exported as `@endo/ocapn/netlayer/ws` (`makeWebSocketNetLayer`). Used for interop with Guile-Goblins peers and for any other transport that prefers a framed WebSocket over the raw TCP test netlayer.
- Add `@endo/ocapn/netlayer/tcp-testing` to the package's `exports` map so consumers can import the existing test netlayer without reaching into `src/`.
- The main entry (`@endo/ocapn`) now re-exports `makeClient` and the swissnum helpers `swissnumFromBytes` / `swissnumToBytes` so consumers don't need a deep `src/client/...` import for the common case.
- `makeClient` accepts a new `logger` option; when omitted the existing console-based logger is used, so this is backwards-compatible.
- The CapTP version-mismatch log on `start-session` now includes both the received and expected version strings.
