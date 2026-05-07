
# Sandbox podman driver: default `$PATH` synthesis

Follow-up to `TODO/21_sandbox_path.md`.
The bwrap driver now seeds a sensible default `$PATH` for `host-bind` slices
(`HOST_BIND_DEFAULT_PATH`).
The podman driver in `packages/sandbox/src/drivers/podman.js` has no
equivalent: the slice's `PATH` is whatever the OCI image's
`Config.Env` happens to set, which works for well-formed images but
silently drops `PATH` if the caller passes `env: { … }` that does not
include a `PATH` key (because the per-spawn `-e KEY=VALUE` flags layer
on top, while the image's `ENV` is consulted only when no override
clears it).

## Background

In `assembleCreateArgv` (`packages/sandbox/src/drivers/podman.js` ~331–397),
caller-supplied `spec.env` is passed through as `-e KEY=VALUE` per entry.
podman does not honour `--clearenv`-style semantics; the image's `ENV` is
preserved unless the caller's `-e PATH=…` overrides it.
The bwrap driver's invariant — "if the caller did not set `PATH`, fall back
to a sensible default" — is therefore not currently mirrored in the podman
driver.
For consistency the podman driver should:

1. Discover the OCI image's own `PATH` from `podman image inspect <ref>`.
2. Use that as the fallback when `spec.env.PATH` is unset.
3. Fall back to a canonical default (the same
   `/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin` shape
   the bwrap driver uses) when the image declares no `PATH` of its own.

## Tasks

- [x] **Probe the image's `PATH`.**
  Add a helper alongside `ensureImage` that runs
  `podman image inspect --format '{{json .Config.Env}}' <ref>` and parses
  the resulting JSON array of `KEY=VALUE` strings.
  Return the value of the `PATH` key (if any).
  Cache the result keyed by `ref` for the lifetime of the driver — image
  refs are immutable enough to make this safe within a daemon run; a
  retag of the same ref is rare and the worst case is a stale fallback.

- [x] **Apply the fallback in `prepareSlice`.**
  When `spec.env.PATH === undefined` and an image-derived `PATH` was
  found, append `-e PATH=<imagePath>` to `assembleCreateArgv`.
  Otherwise append `-e PATH=<DEFAULT_PATH>` using the same canonical
  string the bwrap driver uses for `host-bind` (factor it out into a
  shared constant — see the cross-cutting task below).

  Implemented via `resolveSlicePath(spec, imagePath)` which returns
  `{ value, source }` with `source ∈ { 'env', 'image', 'fallback' }`.
  When `source !== 'env'`, `prepareSlice` passes the chosen value as
  `extras.pathInjection` to `assembleCreateArgv`, which emits the
  `-e PATH=<value>` flag once the per-key loop confirms the caller's
  `spec.env` did not already include `PATH`.

- [x] **Spawn-time override.**
  `spawn` accepts per-call `opts.env`.
  If `opts.env.PATH` is unset, do **not** re-inject the fallback at exec
  time — the slice already has it from the create step.
  If the caller explicitly sets `opts.env.PATH = ''` they are opting out;
  honour that.

  The `spawn` implementation iterates `opts.env` and emits `-e KEY=VALUE`
  for each entry without any special-case fallback synthesis, so the
  semantics described above fall out for free.

- [x] **Surface the chosen `PATH` in `slice.help()`.**
  Extend `runtimeDetails` with a `path:` row (or fold into an existing
  `env:` row if one is added) so operators can confirm whether the
  slice picked up the image's PATH or the fallback.
  Useful for debugging "why can't my slice find `apk`" cases.

  `PodmanSliceContext.runtimeDetails.path = { value, source }` is
  populated by `prepareSlice` and rendered by `factory.js`'s
  `renderSliceRuntimeReport` as
  `path: <value> (source: env|image|fallback)`.

- [x] **Shared constant.**
  Move the canonical default
  `/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin` out of
  `bwrap.js` into a small shared module (e.g.
  `packages/sandbox/src/drivers/path.js`) and re-export from both
  drivers.
  This avoids the strings drifting out of sync.
  Coordinate the move with `TODO/22_sandbox_bwrap_path_refinements.md`
  if it lands first; otherwise the podman patch defines the constant
  and the bwrap follow-up consumes it.

  `packages/sandbox/src/drivers/path.js` now owns `DEFAULT_PATH` (and
  related host-bind PATH-mining helpers); both drivers import it.
  The order was deliberately flipped to user-bin-first to match the
  Debian / Ubuntu interactive-shell default — see the comment in
  `path.js`.

- [x] **Tests.**
  Extend `test/podman.test.js` with two cases:
  - Image with a known `PATH` in `Config.Env`: assert the slice spawn
    sees that `PATH` (run `printenv PATH` inside the slice).
  - Image with no `Config.Env` `PATH`: assert the slice spawn sees the
    canonical fallback.
  The existing image-availability skip pattern (`alpine:3.19` not
  pulled ⇒ `t.pass()`) applies here too.

  `test/podman.test.js` now exercises:
  - `parseImagePathFromConfigEnv` parser corner cases (extracts PATH,
    null when absent, null on malformed JSON, tolerates non-string
    entries, honours empty PATH);
  - alpine slice spawn sees the image-derived PATH (source: image);
  - caller `spec.env.PATH` overrides the image-derived PATH
    (source: env);
  - image with no `Config.Env` PATH falls back to `DEFAULT_PATH`
    (source: fallback) — built via a transient `podman commit` of an
    empty PATH so the parser surfaces `''` and `resolveSlicePath`
    routes onto the canonical default.
  Each integration test gracefully passes when the underlying alpine
  image is not pulled.

- [x] **Docs.**
  Update `packages/sandbox/README.md` `## $PATH semantics` (added by
  the bwrap follow-up; create the section here if this task lands
  first) with the podman behaviour:
  - default = image's `Config.Env` PATH;
  - fallback = canonical default (cross-link the bwrap driver);
  - `slice.help()` reports which was chosen.

  Also update `PLAN/endo_posix_sandbox.md` § "Cross-cutting concerns"
  to mention image-derived PATH discovery as the podman driver's
  contract, and the canonical default as the cross-driver fallback.
  If `TODO/22_sandbox_bwrap_path_refinements.md` already added the
  subsection, extend it instead of creating a parallel one.

  `packages/sandbox/README.md` § "$PATH semantics" now lists the
  `oci` row in the per-rootfs default table and carries a
  "Cross-driver consistency" subsection covering the precedence rule,
  the `-e PATH=…` injection at create time, and the
  `path: <value> (source: …)` line in `slice.help()`.
  `PLAN/endo_posix_sandbox.md` § "Environment defaults" gained an
  `oci (podman driver)` bullet describing the inspect-and-cache
  contract and the `slice.help()` surface.

## Status

All tasks complete.
Verified locally:

- `node --check` on `src/drivers/podman.js`, `src/drivers/path.js`,
  and `test/podman.test.js`.
- `npx ava test/podman.test.js -m '*PATH*'` — 8 / 8 tests pass.
- `yarn lint` shows no sandbox-package errors (unrelated TS noise
  in other packages predates this change).
