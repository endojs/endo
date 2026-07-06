---
'@endo/host-spawner': minor
---

Add `@endo/host-spawner`, the default host-side `Spawner` engine for the Shell capability. Wraps `child_process.spawn` behind an async-iterable stdout/stderr surface that mirrors the sandbox `DriverProcess` shape, so the same command tools run over either engine. Extracted verbatim from `@endo/genie`, which now re-exports it.
