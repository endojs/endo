
# Sandbox bwrap driver: refine `$PATH` synthesis

Follow-up to `TODO/21_sandbox_path.md`.
The `bwrap` driver in `packages/sandbox/src/drivers/bwrap.js` now seeds a
default `$PATH` for `host-bind` rootfs slices via `HOST_BIND_DEFAULT_PATH`.
Three call-sites in `assembleSliceArgv` left explicit `// TODO` markers for
how to extend the synthesis to the other rootfs / mount shapes.
This task collects them.

**Status: landed.**
The synthesis logic moved into a shared
`packages/sandbox/src/drivers/path.js` module so the bwrap and
(future) podman drivers consume the same canonical default and the
same set of helpers.
The bwrap driver now mines the daemon's ambient `$PATH` for
host-bind slices, probes a `mount` rootfs for canonical bin dirs,
and promotes caller-granted bin-shaped mounts.
A unit-test block in `packages/sandbox/test/bwrap.test.js` exercises
each rootfs shape against `assembleSliceArgv` directly so the
synthesis is regression-tested without spawning a real bwrap.

## Background

`assembleSliceArgv` (lines ~191–305) accumulates a `defaultPath` string that
is used to inject `--setenv PATH …` only when the caller did not supply
their own `PATH` via `spec.env`.
Today only the `host-bind` branch sets `defaultPath`; the other branches
leave it empty, so a slice with `rootfs: { kind: 'mount' }` or
`rootfs: { kind: 'minimal' }` gets no `PATH` at all unless the caller sets
one.

The driver constructor accepts `env` (currently bound as `_env`, marked
unused).
That parameter is the daemon's environment, including the daemon's own
`$PATH` — useful for some of the synthesis ideas below.

## Tasks

- [x] **Inspect ambient `$PATH` for `host-bind` rootfs.**
  Implemented via `filterAmbientPathForHostBind` in
  `packages/sandbox/src/drivers/path.js`.
  The bwrap driver passes `env.PATH` through to `assembleSliceArgv`,
  which calls the filter and bind-mounts each survivor with
  `--ro-bind-try host host` before appending it to the synthesised
  `$PATH`.
  The rejection rules match the original spec: drop entries under
  `/home`, `/Users`, `/root`, `/tmp`, `/var/tmp`, `/run/user`, anything
  containing `..`, anything not absolute, anything not present on
  disk (best-effort `fs.existsSync`).
  Canonical bin dirs already covered by the default are also
  de-duplicated.

- [x] **Inspect `mount` rootfs for `defaultPath` components.**
  Implemented via `probeMountRootfsBinPaths` in
  `packages/sandbox/src/drivers/path.js`.
  When `rootfs.kind === 'mount'`, the driver probes for
  `<hostPath>/usr/bin`, `<hostPath>/bin`, etc., and feeds the
  matching slice-internal paths into the synthesised `$PATH`.
  When the probe finds nothing, the assembly falls back to the
  shared `DEFAULT_PATH`.

- [x] **Detect likely bin-dirs among caller-granted mounts.**
  Implemented via `detectMountBinPaths` in
  `packages/sandbox/src/drivers/path.js`.
  A mount whose `innerPath` ends in `/bin` or `/sbin` is promoted
  directly; mounts with a `bin/` (or `sbin/`) subdirectory under
  `hostPath` get the corresponding `${innerPath}/bin` /
  `${innerPath}/sbin` entry.
  Caller-granted bin-dirs land **after** the rootfs-derived defaults
  so a hostile caller cannot shadow `/usr/bin`.

- [x] **Review `HOST_BIND_DEFAULT_PATH` ordering.**
  Flipped to the Debian / Ubuntu default
  (`/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin`)
  and renamed `DEFAULT_PATH` because it is now the canonical
  fall-back across rootfs shapes (and across drivers — the podman
  driver follow-up consumes the same constant).
  The choice is documented in a comment block at the top of
  `packages/sandbox/src/drivers/path.js`.

- [x] **Wire the constructor's `env` parameter through.**
  `makeBwrapDriver({ env })` now binds `env` (no longer `_env`) and
  threads `env.PATH` into `assembleSliceArgv` via the new
  `extras.ambientPath` field.
  Tests can pass a deterministic `env` to suppress the
  `process.env.PATH` inheritance; the JSDoc on the constructor
  documents the new contract.

- [x] **Tests.**
  `packages/sandbox/test/bwrap.test.js` grew a `PATH synthesis` test
  block (nine cases) that calls `assembleSliceArgv` directly, with
  injected `exists` probes, and asserts the `--setenv PATH …` argv
  slot for each rootfs shape and each precedence rule (caller env
  wins, rootfs defaults precede caller-mount bin dirs, ambient
  survivors are filtered, missing host paths are dropped).

- [x] **Docs.**
  `packages/sandbox/README.md` now has a top-level `## $PATH
  semantics` section that lays out the per-rootfs default, the
  `/home`-exclusion rule for ambient PATH mining, and the
  caller-mount bin-dir promotion rule, plus a cross-link to
  `TODO/23_sandbox_podman_path.md`.
  `PLAN/endo_posix_sandbox.md` § "Cross-cutting concerns" gained an
  "Environment defaults" subsection covering the same policy at the
  design level.
