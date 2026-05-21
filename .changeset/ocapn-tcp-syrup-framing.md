---
'@endo/ocapn': minor
---

- Add a `framing` option to `makeTcpNetLayer` (`@endo/ocapn/netlayer/tcp-testing`). The default is `'syrup'`, which wraps each message in the `<length>:<payload>` framing implemented by `@endo/syrup-frame`. This is the framing the OCapN TCP-for-testing netlayer is moving toward (cf. the 2025-12-09 OCapN plenary, https://github.com/ocapn/ocapn/blob/main/meeting-minutes/2025-12-09.md), and is robust to TCP chunk boundaries that split a single OCapN message. Pass `framing: 'none'` to interoperate with the existing `ocapn/ocapn-test-suite` Python `testing_only_tcp` netlayer, which writes a syrup-encoded record with `sendall` and reads one back with `syrup.syrup_read` (no length prefix on the wire). The `'none'` option exists only for that suite's sake and goes away once the suite either adopts syrup framing or is retired.
