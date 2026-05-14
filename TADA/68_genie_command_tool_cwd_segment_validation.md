# Genie `command` tool: switch `cwd` traversal check to segment-level

Follow-up from
[`60_genie_sandbox_review.md`](./60_genie_sandbox_review.md)
juror finding on `command.js:455`.

`packages/genie/src/tools/command.js:455` currently does:

```js
if (allowPath) {
  if (cwd.includes('..') || cwd.startsWith('/')) {
    throw new Error('Invalid path: directory traversal not allowed');
  }
}
```

The textual `includes('..')` rejects legitimate relative paths like
`foo/..bar` because the substring matches the filename `..bar`.
The bug is preexisting (not introduced by PR #148) but the
sandbox-spawner integration makes the check more visible: with the
slice in front of `bash` / `exec`, the only role of this check is to
veto attempts to escape `/workspace` from inside the slice.

## Status

Completed.  `assertCwdHasNoParentRefs` lives in
`packages/genie/src/tools/command.js` and is exported alongside
`makeCommandTool` for re-use by future tools growing a `cwd` knob.
The 15-case test surface in
`packages/genie/test/tools/command.test.js` passes across all three
ses-ava configurations (`lockdown`, `unsafe`, `endo`).

## Plan

- [x] **Split on the separator and check per segment.**  Replace the
  body of the guard with:

  ```js
  const segments = cwd.split('/').filter(s => s.length > 0);
  for (const segment of segments) {
    if (segment === '..') {
      throw new Error('Invalid path: directory traversal not allowed');
    }
  }
  if (cwd.startsWith('/')) {
    throw new Error('Invalid path: absolute paths not allowed');
  }
  ```

  Notes:
  - The slice mounts the workspace at `/workspace`, so absolute paths
    are still wrong from the agent's view (their root is the slice
    root, not the daemon's).  Keep the `startsWith('/')` veto.
  - Empty segments (`foo//bar`) are harmless and surviving the filter
    is fine.
  - `..` as a *suffix or prefix* of a filename (`..bar`, `foo..`,
    `..bar.baz`) is allowed.  Only the bare `..` segment is rejected.

- [x] **Pull the check into a small named helper.**
  `assertCwdHasNoParentRefs(cwd)` in `command.js` (or a sibling file
  if it grows).  Hoisting makes the rule re-usable when other tools
  grow a `cwd` knob and decouples the guard from the inline tool body.

- [x] **Tests.**  Extend
  `packages/genie/test/command.test.js` (or its sibling) with:
  - accepts `foo/..bar` and `..baz/qux` and `path..to/file`;
  - rejects `..`, `foo/..`, `foo/../bar`, `/etc`, and the empty string;
  - the rejection message is unchanged for the literal `..` segment
    so any pre-existing operator-facing diagnostic stays the same.

  Note: the empty string case settled as `t.notThrows` rather than
  the original "rejects" entry above — the helper's job is to veto
  *escapes*, and an empty `cwd` has no segments and no leading `/`,
  so there is nothing to escape from.  The check in `execute` still
  defaults `cwd` to `'.'`, so the empty-string path does not arise
  via the public surface in practice.

- [x] **Cross-check the sandbox case.**  When `allowPath` is set and
  the slice is bound, the slice's `cwd` becomes the relative path
  resolved against `/workspace` (`packages/sandbox`'s spawner builds
  `[/workspace, cwd].join`).  The unit-level
  `makeCommandTool with allowPath accepts a substring-`..` cwd via
  execute` test exercises the public surface end-to-end and pins that
  the guard does not fire on `foo/..bar`.  Re-running
  `yarn test:integration:sandbox-slice` is gated on a working
  bubblewrap; the `dev-repl-sandbox` AVA suite currently fails on
  this host on an unrelated `Remotables must be explicitly declared`
  error during slice mint, so the integration check is left for an
  environment where bwrap is available.

## Out of scope

- Removing the `cwd` validation entirely under the rationale "the slice
  confines it anyway".  The dev-repl path and the host-spawn fall-
  through still rely on textual validation; defense in depth.
- Promoting `cwd` to a Mount cap (the PR's "tools that need fs access
  consume a Mount cap" rule).  The `command` tool's `cwd` is a
  positional hint to the spawner, not a fs handle; keep it a string.
