---
'@endo/platform': minor
'@endo/exo-git': patch
'@endo/daemon': patch
'@endo/agent-tools': patch
'@endo/agentry': patch
'@endo/git': patch
---

Consolidate the exo-git / mount path and filesystem capabilities onto the
portable `@endo/platform/fs` vocabulary.

- `@endo/platform` gains the separately composable `PathEntryIssuer` contract
  and the portable `DirectoryWriteSource` payload type; daemon-owned
  `EndoMountStat` is removed from platform exports.
- `@endo/daemon` publishes `EndoMountStat` and `MountNameChange`, and composes
  `EndoMount` with `PathEntryIssuer` with its live name-change reader.
  Its public refinement is checked against the canonical runtime mount guard.
- `@endo/exo-git` splits `WritableEndoGit` from `ReadOnlyEndoGit` and
  `WritableGitWorktree` from `ReadOnlyGitWorktree`, preserving path-entry
  lineage and omitting mutators from the read-only type.
- `@endo/agent-tools`, `@endo/agentry`, and `@endo/git` consume the checked
  writable/read-only contracts, including structurally expanded code-mode
  filesystem declarations.

No runtime behavior change.
