# `@endo/endo-git`

Endo's git capability layer.
The package extracts the git-specific surface that was previously embedded in `@endo/daemon/src/`:

- `makeGit` — the `EndoGit` exo factory built over a `Mount` and a `GitBackend`.
- `makeNativeGitBackend` — a subprocess wrapper over the installed `git` binary.
- `makeGitFsBackend` — an `FsBackend` adapter for an immutable git tree (composes with `@endo/endo-fs` `wrapBackend(...)`).
- `makeGitRemote`, `makeGitCredentialController` — remote-git companion and credential lifecycle.

See [`designs/extract-endo-git-package.md`](../../designs/extract-endo-git-package.md) in the repository root for the design.

This package is workspace-internal today (`"private": true`).
The intent is to publish once the surface stabilises.
