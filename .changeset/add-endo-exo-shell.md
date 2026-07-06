---
'@endo/exo-shell': minor
---

Add `@endo/exo-shell`, the portable remotable-exo half of the `EndoShell` capability: an allowlisted, argv-only, writable-mount-scoped command executor with a per-stream output cap and a narrow-only timeout that escalates from `SIGTERM` to `SIGKILL` so it is a real bound. Mirrors how `@endo/exo-git` is the portable half of the Git capability; pair it with `@endo/host-spawner` (or a sandbox spawner) for the process-execution engine.
