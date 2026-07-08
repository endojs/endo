# `@endo/agentry` Git Eval Scenarios

| | |
|---|---|
| **Created** | 2026-07-08 |
| **Updated** | 2026-07-09 |
| **Author** | 0xpatrickdev (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The git code-mode eval harness now has small scenario rows and a planned
condition matrix that multiplies every scenario across execution conditions,
models, and repeats. Adding many transcript-shaped tasks would multiply noise
as much as signal.

This design trims the set to three canonical scenarios distilled from a
recovered rebase session:

| Scenario | Role in the set | Status |
|---|---|---|
| Existing `stage-and-commit` | Minimal smoke floor for git code mode | Keep |
| `conflict-rebase` | Feasible conflict leg for rebase | Buildable with today's API by reworking PR [#526](https://github.com/endojs/endo-but-for-bots/pull/526) in place |
| `stack-surgery` | Involved centerpiece covering stack cleanup | Fixture and scorer land now behind a pending live row by reworking PR [#626](https://github.com/endojs/endo-but-for-bots/pull/626) in place; agent-side verbs blocked on [agentry-git-verb-gaps](agentry-git-verb-gaps.md) |

This omits separate clean-rebase and multi-file edit rows on purpose. The
maintainer's 2026-06-25 CHANGES_REQUESTED review on PR #526 asked for fewer,
deeper scenarios. Clean rebase is subsumed by `conflict-rebase`: its two-commit
feature branch keeps one cleanly replaying commit, so the clean-replay signal
survives inside the conflict row. PR #626's multi-file edit-and-commit signal is
subsumed by both new scenarios, which are multi-file by construction. Fewer rows
matter because PR #627's condition matrix multiplies scenarios by conditions,
models, and repeats.

The eval scorer must score only the final cap-visible repository state and the
authority boundaries used to reach it. It must not require, prefer, or reject a
specific command sequence.

The recovered session is useful as evidence of workflow shape, not as a script
to replay. The distilled scenarios intentionally omit provider-specific CI
triage, repository-local identity configuration, local path recovery, and
exact historical commit ids.

## Coverage Against Current Git Surfaces

"Code mode" means the generated `git` global in
`packages/agentry/src/execute/git-types.js`. "JSON tools" means the curated
JSON-safe slice in `packages/agent-tools/src/git-tool.js`.

| Workflow need | EndoGit | Code mode | JSON tools | Notes |
|---|---|---|---|---|
| Inspect status | ✅ | ✅ | ❌ | JSON tools defer non-empty status rows until capref/result support exists. |
| Inspect diff | ✅ | ✅ | ✅ | Text diff is JSON-safe. |
| Inspect history | ✅ | ✅ | 🟡 | JSON tools expose `log` and `show`, but not `revParse`. |
| List/current branch | ✅ | ✅ | ✅ | `branches()` and `currentBranch()`. |
| Switch branches | ✅ | ✅ | 🟡 | JSON tools expose `switchBranch`, not detached checkout. |
| Create/delete/rename branch | ✅ | ✅ | 🟡 | JSON tools expose create only. |
| Stage paths | ✅ | ✅ | ❌ | Requires `EndoMountEntry` handles from `status()` or workspace traversal. |
| Unstage/restore paths | ✅ | ✅ | ❌ | Requires entry handles. |
| Commit | ✅ | ✅ | ✅ | Plain `commit(message)`. |
| Commit amend | ❌ | ❌ | ❌ | Needed by `stack-surgery`. |
| Reword commit | ❌ | ❌ | ❌ | Needed by `stack-surgery`. |
| Cherry-pick | ❌ | ❌ | ❌ | Needed by `stack-surgery`. |
| Merge | ✅ | ✅ | ❌ | `merge(ref, options)`. |
| Rebase start/continue/abort/skip | ✅ | ✅ | ❌ | Enough for `conflict-rebase`. |
| Rebase autosquash | ❌ | ❌ | ❌ | Needed by `stack-surgery`. |
| Conflict side selection | ❌ | ❌ | ❌ | The agent can resolve by writing final file contents today, but cannot ask Git for ours/theirs checkout. |
| Stash dirty work | ✅ | ✅ | ❌ | Not required by the canonical set. |
| Pull/fetch/push | 🟡 Remote only | ❌ No local binding | ❌ | `GitRemote`, not the local `Git` code-mode binding. |
| Historical read | ✅ | ✅ | ❌ | `tree(ref)` and `filesystemAt(ref)`. |

## Anticipated Needs: Bounded Reads

The strongest tool-surface signal in the recovered session is not a missing
git verb. Roughly one in five commands was a `sed -n 'A,Bp'` invocation, and
almost none of them edited anything. The agent used `sed` as a ranged file
reader, in three recurring shapes:

- a first bounded window to open a file (`sed -n '1,120p' <path>`, ranges
  starting at line 1 dominate);
- a mid-file window aimed by line numbers from a preceding `rg -n` search;
- a cap on git output (`git show <ref>:<path> | sed -n '1,220p'`,
  `git diff ... | sed -n '1,260p'`).

This is context-budget management, and it is convergent across coding
harnesses rather than a quirk of one session. Claude Code exposes the same
shape as first-class read parameters (its `Read(path, { offset, limit })`
tool reads a bounded line window with a default cap and an explicit
truncation note, and its search results carry line numbers); Codex reaches it
through raw shell `sed` plus a per-call output-token cap. Code mode
confines away the shell, so the confined surfaces must carry the affordance
themselves; otherwise agents compensate with full-file and full-diff slurps,
the worst outcome for context cost once the condition matrix multiplies runs.

The repository already has pieces of the right convention:

| Surface | Today | Gap |
|---|---|---|
| JSON-tool `mountReadText` | Truncates at a configurable `maxChars` and appends an explicit truncation marker. | The convention exists in one tool only. |
| `OpenFile.read(offset, length)` | Byte-ranged. | Line-blind, and no end-of-file or truncation signal. |
| `Cursor.read(limit)` | Returns `{ entries, atEnd }`. | Right result shape, directory listings only. |
| `git.log(options)` | Bounds by `maxCount`. | Bounds row count, not output size. |
| `git.diff()`, `git.show()`, `stashShow()` | Unbounded strings. | No bounding option at all. |

The anticipated direction, for the companion tools and API designs rather than
this eval design, is a shared line-window option bag on every string-returning
text read across the fs and git surfaces:

- Workspace file reads and git text reads (`diff`, `show`, `log`, `stashShow`)
  accept a common `{ offset, limit }` bounding shape, defaulting to a bounded
  window and following the `mountReadText` truncation convention rather than
  inventing a per-method idiom.
- For text reads, `offset` is the starting line, preferably 1-based to match
  editor and search output.
  An absent `offset` means line 1.
  `limit` is the maximum number of lines returned.
  An absent `limit` means the surface's default bounded window.
- The same shape covers the recovered use cases: first windows are just
  `{ limit }`; mid-file windows use the line number from search output as
  `offset`; capped git text output addresses the rendered text.
  A named head-line count is only the absence of `offset` plus a `limit`, and
  explicit start/end ranges lower cleanly to `offset` plus a computed `limit`.
- Every bounded result reports continuation state: an explicit truncation
  marker or a structured `{ text, truncated, nextOffset }`-shaped result, so
  the agent knows to request the next window instead of trusting a silent
  slice.
- Implementations may also consider an optional character guardrail for very
  long lines or rendered outputs, but that is a secondary safety cap rather
  than the main addressing API.
- A line-numbered search affordance (`rg -n`-like) is the natural companion —
  ranged reads need targets — but is a separate tool design.

For `git diff`, `git show`, `git log`, `stashShow`, and similar git text
outputs, `{ offset, limit }` addresses the rendered text output unless a future
structured API chooses a richer object model.

These are inspection affordances, not scored behavior. Both scenarios below
stay buildable and scorable without them, and the scorer remains indifferent
to how the agent read state. The condition matrix is what will make their
absence measurable, as context-window pressure multiplied across scenarios,
conditions, and repeats.

## Scenario 1: `conflict-rebase`

Purpose: deepen PR #526's rebase coverage with one realistic conflict while
staying within today's `EndoGit` and workspace capabilities.

This is built by reworking PR #526 in place. The fixture helper and
`assertGitRebaseOutcome` scorer become parameterized: the conflicted commit's
expected post-resolution patch is caller-supplied instead of derived from the
original oid, rather than adding a new sibling helper.

Fixture:

- Repository branch `main` has `app.txt` with a base paragraph.
- Branch `feature/conflict-rebase` starts from the base and has two commits:
  one edits `app.txt`, and one adds `notes/feature.md`.
- Branch `integration` starts from the same base, edits the same paragraph in
  `app.txt`, and adds `notes/integration.md`.
- The eval starts checked out on `feature/conflict-rebase`.

Prompt:

```text
Rebase the current feature branch onto integration.
When app.txt conflicts, keep the integration wording, then add the feature
sentence after it. Preserve the feature note and the integration note.
Leave the branch rebased, with a clean working tree.
```

Expected final state:

- `integration` is an ancestor of `feature/conflict-rebase`.
- The feature branch is ahead of `integration` by the original feature commits,
  preserving their summaries and order with new commit ids.
- `app.txt` contains the specified combined text.
- Both `notes/feature.md` and `notes/integration.md` are present at `HEAD`.
- `git.status()` returns no dirty or conflicted entries.
- No rebase state remains in progress.

Required affordances:

| Available today | How the scenario uses it |
|---|---|
| `currentBranch()`, `branches()`, `log()`, `show()`, `diff()` | Inspect branch shape and conflict context. |
| `switchBranch()` | Move between fixture branches if the agent chooses. |
| `rebase({ mode: 'start', upstream })` | Start the replay onto `integration`. |
| Workspace read/write | Write the resolved `app.txt` contents directly. |
| `status()` and `add(entries)` | Find and stage conflicted/resolved entries. |
| `rebase({ mode: 'continue' })` | Continue after staging the resolution. |

| Blocked on API | Reason |
|---|---|
| None | This scenario should be buildable without adding Git verbs. |

Scoring notes:

- The scorer reads final state through `git`, `filesystemAt('HEAD')`, and the
  injected byte reader.
- The scorer must not care whether the agent inspected conflict markers,
  reconstructed the final text from history, or used any particular read order.

## Scenario 2: `stack-surgery`

Purpose: the centerpiece scenario. One compact fixture covers the
rebase-session behaviors that matter most for future Git authority design:
splitting a mixed commit, replaying known commits, folding fixups, resolving an
autosquash conflict, and rewording one summary.

Status: the fixture, outcome scorer, and scorer-level tests are landable now
behind a pending live row. Live agent activation is blocked on the five
agent-side verbs defined by [agentry-git-verb-gaps](agentry-git-verb-gaps.md).

Fixture:

- Repository branch `main` contains independent package-like domains:
  `alpha/`, `beta/`, `gamma/`, and `docs/`.
- Branch `topic/stack-surgery` contains:
  - one mixed commit touching both `alpha/` and `beta/`;
  - a later `fixup!` commit for the alpha change;
  - a later `fixup!` commit for the beta change that will conflict when
    autosquashed;
  - one commit with the right diff but an intentionally vague summary.
- Two known commits exist on side branches:
  - `side/gamma-tooling` adds a small `gamma/` helper;
  - `side/docs-note` updates `docs/stack.md`.
- The eval starts checked out on `topic/stack-surgery`.

Prompt:

```text
Clean up the current stack.
Split the mixed alpha/beta commit into separate per-domain commits.
Cherry-pick the gamma tooling commit and the docs note commit, in that order.
Fold the fixup commits into their targets; if autosquash conflicts, keep the
domain-specific final content described in the files.
Reword the vague summary to "test(beta): cover stack surgery".
End with a clean linear stack and a clean working tree.
```

Expected final state:

- The branch is linear on `main`.
- The final stack contains separate conventional commits for alpha, beta,
  gamma, docs, and the beta test summary.
- The mixed alpha/beta change no longer exists as a single mixed commit.
- The two side-branch commits are replayed in the requested order.
- No `fixup!` commits remain in `git.log()`.
- The reworded commit has summary `test(beta): cover stack surgery`, and its
  tree is otherwise the same intended beta-test tree.
- `alpha/`, `beta/`, `gamma/`, and `docs/stack.md` contents match the fixture's
  expected final text.
- `git.status()` returns a clean worktree and index.

Required affordances:

| Available today | How the scenario uses it |
|---|---|
| `status()`, `diff()`, `log()`, `show()`, `revParse()` | Inspect current stack, confirm the target commits, and score final shape. |
| `filesystemAt(ref)` and workspace read/write | Compare historical and final file contents, and resolve conflict files by content. |
| `createBranch(name, { startPoint, switchAfterCreate: true })` | Start the replacement branch at the parent of the mixed commit. |
| `add(entries)` and `commit(message)` | Rebuild the two per-domain commits from historical reads and workspace writes. |
| `rebase({ mode: 'continue' | 'abort' | 'skip' })` | Continue or recover from an in-progress rebase once a richer rebase start exists. |

| Blocked on API | Reason |
|---|---|
| `cherryPick(ref, options?)` | Replay the two side-branch commits. |
| `commit(message, { amend: true })` | Fold staged changes into an existing commit. |
| `reword(ref, message)` | Rename one commit while preserving its tree. |
| `rebase({ mode: 'start', upstream, autosquash: true })` | Fold `fixup!` commits, surfacing conflicts as structured rebase state. |
| `checkoutConflict(entries, 'ours' \| 'theirs')` | Conflict-side selection without broad checkout. |

### Commit split without reset

The mixed-commit split is expressible with today's API plus `cherryPick`. The
agent creates a replacement branch at the parent of the mixed commit with
`createBranch(name, { startPoint: <parent-of-mixed-commit>,
switchAfterCreate: true })`, an options bag already present in
`packages/agentry/src/execute/git-types.js`. It then uses `filesystemAt(ref)`
for historical reads, writes the workspace into the two per-domain states,
stages with `add`, commits each replacement, and uses `cherryPick` for the
remainder of the stack.

This aligns with [agentry-git-verb-gaps](agentry-git-verb-gaps.md) § "Reset Is
Not Added". That design reserves an escape hatch for a narrow stack-movement
primitive only if an eval proves the branch-at-parent route unmanageable. This
scenario is that eval.

Scoring notes:

- The scorer should compare final commit summaries, parent relationships,
  absence of fixup commits, selected file contents, and clean status.
- It should not require the branch to contain the same commit ids as the
  fixture's side branches after replay.
- It should reject solutions that use an unconfined shell condition as the
  code-mode pass path. Shell can remain a matrix control condition, not the
  authority shape this scenario certifies.

## Scenario Set Policy

Keep the scenario set small:

- Keep `stage-and-commit` as the minimal smoke floor.
- Rework PR #526 in place into `conflict-rebase` rather than adding a sibling
  clean-rebase row.
- Rework PR #626 in place into the `stack-surgery` fixture, scorer, and pending
  live row rather than keeping a separate multi-file row.
- Do not split `stack-surgery` into five separate eval rows unless a future
  failure analysis proves one sub-capability needs an isolated smoke row.
- Keep CI/PR-provider diagnosis, publish/force-push behavior, and maintainer
  identity policy outside this harness. Those are separate provider and remote
  authority surfaces.

## Adjacent Eval Lanes

| Lane | Boundary |
|---|---|
| Package-manager capability | `yarn`/`npm` install and test verification stay in a separate capability and eval lane. The recovered session ran roughly 57 yarn build, lint, and test commands, so verification is half the real workflow, but it brings process execution, network access, and lockfile policy rather than local git mutation. |
| Git remotes | `GitRemote` exists, but has no code-mode local binding. Fetch, pull, push, and clone scenarios are a future lane, and publish or force-push policy stays out of this harness. |
| CI / PR-provider triage | Provider diagnosis remains excluded from this harness because it mixes repository state with forge state, checks APIs, and maintainer workflow policy. |
| Line-numbered search | Line-numbered search is already named under "Anticipated Needs: Bounded Reads" as a separate tool design. It feeds ranged reads but is not itself a git scenario. |

## Test Plan

- Add a no-credentials assertion-path test for `conflict-rebase` using a
  scripted faux provider that performs the intended code-mode operations.
- Add negative scorer tests for `conflict-rebase`: never rebased, conflict text
  wrong, one feature commit dropped, dirty/conflicted worktree remains.
- Add the `stack-surgery` fixture, outcome scorer, and scorer-level tests now
  behind a skipped or pending live row. Verify the scorer against directly
  constructed repository end states, with no agent in the loop.
- Add the faux-provider pass-path test for `stack-surgery` once the verb-gaps
  verbs exist, then activate the live model row.
- Keep live-model registry rows table-driven so the condition matrix can
  multiply scenarios without per-scenario runner changes.

## Dependencies

| Dependency | Relationship |
|---|---|
| [agentry-agent-builder](agentry-agent-builder.md) | Defines the code-mode agent builder and git-loop preset the eval harness runs. |
| [endo-agent-tools](endo-agent-tools.md) | Defines the confined tool/capability model and the JSON-tool slice. |
| [daemon-git-capability](daemon-git-capability.md) | Defines the underlying `Git` capability vocabulary. |
| [agentry-git-verb-gaps](agentry-git-verb-gaps.md) | In flight on PR [#611](https://github.com/endojs/endo-but-for-bots/pull/611); defines the five agent-side verbs `stack-surgery` needs. |
| PR [#526](https://github.com/endojs/endo-but-for-bots/pull/526) | Reworked in place into `conflict-rebase`. |
| PR [#626](https://github.com/endojs/endo-but-for-bots/pull/626) | Reworked in place into the `stack-surgery` fixture/scorer pending row. |
| PR [#627](https://github.com/endojs/endo-but-for-bots/pull/627) | Condition matrix that makes scenario count costly. |

## Open Questions

- Which surfaces adopt the shared `{ offset, limit }` bounded-read convention,
  what exact result metadata do they return, and is an optional character
  guardrail needed?

## Prompt

> Write a fresh design doc distilling recovered git-rebase-session evidence into
> a small canonical eval-scenario set for the `packages/agentry` git code-mode
> eval harness: 2-3 tasks total, with one involved multi-feature scenario as
> the centerpiece. Keep the baseline rows, preserve outcome-based scoring, keep
> coverage against current `EndoGit`, code-mode, and JSON tool surfaces, and do
> not commit the raw transcript.

Revision 2026-07-08:

> Remove the floating Evidence Summary section. Replace it with an anticipated
> needs section explaining what the session's heavy `sed -n` usage actually
> was — ranged reading to limit context, not stream editing — and how the git
> and fs tool surfaces should grow shared non-git bounded-read `opts` to
> support `less`/`sed`-like output limiting.

Revision 2026-07-09:

> Trim the set to `stage-and-commit`, `conflict-rebase`, and `stack-surgery`;
> rework PR #526 and PR #626 in place rather than keeping separate baseline
> rows; align `stack-surgery` with `agentry-git-verb-gaps` and its no-reset
> branch-at-parent route; and name adjacent eval lanes left outside this
> harness.
