# Genie memory: FTS5 sync after observe/reflect cycles

- [x] Add `SearchBackend.sync()` call at end of each observe/reflect
  cycle as a safety net.

## Details

The `SearchBackend.index()` method already exists and `memorySet`
calls it on every write.
So if observer/reflector use `memorySet`, the index stays in sync
automatically.

However, a `SearchBackend.sync()` call should be added at the end
of each observer and reflector cycle as a safety net.
The FTS5 backend already implements `sync()` as a no-op, but a
future backend may need it for flush/commit semantics.

### Implementation

In both the observer and reflector modules, after all `memorySet`
calls are complete:

```js
await searchBackend.sync();
```

This is a one-liner in each module, but it establishes the
convention that cycles are explicit sync points.

## Dependencies

- `TODO/67_genie_observer_module.md` — observer must exist.
- `TODO/68_genie_reflector_module.md` — reflector must exist.

## References

- `PLAN/genie_memory_implementation.md` — Phase 1 tasks
- `src/tools/fts5-backend.js` — FTS5 backend with `sync()`
- `src/tools/memory.js` — `memorySet` calls `searchBackend.index()`
