# Genie sandbox — acceptance tests

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Tests_.

Test home: **`packages/genie/test/sandbox/sandbox-boot.test.js`** —
chosen for parity with `packages/genie/test/boot/self-boot.test.js`.
The four cases each fork a real daemon, run the genie launcher's
own workspace-mount + sandbox-factory + main-genie shape, then
exercise the live slice via the host pet-store-pinned
`sandbox-factory` (idempotent `makePersistent` returns the same
in-memory handle `main.js` minted —
`packages/sandbox/src/factory.js:1271`).
Driving slice spawns directly (rather than the LLM) keeps the
test deterministic without a stub model; the slice plumbing is
what TODO/40 wants to verify, and a tool-call round-trip would
add a model dependency.

Skip policy: every case probes for `bwrap` once via a
`test.serial.before` hook and degrades to `t.pass()` when bwrap
is unavailable on the CI host (mirrors the pattern used across
`packages/sandbox/test/`).
The `network: 'private'` case additionally probes for `pasta`.

- [x] **Smoke test**: `bottle.sh invoke` against a host with bwrap +
  pasta installed boots a genie whose `bash` tool can `cat
  HEARTBEAT.md` from the workspace and **cannot** `cat /etc/hosts`
  on the host.
  - host-bind rootfs allows `/etc/hosts` reading by default; the
    test should pick a sentinel host file deliberately omitted from
    the slice's view (e.g. `~/.aws/credentials`) and assert it is
    not present.

  Filed as `workspace slice can read /workspace files but not host
  home paths` (`test/sandbox/sandbox-boot.test.js`).
  Plants a sentinel under `<state>/host-only/sentinel.txt` (a path
  under `/home/<user>` — outside the bwrap host-bind allow-list at
  `packages/sandbox/src/drivers/bwrap.js:53`) and asserts the slice
  reads `/workspace/HEARTBEAT.md` (workspace template fixture)
  while `/bin/cat <sentinel>` exits non-zero with a `No such file`
  stderr.  Currently **blocked by upstream** — see § Blockers.

- [x] **`network: 'private'` smoke**: `bash -lc 'curl -s
  http://127.0.0.1:<host-daemon-port>/'` fails (loopback blocked);
  a public `curl` succeeds when the CI host has internet.

  Filed as `network: 'private' blocks loopback to the host daemon
  port`.
  Skipped when `pasta` is missing because the bwrap driver flags
  pasta wiring as best-effort
  (`packages/sandbox/src/drivers/bwrap.js:495–500`); tighten to a
  hard assert once pasta wiring lands end-to-end.
  Asserts a `/dev/tcp/127.0.0.1/22` connect from inside the slice
  reports `blocked` rather than `connected` — the daemon's
  `127.0.0.1:0` ephemeral port is unknown at test time, so the
  broader "any loopback" invariant is what we check.
  Currently **blocked by upstream** — see § Blockers.

- [x] **Daemon restart**: kill the daemon, restart it, assert the
  `main-genie` worker comes back and `bash` still spawns through the
  slice (no orphaned scratch / mount).
  - exercises
    [`39_endo_genie_sandbox_gc_order.md`](./39_endo_genie_sandbox_gc_order.md).

  Filed as `daemon restart reincarnates main-genie and its slice`.
  Asserts `workspace-mount` / `sandbox-factory` / `main-genie` pet
  names all survive the bounce, forces the worker to reincarnate via
  `lookup('main-genie')`, waits for a second `Workspace sandbox
  minted` log line, then drives a `/workspace/HEARTBEAT.md` read
  through the post-restart slice as proof that the cap chain came
  back wired.  Currently **blocked by upstream** — see § Blockers.

- [x] **Tool stdio**: `bash -lc 'echo hi'` returns `hi\n` on stdout
  via the existing tool plumbing — the slice's `reader-ref` /
  `writer-ref` adapters do not corrupt the byte stream.

  Filed as `tool stdio plumbing round-trips bytes without
  corruption`.
  Three cases:
    1. The headline `echo hi` → `hi\n` round-trip;
    2. UTF-8 across a chunk boundary — emits a `cafe-✓-héllo-` +
       64 KiB filler payload, asserts identity through the same
       `drainReaderRef` accumulate-then-decode pattern the
       `command.js` tool layer uses
       (per `TADA/35_endo_genie_sandbox_tool_spawn.md`);
    3. Stdout / stderr separation — asserts the two reader-refs
       isolate `to-stdout\n` and `to-stderr\n` writes.
  Currently **blocked by upstream** — see § Blockers.

## Blockers

The test scaffolding is in place but every case reaches the
`Workspace sandbox minted` log line is currently **blocked by two
upstream gaps** discovered while running the suite.

1. **`setup.js` worker pet name for `sandbox-factory`** —
   `packages/genie/setup.js:96` calls
   `E(hostAgent).makeUnconfined('@agent', sandboxAgentSpecifier,
   { resultName: 'sandbox-factory', ... })`.
   The host pet store maps `'@agent'` to the host *agent* itself
   (`packages/daemon/src/host.js:176`), not a worker; the daemon
   rejects the call with `Cannot make unconfined plugin with
   non-worker` (`packages/daemon/src/daemon.js:1298`).
   Fix: pass a fresh worker pet name (e.g. `'sandbox-worker'`) so
   `prepareWorkerFormulation` defers a new worker formula.
   The test scaffolding already mirrors the launcher's intent
   inline using `'sandbox-worker'`; landing the same change in
   `setup.js` lets the test call `setup.main(host)` directly.

2. **Sandbox factory's `powers` shape vs. host agent** —
   `@endo/sandbox`'s factory expects `powers.provideScratchMount`
   AND `powers.provideHostPath` (see `packages/sandbox/src/factory.js`
   `resolveHostPath` at `:330`).
   The daemon's host agent surfaces `provideMount` /
   `provideScratchMount` but **not** `provideHostPath`, so
   `makePersistent` fails resolving the workspace mount cap with
   `target has no method "provideHostPath"`.  The bwrap test
   fixture stubs the method (`packages/sandbox/test/bwrap.test.js`
   makeStubScratchProvider); the host agent needs the same
   surface — either by extending host with `provideHostPath`, or
   by teaching the factory to derive the host path through `Mount`
   directly.

Until both gaps close, every case logs `Failed to mint workspace
sandbox slice` in the worker (`packages/genie/main.js:1458`) and
proceeds without a slice — `lookupLiveSlice` then times out
waiting for the `Workspace sandbox minted` banner.
The test file fails the four cases hard rather than silently
passing, so the regression surface stays honest until the gaps
close.

Depends on:
[`35_endo_genie_sandbox_tool_spawn.md`](./35_endo_genie_sandbox_tool_spawn.md),
[`36_endo_genie_sandbox_workspace_path.md`](./36_endo_genie_sandbox_workspace_path.md),
[`39_endo_genie_sandbox_gc_order.md`](./39_endo_genie_sandbox_gc_order.md).

Discovered blockers (file as separate TODOs once triaged):
- `setup.js` `'@agent'` workerName regression — `Cannot make
  unconfined plugin with non-worker` on every `bottle.sh invoke`
  with the sandbox-factory step.
- Sandbox factory `provideHostPath` requirement vs. host agent
  surface — `target has no method "provideHostPath"` on every
  `makePersistent` that resolves a `Mount` cap.

## Status

- 2026-05-01: Test scaffolding landed at
  `packages/genie/test/sandbox/sandbox-boot.test.js`.
  Four cases (FS isolation, private network, daemon restart, stdio
  fidelity) wire up against a real daemon and skip cleanly when
  bwrap / pasta are missing.
  Every case currently fails on hosts where bwrap _is_ present
  because of the two upstream blockers documented above; the test
  file is intentionally written to expose those failures rather
  than mask them, so when the blockers close the suite passes
  without further edits.
