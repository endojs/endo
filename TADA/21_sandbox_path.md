
While reviewing @endo/genie's usage of @endo/sandbox, I refined
`packages/sandbox/src/drivers/bwrap.js` to manage default `$PATH` especially
for `host-bind` mode.

- [x] review all of the newly added code around `HOST_BIND_DEFAULT_PATH` and
  how it's used in `assembleSliceArgv` via `defaultPath`
  - collect and synthesise all relevant `// TODO` comments into follow-up `TODO/` task(s) for after this session
  - **Done:** `TODO/22_sandbox_bwrap_path_refinements.md` collects the three
    in-source `// TODO` markers (host-bind ambient `$PATH` injection,
    `mount` rootfs probing, caller-mount bin-dir detection) plus a
    review of `HOST_BIND_DEFAULT_PATH` ordering and the unused
    constructor `env` parameter.

- [x] analyze `packages/sandbox/src/drivers/podman.js` and plan a similar follow up `TODO/` task to add defautl `$PATH` logic to it
  - but here it'd be ideal to inspect whatever OCI image is being used to discover its bin paths
  - falling back to a canonical / classic default path
  - **Done:** `TODO/23_sandbox_podman_path.md` plans the
    `podman image inspect`-derived PATH discovery, the canonical
    fallback, factoring out a shared default into
    `packages/sandbox/src/drivers/path.js`, and surfacing the chosen
    PATH via `slice.help()`.

- [x] be sure these follow up tasks, or a final conclusion task, updates
  `packages/sandbox/README.md` and `PLAN/endo_posix_sandbox.md` to talk about
  `$PATH` semantics
  - **Done:** Both follow-up tasks include explicit "Docs" checklist
    items that add a `## $PATH semantics` section to
    `packages/sandbox/README.md` and a corresponding subsection under
    `PLAN/endo_posix_sandbox.md` § "Cross-cutting concerns".
    Whichever follow-up lands first creates the section; the second
    extends it.

## Review notes captured (for posterity)

- `assembleSliceArgv` only sets `defaultPath` for `rootfs.kind === 'host-bind'`.
  `'mount'` and `'minimal'` rootfs slices currently get no `PATH` injection
  at all unless the caller supplies one.
- `HOST_BIND_DEFAULT_PATH` ordering puts `sbin` before `bin`
  (`/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin`) which
  differs from the Debian / Ubuntu user-default order.
  Worth a comment + decision in the follow-up.
- The constructor's `env` parameter is bound as `_env` and discarded.
  Threading it through is a prerequisite for the ambient-`$PATH`
  synthesis idea in `TODO/22`.
- The host-side `cp.spawn` of `bwrap` itself (line 572 in `bwrap.js`)
  uses `process.env.PATH ?? '/usr/bin:/bin'` for the *bwrap process's*
  env, separate from what the slice sees.  This is unrelated to the
  in-slice `defaultPath` and was not flagged for change.
