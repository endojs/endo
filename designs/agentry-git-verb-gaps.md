# Agentry Git Verb Gaps

| | |
|---|---|
| **Created** | 2026-07-08 |
| **Author** | 0xpatrickdev (prompted) |
| **Status** | Proposed |

## What is the Problem Being Solved?

The git code-mode eval harness needs to exercise real stack-surgery flows:
cherry-picking existing commits, amending fixups, rewording a commit during a
history rewrite, running autosquash, and resolving conflicts by choosing a git
side. The reconciled [daemon-agent-tools](daemon-agent-tools.md) design already
settles the capability-to-tool map: a local `Git` capability derived from an
`EndoMount` is the authority for local repository mutation, code mode receives
the generated `git` global, and the JSON tool slice stays curated.

The gap is narrow. Add only the local history-editing verbs that
`designs/agentry-git-eval-scenarios.md` (draft PR #636, branch
`design/agentry-git-eval-scenarios`) names for its `stack-surgery` scenario
and cannot express through the existing `status`, `add`, `restore`, `commit`,
`merge`, `rebase`, `stash`, and historical-read methods. That scenario is the
acceptance contract for these verbs.

## In Scope

| Workflow need | EndoGit shape | Code-mode shape | JSON tool slice |
|---|---|---|---|
| Commit amend | extend `commit(message, options?)` with `{ amend?: true }` | generated from the `EndoGit` type | include as the existing `commit` tool's optional `options.amend` |
| Cherry-pick | `cherryPick(ref, options?)` | generated from the `EndoGit` type | include with string or structured ref plus JSON options |
| Reword commit | `reword(ref, message)` | generated from the `EndoGit` type | include with string or structured ref plus message |
| Rebase autosquash | extend `rebase(input)` with `{ autosquash?: boolean }` for `mode: 'start'` | generated from the `EndoGit` type | include the `mode: 'start'` autosquash case |
| Conflict-side selection | `checkoutConflict(entries, side)` with `side: 'ours' \| 'theirs'` | generated from the `EndoGit` type | include as `paths: string[]`, resolved to entries by the tool |

Out of scope: broad `reset`, interactive todo editing, path checkout from an
arbitrary commit, remote force-with-lease representation, and JSON exposure for
the non-start `rebase` control calls.

## EndoGit API

```ts
type GitCommitOptions = {
  amend?: boolean;
};

type GitCherryPickOptions = {
  noCommit?: boolean;
};

type GitConflictSide = 'ours' | 'theirs';

type GitRebaseInput = {
  mode?: 'start' | 'continue' | 'abort' | 'skip';
  upstream?: string;
  autosquash?: boolean;
};

type EndoGit = {
  commit(message: string, options?: GitCommitOptions): Promise<GitCommit>;
  cherryPick(ref: GitRef | string, options?: GitCherryPickOptions): Promise<string>;
  reword(ref: GitRef | string, message: string): Promise<GitCommit>;
  rebase(input: GitRebaseInput): Promise<string>;
  checkoutConflict(entries: EndoMountEntry[], side: GitConflictSide): Promise<void>;
};
```

`commit({ amend })` is deliberately not a separate `amend()` method. The
authority and backend operation are the same as `commit`: write the current
index as the new `HEAD`. The option keeps the model from learning two verbs for
one commit-writing operation, while the guard still distinguishes plain commit
from amend.

`reword(ref, message)` is deliberately not an interactive-todo API. It is the
one non-interactive history-editing primitive the eval needs: change exactly one
commit message and leave the patch untouched. A generic todo editor would grant
arbitrary instruction sequencing (`edit`, `drop`, `exec`, reorder) and recreate
the unsafe shell/editor surface that the capability layer is avoiding.

`rebase({ mode: 'start', upstream, autosquash: true })` maps to a
non-interactive autosquash start. `autosquash` is valid only for `mode:
'start'`; it is rejected for `continue`, `abort`, and `skip`.

`checkoutConflict(entries, side)` is explicit rather than relying on workspace
writes plus `add`. When the model says "take ours" or "take theirs", the
operation should mean the index stage selected by git for those conflicted
paths. Rewriting file content from a historical view can approximate the file
bytes, but it does not express the index-stage operation and is easy to get
wrong for deletions, renames, and mixed conflicts.

## Guard and Backend Sketch

`GitInterface` gains:

```js
commit: M.callWhen(M.string())
  .optional(M.recordOf(M.string(), M.any()))
  .returns(GitCommitShape),
cherryPick: M.callWhen(RefArgShape)
  .optional(M.recordOf(M.string(), M.any()))
  .returns(M.string()),
reword: M.callWhen(RefArgShape, M.string()).returns(GitCommitShape),
checkoutConflict: M.callWhen(
  M.arrayOf(M.remotable()),
  M.or(M.eq('ours'), M.eq('theirs')),
).returns(M.undefined()),
rebase: M.callWhen(M.recordOf(M.string(), M.any())).returns(M.string()),
```

`GitBackend` mirrors the exo-facing methods after the public exo collapses
`GitRef | string` to a ref string and resolves `EndoMountEntry[]` to
repo-relative paths:

```ts
commit(message: string, opts?: GitCommitOptions): Promise<GitCommit>;
cherryPick(ref: string, opts?: GitCherryPickOptions): Promise<string>;
reword(ref: string, message: string): Promise<GitCommit>;
rebase(input: GitRebaseInput): Promise<string>;
checkoutConflict(paths: string[], side: GitConflictSide): Promise<void>;
```

Every new mutator calls `assertWritable(methodName)` before reaching the
backend. Path-bearing conflict selection uses the existing
`entriesToRepoPaths` lineage check, so a caller cannot smuggle paths from
another mount into the repository. Native backend implementations also run the
same repository identity and executable-config guards that protect `add`,
`commit`, `merge`, and `rebase`.

The branch `docs/agentry-git-rebase-evals` added a type-level EndoGit contract
test (`test(exo-git): assert EndoGit contract`, commit `473b718b3`). The builder
for this design should extend that pattern so `makeGit`'s return type,
`GitInterface`, `packages/exo-git/src/types.js`, `packages/exo-git/types.d.ts`,
and the generated code-mode declarations cannot drift apart. Runtime tests
should cover read-only rejection for each mutator, autosquash flag validation,
conflict-side path lineage, and non-interactive editor behavior for reword and
autosquash.

## Code-Mode and JSON Surfaces

Code mode receives all five additions automatically by regenerating
`packages/agentry/src/execute/git-types.js` from the canonical `EndoGit` type.
This is the first consumer because stack-surgery eval scenarios can hold
`EndoMountEntry` values from `status()` and can sequence `rebase` control calls.

The JSON tool slice should also include the first-cut mutators whose wire
arguments are plain JSON:

- `commit(message, options?)` grows the optional `options.amend` flag on the
  existing `commit` tool.
- `cherryPick(ref, options?)` and `reword(ref, message)` use the same
  JSON-safe ref convention as `show`, `merge`, `createBranch({ startPoint })`,
  and other ref-bearing git tools.
- `rebase({ mode: 'start', upstream, autosquash: true })` is exposed as the
  structured autosquash start operation. The control-only modes (`continue`,
  `abort`, `skip`) remain code-mode-first because they are usually part of a
  multi-step local loop that benefits from typed state and explicit branching.
- `checkoutConflict` is exposed to JSON as
  `checkoutConflict({ paths: string[], side })`. This follows the landed
  path-string tool pattern: the tool accepts mount-relative path strings,
  resolves them through the granted worktree mount, and calls the capability
  method with authenticated `EndoMountEntry` values. The capability method
  itself remains entry-based, not string-based.

The JSON slice still excludes methods that return live capabilities or require
stored caprefs in their result flow. Those need the petname/result-persistence
path from [endo-agent-tools](endo-agent-tools.md) before they should be
advertised as flat tools.

Remote force-with-lease remains a `GitRemote` concern, not a local `Git`
addition. When the push tier grows JSON or code-mode representation for
`--force-with-lease`, it should live on the bounded remote capability so the
same endpoint, refspec, and force-push policy checks apply.

## Reset Is Not Added

Do not add broad `reset` to `EndoGit` for this eval lane. `reset --hard` and
`reset <tree-ish> -- <paths>` mix branch movement, index mutation, and worktree
destruction behind one overloaded verb. That makes review harder and gives a
confined agent a single method that can discard unrelated work inside its mount.

The narrower surface already covers the intended workflows:

- `restore(entries, { staged: true })` handles unstage.
- `restore(entries)` handles worktree discard for named entries.
- `createBranch`, `switch`, `detach`, `rebase`, and `cherryPick` cover branch
  and stack movement.
- `commit(..., { amend: true })`, `reword`, and autosquash cover history cleanup.

The mixed-commit split that motivated a reset-like verb is expressible without
one. Create a branch at the mixed commit's parent with
`createBranch(name, { startPoint: <parent-of-mixed-commit>, switchAfterCreate:
true })`, read the old patch through `filesystemAt(ref)`, write the selected
parts into the workspace, `add` and `commit`, then `cherryPick` the rest of the
stack.

A future design may add a structured, non-broad stack movement primitive if an
eval proves it cannot be expressed otherwise. That escape hatch now has a named
eval: the `stack-surgery` scenario. That primitive should not be named `reset`
unless it carries Git's full footgun honestly.

## Out-of-Scope Disposition

| Exclusion | Disposition | Reason |
|---|---|---|
| Broad `reset` | Explicitly not planned for this eval lane. | The narrow workflow surface already covers unstage, worktree discard, branch movement, and history cleanup without one overloaded destructive verb. |
| Interactive todo editing | Explicitly not planned. | It would expose arbitrary sequencing (`edit`, `drop`, `exec`, reorder) and recreate the shell/editor surface this capability layer avoids. |
| Path checkout from an arbitrary commit | Deferred. | The existing historical read surface plus named `restore` cover current eval needs; a future design can add a structured operation if an eval needs exact path checkout semantics. |
| Remote force-with-lease representation | Deferred to `GitRemote`, not local `Git`. | Push policy belongs on the bounded remote capability so endpoint, refspec, and force-push checks stay together. |
| JSON tools for `rebase` control modes | Deferred until capref/result persistence and loop ergonomics are settled. | `continue`, `abort`, and `skip` are usually follow-up steps in a conflict-resolution loop, while autosquash start is a single JSON-safe operation. |

## Authority Analysis

These additions do not grant authority outside the existing writable repository
capability. They only expose more ways to rewrite the branch, index, and
worktree the caller could already mutate through `add`, `restore`, `commit`,
`merge`, `rebase`, and `stash`.

- Amend and reword let an agent replace commit metadata reachable from the
  current repo. They do not read secrets, reach the network, or name paths.
- Cherry-pick copies an existing commit's patch into the same worktree and can
  stop on conflicts. It is no wider than merge plus commit, but better matches
  the observed stack-surgery workflow.
- Autosquash is a rebase option. It reorders and folds commits that the caller
  already has rebase authority to rewrite.
- Conflict-side selection mutates only explicit `EndoMountEntry` paths from the
  same mount lineage. It gives the agent a precise conflict-resolution shortcut
  without giving it arbitrary path strings.

The remaining operational hazard is destructive history rewrite, not authority
escape. That hazard is inherent in giving a writable local `Git` cap and is
bounded by grant choice: a host can give `git.readOnly()` to agents that may
inspect history but must not rewrite it.

## Dependencies

| Design | Relationship |
|---|---|
| [daemon-agent-tools](daemon-agent-tools.md) | Parent capability-to-tool map this design stacks on. |
| [daemon-git-capability](daemon-git-capability.md) | Owns the local `Git` capability and native backend hardening envelope. |
| [endo-agent-tools](endo-agent-tools.md) | Owns the generated code-mode declaration path and curated JSON tool surface. |
| [agentry-agent-builder](agentry-agent-builder.md) | First consumer through the code-mode git-loop eval harness. |

## Prompt

> Design the narrow git-capability additions needed for history-editing agent
> workflows: cherry-pick, commit amend, reword, rebase autosquash, and
> conflict-side selection. Deliver a design doc on top of
> `design/daemon-agent-tools-reconcile` so it composes with the reconciled
> daemon-agent-tools design.
