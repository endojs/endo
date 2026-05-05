# Genie: pluggable spawner for `bash` / `exec` / `git` tools

Sub-task of [`40_genie_sandbox.md`](./40_genie_sandbox.md).

`packages/genie/src/tools/command.js` calls `child_process.spawn`
directly inside the `makeCommandTool` factory.
For the workspace-as-slice integration the daemon-hosted genie needs
those same tools to spawn through a `SandboxHandle.spawn(argv, opts)`
instead, while the dev-repl and any future host-only deployment keep
the direct-spawn behaviour.

The plan calls this out explicitly in
[`PLAN/endo_posix_sandbox.md`](../PLAN/endo_posix_sandbox.md)
§ "Genie integration shape":

> `main.js`'s tool registry constructs `bash`/`exec`/`git` such that
> they `spawn` through the handle instead of through
> `child_process.spawn` directly.

## Deliverables

- [x] **Define a `Spawner` abstraction.**
  A small JSDoc interface that captures what the tool's
  process-execution path actually needs from its underlying engine:
  - launch a process given `argv`, `cwd`, `env`, optional stdin source,
  - expose stdout / stderr as async-iterable byte streams,
  - signal completion with `{ code, signal }`,
  - support a soft-kill timeout.

  Implemented in
  [`packages/genie/src/tools/spawner.js`](../packages/genie/src/tools/spawner.js)
  as a single `spawn(argv, opts) -> ProcessLike` callback whose
  `ProcessLike` shape mirrors `DriverProcess` from
  [`packages/sandbox/src/types.d.ts`](../packages/sandbox/src/types.d.ts)
  so the slice's `ProcessHandle` drops in via a thin adapter.

- [x] **Provide a default host-side `Spawner`.**
  `makeHostSpawner` in
  [`packages/genie/src/tools/spawner.js`](../packages/genie/src/tools/spawner.js)
  wraps `child_process.spawn`, preserves the original `whichProgram`
  PATH-resolution behaviour, and exposes stdout / stderr as
  `AsyncIterable<Uint8Array>` for the shared supervision loop.  The
  timeout / SIGTERM behaviour now lives in `runProcess` inside
  `command.js` so it stays uniform across spawners.

- [x] **Refactor `makeCommandTool` to accept an injected spawner.**
  - `CommandToolOptions.spawner` defaults to a freshly-built host
    spawner; existing `bash` / `exec` / `git` exports stay drop-in for
    `dev-repl.js`.
  - The timeout / kill / accumulation loop (`runProcess`) lives in
    `command.js` and consumes any `ProcessLike`, so host and slice
    spawners share the supervision path.

- [x] **Thread the spawner through `buildGenieTools`.**
  [`registry.js`](../packages/genie/src/tools/registry.js) accepts an
  optional `spawner` and rebuilds `bash` / `exec` / `git` via
  `makeBashTool` / `makeExecTool` / `makeCommandTool` with the
  override.  File / memory / web tools continue to run daemon-side
  (see Status notes).

- [x] **Adapt the slice-backed spawner.**
  `makeSandboxSpawner` in
  [`packages/genie/src/tools/sandbox-spawner.js`](../packages/genie/src/tools/sandbox-spawner.js)
  forwards `spawn(argv, opts)` to `E(handle).spawn(argv, opts)`,
  bridges the slice's `ReaderRef`-shaped stdout / stderr into the
  shared `AsyncIterable<Uint8Array>` surface, eagerly resolves the
  slice pid, and translates `shell: true` into an explicit
  `['/bin/sh', '-c', joined]` invocation inside the slice.  The
  `SandboxHandleLike` typedef captures the `spawn` sub-shape
  structurally so this module avoids a runtime dep on `@endo/sandbox`.

- [x] **Tests.**
  - [`test/tools/spawner.test.js`](../packages/genie/test/tools/spawner.test.js)
    pins host spawner behaviour: argv resolution, async-iterable
    stdout / stderr surfaces, exit-status reporting, kill plumbing,
    and `shell: true` mode.
  - [`test/tools/sandbox-spawner.test.js`](../packages/genie/test/tools/sandbox-spawner.test.js)
    drives the sandbox spawner against a stub `SandboxHandle`,
    verifying argv / cwd / env / shell forwarding, pid resolution,
    stdio bridging, and end-to-end through `makeCommandTool` so the
    `runProcess` timeout / kill loop fires on a hung slice process.
  - Optional bwrap-backed integration test deferred — covered
    indirectly by `packages/sandbox`'s own driver tests; revisit when
    the daemon-hosted genie wiring lands so a real slice exists to
    exercise here.

## Status notes

- File / memory / web tools keep running daemon-side on the host fs.
  They read and write the workspace directly through Node `fs`
  because the daemon already has a `Mount` cap to that directory.
  Inside the slice, `bash`/`exec`/`git` see the same files via the
  bind-mount, so a tool that writes a file via `writeFile` is visible
  to a follow-up `bash cat`.
- The spawner contract intentionally mirrors `DriverProcess` so any
  future move of file/memory/web tools into the slice is a localized
  spawner swap rather than a re-architecture.
- `web-fetch` and `web-search` continue to run on the daemon side
  with their existing host network reach; the slice's `network:
  'private'` profile still applies to anything `bash` invokes
  (e.g. `curl`).

## Cross-references

- [`packages/genie/src/tools/command.js`](../packages/genie/src/tools/command.js).
- [`packages/genie/src/tools/registry.js`](../packages/genie/src/tools/registry.js).
- [`packages/sandbox/src/types.d.ts`](../packages/sandbox/src/types.d.ts)
  — `DriverProcess` / `ProcessHandle` shapes.
