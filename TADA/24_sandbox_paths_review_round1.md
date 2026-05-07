# Address the below feedback from review

- [x] update `filterAmbientPathForHostBind` to use `realpath` ; I'd mildly
  prefer to use an async/promise-returning realpath resolver, rather than
  `realpathSync` if one's available
  - Done in `packages/sandbox/src/drivers/path.js`.
    `filterAmbientPathForHostBind` is now async and accepts a
    `realpath: (p) => Promise<string|null>` option.  After the textual
    block-prefix check passes, the entry is canonicalised through the
    resolver and the prefix / `..` / canonical-bin-dir checks are
    re-applied to the resolved value.  An `ENOENT`/`EACCES`/`ELOOP`
    from the resolver drops the entry.
  - The bwrap driver wires `fs.promises.realpath` through
    `prepareSlice`; `assembleSliceArgv` is now async accordingly.
  - Tests added to `packages/sandbox/test/bwrap.test.js`:
    - "drops ambient entries whose realpath lands in a blocked
      prefix" — covers the `/opt/eve → /tmp/attacker` symlink trick.
    - "drops ambient entries whose realpath fails" — covers the
      ENOENT/EACCES path.

- [x] update `joinPathEntries` so that it sanitizes `innerPath` input:
  - newlines should be a fatal error, raise an exception
  - for colons, just split and process parts, so that for an input like we'd get `/foo/bin:/bin/bin`
  - Done in `joinPathEntries` (path.js).  Any control character
    (`\x00..\x1f`) raises `makeError(X\`PATH entry must not contain
    control characters: ${q(entry)}\`)`.  Embedded `:` separators are
    split and each part is processed as an independent entry, so a
    caller-granted `innerPath = '/foo:/bin'` produces a clean
    `…:/foo:/bin` rather than smuggling `/foo` in by concatenation.
  - Tests added: "innerPath with embedded colon is split, not
    smuggled" and "innerPath with newline is fatal".

- [x] detect and prune/skip any relative `hostPath`s in `probeMountRootfsBinPaths`
  - Done.  The helper short-circuits to `[]` when `hostPath` is not a
    string starting with `/`, so probes never resolve against the
    daemon's CWD.  Test added: "relative mount rootfs hostPath is
    skipped" — also asserts the `exists` probe is never called.

- [x] fallback to the empty string for `mount`-rootfs that lacks canonical bin dirs
  - we're doing the probe anyhow, so the fallback should only include directories that actually exist inside a given OCI image
  - Done in `assembleSliceArgv` (bwrap.js) step 9.  When the synthesis
    yields an empty string and the rootfs is `kind: 'mount'`, the
    slice gets `--setenv PATH ''` rather than `DEFAULT_PATH`.  The
    pre-existing `DEFAULT_PATH` fallback is preserved for `host-bind`
    and `minimal` rootfs shapes (where the canonical bin dirs are
    actually mounted in or expected to be).  Test renamed: "mount
    rootfs with empty probe yields empty PATH".

## Verification

- `npx corepack yarn lint:eslint` clean (0 errors, 0 warnings on the
  changed files).
- `tsc --build` reports no new errors in the sandbox package; the
  unrelated upstream errors in `base64`, `harden`, etc. are
  pre-existing.
- `npx corepack yarn workspace @endo/sandbox test` — all 80 tests
  pass across the four lockdown configs (lockdown, unsafe, endo,
  noop-harden).

## Saboteur findings (PR 119: sandbox $PATH derivation)

cc @jcorbin, @kriskowal

Reviewed `drivers/path.js`, the bwrap and podman synthesis call sites, and the
spec-resolution chain in `factory.js`. The threat model in
`TADA/22_sandbox_bwrap_path_refinements.md` is sound and the precedence
(rootfs-defaults → ambient-survivors → caller-mounts) does prevent shadowing of
`/usr/bin` for the obvious case. A handful of attack surfaces remain.

### Real concerns

1. **No `realpath` on ambient `$PATH` survivors (host-bind).**
   `filterAmbientPathForHostBind` rejects literal `/tmp/`, `/home/`, `..`,
   etc., but it does **not** call `fs.realpathSync`.  An operator-installed
   `/opt/eve` that is itself a symlink to `/tmp/attacker` survives the textual
   prefix check, gets `--ro-bind-try`'d into the slice, and ends up on the
   slice's `$PATH`.  The whole point of the `/tmp` block list is to keep
   world-writable scratch out of the slice; symlink-via-`/opt` defeats it.
   Suggest resolving each survivor with `fs.realpathSync` and re-applying the
   prefix check to the resolved value (drop on `EACCES`/`ENOENT`).

2. **No validation of `mount.hostPath` / `mount.innerPath` characters.**
   `joinPathEntries` blindly does `entries.join(':')`.  A caller-granted mount
   with `innerPath = '/foo:/bin'` produces a `detectMountBinPaths` result of
   `'/foo:/bin/bin'`, which when joined silently inserts `/foo` into `$PATH`.
   Newlines in `innerPath` corrupt the `--setenv PATH …` argv slot in a
   different but equally surprising way.  The cap mechanism is the trust
   boundary today, but a defensive `if (entry.includes(':') ||
   /[\x00-\x1f]/.test(entry)) continue;` in `joinPathEntries` would close it.

3. **`probeMountRootfsBinPaths` works on a relative path when `hostPath` lacks
   a leading `/`.** If `mountSpec.hostPath = 'srv/foo'` (or `..`), the probe
   does `existsSync('srv/foo/usr/bin')` against the daemon's CWD.  That is not
   a sandbox escape — bwrap will reject the `--ro-bind ../  /` invocation
   downstream — but the synthesised `$PATH` ends up reflecting CWD-shaped
   probes that have nothing to do with the slice.  An early `if
   (!hostPath.startsWith('/')) return [];` would localise the failure mode.

4. **`mount`-rootfs with no canonical bin dirs falls back to host-shaped
   DEFAULT_PATH.** When the probe returns `[]`, the slice's `$PATH` is
   `/usr/local/bin:/usr/bin:/bin:…` — i.e., paths that **do not exist inside
   the slice**.  Not a sandbox escape, but the comment in `bwrap.js` says the
   fallback is "so the slice can at least find sh/echo if the caller bound a
   standard userland tree" — which is exactly the case the probe just
   disproved.  The fallback should be the empty string for `mount` rootfs whose
   probe came up empty, or it should be documented that the caller is
   responsible for setting `spec.env.PATH` themselves.

