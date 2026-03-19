# Genie sandbox — re-route tool spawn through the slice

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Tool spawn channel_.

The single host `child_process.spawn` chokepoint at
`packages/genie/src/tools/command.js:346` (used by `bash` / `exec` /
`git`) becomes `E(slice).spawn([exe, ...spawnArgs], { cwd, env })`.
The agent-visible result-shape contract
(`{ success, command, stdout, stderr, exitCode, path? }`) is preserved.

- [x] `makeCommandTool`'s factory grows a `slice` parameter; tool-
  registry construction in `main.js` passes the freshly-minted handle
  through (depends on
  [`34_endo_genie_sandbox_main_wiring.md`](./34_endo_genie_sandbox_main_wiring.md)).
  Implemented in `packages/genie/src/tools/command.js` (the
  `CommandToolOptions` typedef and `makeCommandTool` factory both grow
  a `slice` field, typed against the `SandboxSlice` typedef the
  registry already exports).  The slice cap reaches the tool layer
  via the registry: `buildGenieTools({ workspaceDir, slice, ... })`
  forwards `slice` into the `bash` / `exec` / `git` calls to
  `makeCommandTool` (see `packages/genie/src/tools/registry.js`
  § "bash/exec/git construction").  `main.js`'s `buildTools` already
  threads `workspaceSlice` (minted by `runRootAgent` per sub-task 34)
  into `buildGenieTools`, so the cold-boot piAgent path and the
  primordial → piAgent hand-off both pick up the cap without further
  wiring.  Pre-built `bash` / `exec` exports in `command.js` survive
  as slice-less host-spawn shorthand for back-compat (no current
  consumer outside `tools/index.js`'s re-export, but kept to avoid
  breaking external callers).
- [x] Replace the `spawn(exe, spawnArgs, …)` call at line 346 with
  `E(slice).spawn([exe, ...spawnArgs], { cwd, env })`.
  Implemented as the new `slice !== undefined` branch in
  `makeCommandTool#execute` (`command.js` ≈ line 425): when a slice
  is supplied, the executable resolution (`whichProgram`) and policy
  enforcement run unchanged, then the spawn routes through
  `E(slice).spawn(harden(argv), { cwd?, env })`.  `argv` is
  `[exe, ...spawnArgs]` for the no-shell case and
  `['/bin/sh', '-c', [exe, ...spawnArgs].join(' ')]` for the shell
  case (the slice surface has no `child_process`-style `shell: true`
  flag, so we explicitly wrap to mirror Node's own `shell: true`
  semantics — `/bin/sh -c` over the resolved exe + spaced args).
  The host-spawn path (line 534) is preserved verbatim as the
  fallback for `slice === undefined`.  Per-spawn `env` is restricted
  to `{ PATH }` so the slice's construction-time env stays the
  source of truth and host env vars are not leaked across the
  boundary; `cwd` is passed only when `allowPath` is true (matching
  the host-spawn path's `...(allowPath ? { cwd } : {})` shape).
- [x] Adapt the existing tool stdio plumbing onto the slice's
  `ProcessHandle.stdin / stdout / stderr` `reader-ref` /
  `writer-ref` adapters.
  - Collect streams into the same buffers the current code uses.
    Implemented via the new `drainReaderRef(reader, chunks)` helper
    in `command.js`: it drives the remote
    `AsyncIterator<Uint8Array>` (the shape
    `packages/sandbox/src/factory.js#makeReaderExoFromAsyncIterable`
    returns from `ProcessHandle.stdout()` / `.stderr()`) by direct
    `E(reader).next()` calls — remote refs do not expose
    `Symbol.asyncIterator`.  Stdout and stderr are drained in
    parallel (`stdoutP` / `stderrP`) so an interleaved process
    cannot deadlock on a full pipe; teardown awaits both with
    `.catch(() => {})` because trailing-byte errors after `wait()`
    resolves are non-fatal.  Stdin is left unattached for now —
    today's `bash` / `exec` / `git` tools do not write to stdin, and
    the slice's writer-ref adapter needs a real consumer before the
    plumbing is exercised in earnest (sub-task 40 will add the
    integration test if a stdin-using tool lands).
  - Verify byte-stream fidelity (no UTF-8 / netstring corruption).
    Verified by construction: chunks are accumulated as `Uint8Array`
    (no per-chunk `toString` round-trip), concatenated into a single
    backing `Uint8Array`, then decoded via
    `new TextDecoder('utf-8').decode(merged)` (`decodeUtf8` helper).
    A multi-byte UTF-8 codepoint split across two `next()` chunks
    decodes correctly because the decoder sees the merged buffer in
    one pass.  This matches the host-spawn path's effective behaviour
    (`stdout += chunk` over Node `Buffer`s, which `toString`'s as
    UTF-8) without the streaming-decoder pitfall the `+=` pattern
    has when a chunk boundary falls inside a codepoint.  An end-to-
    end byte-stream regression test against a live slice is filed
    under sub-task 40 (`bash -lc 'echo hi'` → `hi\n` on stdout).
- [x] Confirm no other `child_process.spawn` call site exists in the
  genie source tree (re-check on implementation; today the chokepoint
  is the only one).
  Re-confirmed.  `Grep` for `child_process` / `\.spawn\(` /
  `from 'child_process'` across `packages/genie/src/` returns only
  the `command.js` chokepoint (the `import { spawn } from
  'child_process'` and the host-spawn fallback at line 534).  The
  slice-aware branch at line 460 calls `E(slice).spawn(...)` and
  carries no `child_process` reference.  Documentation comments in
  `registry.js` mention `child_process.spawn` only in prose.
- [x] Tool surface visible to the agent does not change.
  The `Tool` returned from `makeCommandTool` has the same
  `help` / `desc` / `schema` / `execute` shape as before; only the
  internal spawn channel swaps under the `slice !== undefined`
  branch.  The `execute` return shape (`{ success, command, stdout,
  stderr, exitCode, path? }`) is asserted by the same `returnShape`
  guard the host-spawn path used (lines 365–375), so an agent
  observing the tool through the schema sees no diff.  The
  `listTools` / `execTool` registry API is untouched.  `genie`'s
  401-test suite passes unchanged (`yarn run test`).

Depends on:
[`34_endo_genie_sandbox_main_wiring.md`](./34_endo_genie_sandbox_main_wiring.md).

Blocks:
[`38_endo_genie_sandbox_heartbeat_continuity.md`](./38_endo_genie_sandbox_heartbeat_continuity.md),
[`40_endo_genie_sandbox_tests.md`](./40_endo_genie_sandbox_tests.md).

## Status

- 2026-04-30: All deliverables landed.  `makeCommandTool` grew a
  `slice` parameter (`packages/genie/src/tools/command.js`); the
  registry constructs `bash` / `exec` / `git` in-place inside
  `buildGenieTools` so each captures the optional slice
  (`packages/genie/src/tools/registry.js`).  When a slice is
  supplied, every spawn routes through `E(slice).spawn(...)` and
  consumes the `ProcessHandle.stdout()` / `.stderr()` reader-refs
  via a new `drainReaderRef` helper; UTF-8 decoding is centralised
  in `decodeUtf8` so a multi-byte codepoint split across `next()`
  chunks decodes correctly.  The host-spawn path is preserved as the
  fallback for `slice === undefined` (dev-repl, self-boot test,
  deployments without the sandbox plugin).  `child_process.spawn`
  remains the genie tree's only one chokepoint, now gated on the
  slice fallback branch.  The full 401-test suite passes; an end-to-
  end live-slice byte-fidelity test is deferred to sub-task 40.
