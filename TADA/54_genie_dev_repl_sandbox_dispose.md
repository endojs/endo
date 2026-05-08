# Slice / tmpdir teardown on every dev-repl exit path

**Status: landed.**  `dev-repl.js` now drives slice + powers teardown
through a module-level `teardownThunks` registry drained by
`runTeardown`, with try/finally on `runGenieLoop`, try/finally on the
outer `main()` for-await (covering `-c` mode), `process.once('SIGINT'/
'SIGTERM')` handlers exiting with `130` / `143`, and a defensive drain
in `main(...).catch(...)`.

Make sure the dev-repl reclaims the bwrap subprocess, the slice's
scratch upper layer, and the local-powers tmpdirs whenever the REPL
exits — including the paths that bypass `runGenieLoop`'s normal
return (Ctrl-C, SIGTERM, uncaught error).

Depends on TODO/53 (which lands the slice handle in `runMain`).

## Scope

The dev-repl currently exits via three paths:

1. `.exit` / `.quit` dot-command → `exitRequested = true` →
   `runGenieLoop` returns → `runMain` returns → `process.exit(0)`.
2. EOF on stdin (Ctrl-D) → `readline` `'close'` event → the
   `readPrompts` generator returns → `runGenieLoop` returns.
3. Top-level error → `main(...).catch(...)` → `process.exit(1)`.

A fourth implicit path exists today: SIGINT / SIGTERM with no
custom handler delivers the default Node behaviour (immediate
exit), which leaves the bwrap subprocess and tmpdirs orphaned.

### Tasks

- [x] In `runMain`, after the slice and powers are constructed,
  collect a list of teardown thunks.  Implemented as a module-level
  `teardownThunks` array (so the SIGINT / SIGTERM handlers and
  `main().catch` can drain the same list) drained by `runTeardown`
  in LIFO order via `Array.prototype.pop`.  Powers' `dispose` is
  pushed unconditionally; the slice thunk is pushed inside the
  `if (proceed)` branch where the slice is minted.
- [x] Wrap the existing `runGenieLoop({...})` call in a
  `try/finally` that runs every teardown thunk in reverse order.
  Errors from teardown land on stderr via `console.error` but do
  not propagate, so the original error reaches `main().catch`
  intact (mirrors the daemon's `cancelledP` + `.catch` discipline
  in `mintGenieSlice`).
- [x] Install one-shot SIGINT / SIGTERM handlers (using
  `process.once('SIGINT', …)`) that:
  1. Call every teardown thunk via `runTeardown`.
  2. `process.exit(130)` for SIGINT, `143` for SIGTERM (standard
     128+signal exit codes).
  - `process.once` ensures a second signal during teardown
    reverts to Node's default handler and aborts hard rather
    than re-entering our handler.
- [x] Update the top-level `main(...).catch(...)` to also run
  teardown before exiting with code 1.  Also added a try/finally
  around the for-await in `main()` itself so `-c` one-shot mode
  (which bypasses `runGenieLoop`) still gets disposal on success.
- [ ] Verify with `lsof` / `ps aux | grep bwrap` that no slice
  subprocess survives any of the three exit paths during manual
  smoke-testing.  Capture the smoke-test recipe in the PR
  description.  *(Smoke-tested `-c .help --sandbox off` cleanly;
  `--sandbox bwrap` interactive smoke-test pending Linux box with
  bubblewrap.  Automated coverage is TODO/55.)*

### Edge cases

- The local-powers tmpdir cleanup runs `rm -rf` on every tmpdir
  the powers minted.  If a slice is still using one (theoretically
  impossible after `dispose`, but defensive), the rm should not
  fail loudly — wrap each rm in a `.catch(err => console.warn(...))`.
- `E(slice).dispose()` is idempotent in the sandbox plugin (re-calls
  resolve immediately).  No need to guard against double-dispose at
  the dev-repl layer.
- When `--sandbox off`, the only teardown is `powers.dispose()`, and
  even that is a no-op (no scratch tmpdirs minted because the
  factory was never minted).  Skipping the teardown registration
  entirely on this path is fine.

## Acceptance

- `^C` from interactive mode leaves no `bwrap` processes behind.
- `kill -TERM <pid>` leaves no `bwrap` processes behind.
- An uncaught error during a `-c "bash ..."` invocation still
  triggers slice disposal.
- A second `^C` during teardown still kills the REPL within ~1s.

## Out of scope

- Persisting any state across runs.  Already a separate TODO in
  `dev-repl.js`.
- Health-checking the slice handle between disposals.  The plugin
  does this internally.
