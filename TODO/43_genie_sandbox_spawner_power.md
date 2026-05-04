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

- [ ] **Define a `Spawner` abstraction.**
  A small JSDoc interface that captures what the tool's
  process-execution path actually needs from its underlying engine:
  - launch a process given `argv`, `cwd`, `env`, optional stdin source,
  - expose stdout / stderr as async-iterable byte streams,
  - signal completion with `{ code, signal }`,
  - support a soft-kill timeout.

  Implementation suggestion: a single function
  `spawn(argv, opts) -> ProcessLike` returning the same shape as
  `DriverProcess` from
  [`packages/sandbox/src/types.d.ts`](../packages/sandbox/src/types.d.ts)
  so the slice's `ProcessHandle` is a drop-in.

- [ ] **Provide a default host-side `Spawner`.**
  Wraps `child_process.spawn` with the same timeout / SIGTERM behaviour
  the current `makeCommandTool` body has.
  Lives next to `makeCommandTool` in `tools/command.js` (or in a new
  `tools/spawner.js` if the file gets too large).

- [ ] **Refactor `makeCommandTool` to accept an injected spawner.**
  - Add `spawner` to `CommandToolOptions`; default to the host spawner
    so existing `bash` / `exec` / `git` exports stay drop-in for
    `dev-repl.js`.
  - Move the timeout / kill / accumulation loop out of the spawner so
    it stays uniform across host and slice spawners.

- [ ] **Thread the spawner through `buildGenieTools`.**
  Add an optional `spawner` field to the `buildGenieTools` options;
  when present, override the default for `bash` / `exec` / `git` only
  (file / memory / web tools continue running on the daemon side, see
  Status notes).

- [ ] **Adapt the slice-backed spawner.**
  When called with a `SandboxHandle`, build a small adapter that
  forwards `spawn(argv, opts)` to `E(handle).spawn(argv, opts)` and
  bridges the returned `ProcessHandle`'s `ReaderRef` / `WriterRef` into
  the timeout-kill loop.
  Lives in `packages/genie/src/tools/sandbox-spawner.js` (or similar);
  importing `@endo/sandbox/factory.js` is allowed so we get the
  `ProcessHandle` shape.

- [ ] **Tests.**
  - Unit test for the host spawner (existing behaviour, no regression).
  - Unit test for the sandbox spawner against a stub `SandboxHandle`
    that records the `argv` / `opts` and emits a canned process,
    verifying the timeout / kill plumbing fires correctly.
  - Optional integration test (skipped when bwrap is absent) that
    spawns `/bin/echo` through a real bwrap-backed slice and reads
    stdout.

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
