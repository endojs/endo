# `@endo/git`

Node-side `NativeGitBackend` for the Endo `Git` capability.
A subprocess wrapper over the installed `git` binary.

- `makeNativeGitBackend({ repoRoot, identity })` — implements the `GitBackend` protocol declared by `@endo/exo-git`.  Uses `node:child_process`, `node:fs`, `node:path`, etc.; not portable to SES realms without these built-ins.  The optional `identity` (`{ authorName, authorEmail, committerName?, committerEmail? }`) is a formula-owned commit-identity policy captured at construction and threaded into the author/committer environment of every mutating invocation; the optional committer fields default to the author fields when unset, each supplied field must be a non-blank string free of control characters, and omitting the option retains the default `Endo <endo@invalid.local>`.
- `internalHelpers` — test-only constants and helpers exported for assertion against `@endo/exo-git/src/git.js`.

Pair with `@endo/exo-git` for the remotable exo glue (`makeGit`, `makeGitRemote`, the credential capabilities, the `FsBackend` adapter, and the interface guards).
