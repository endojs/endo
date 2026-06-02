# `@endo/exo-git`

Remotable exo glue and interface guards for an `EndoGit` capability.
The package is intentionally Node-free and portable across SES realms — it knows nothing about subprocesses, the file system, or the host's `git` binary.

- `makeGit({ mount, backend, lineageOf, readOnly })` — the `EndoGit` exo factory.  `backend` is any object satisfying the `GitBackend` protocol (`@endo/git` provides the Node-side implementation).
- `makeGitRemote({ git, credential, name, policy })` — remote-git companion (fetch / pull / push) bound to a credential cap.
- `makeBasicCredential`, `makeBearerCredential`, `makeUnavailableGitCredential` — credential capabilities.  Each carries a host-private `GitCredentialController` accessible via `getGitCredentialController(cred)`.
- `makeGitFsBackend({ backend, treeOid })` — `FsBackend` adapter for an immutable git tree.  Composes with `@endo/endo-fs` `wrapBackend(...)`.
- Interface guards: `GitInterface`, `GitRemoteInterface`, `GitRemoteControllerInterface`, `GitCredentialControllerInterface`, `BasicCredentialInterface`, `BearerCredentialInterface`.

Sister packages:

- `@endo/git` — the Node-side `NativeGitBackend` (subprocess wrapper over the installed `git` binary).
- `@endo/endo-fs` — the `Filesystem` / `FsBackend` seam this package targets.

The split mirrors `@endo/exo-stream` / underlying stream sources: the exo layer is portable; the host-specific backing lives elsewhere.
