# PR #148: add a changeset entry for the sandbox / slice surface

Follow-up from
[`60_genie_sandbox_review.md`](./60_genie_sandbox_review.md)
juror should-fix finding.

PR #148 touches three published packages and adds a new public
daemon-host method, but `.changeset/` has no entry naming the change.
The project's existing pattern (e.g.
[`.changeset/add-endo-hex.md`](../.changeset/add-endo-hex.md)) is a
small front-matter-tagged Markdown file per release-noted change.

## Plan

- [x] **Add `.changeset/genie-sandbox-slice.md`** (or a similarly
  descriptive name).  Front matter must include every package whose
  public surface changes:

  ```md
  ---
  '@endo/genie': minor
  '@endo/sandbox': minor
  '@endo/daemon': minor
  ---

  …body…
  ```

  Body (one short paragraph plus a short bullet list) covers:
  - genie agents now mint a confined sandbox slice via `@endo/sandbox`
    and route `bash` / `exec` / `git` tools through the slice's
    spawner (existing daemon-side `files` / `memory` / `web` tools are
    unchanged);
  - new `EndoHost.provideHostPath(cap)` method on the daemon
    interface, resolving a `Mount` cap to its host filesystem path
    for the sandbox factory's bind-set assembly (rejects sub-Mounts
    and read-only attenuations);
  - dev-repl gains `--sandbox` / `--network` / `--rootfs` flags
    backed by an in-process `makeLocalSandboxPowers` to mirror the
    daemon-hosted shape.

  Note the SemVer choice: `minor` reflects "new public capability,
  no breaking change to existing callers".  If a reviewer flags any
  of the changes as breaking (e.g. the form-field rename or the
  default-network policy change), promote the affected entry to
  `major`.

- [x] **Re-run `yarn changeset status`** locally to verify the entry
  parses and lists the expected packages.  Adjust until it does.

  The repo's master branch is absent from this worktree, so
  `changeset status` itself errors before parsing.  Verified instead by
  feeding the new file through `@changesets/parse` directly — the
  parser returns the expected three releases (`@endo/genie`,
  `@endo/sandbox`, `@endo/daemon`, all `minor`) with the body intact.

- [x] **Cross-reference TADA/47** (`47_genie_sandbox_docs.md`)'s
  README / DESIGN entries from the changeset body when an operator
  would benefit from the deeper docs — keep the body short, link out.

  Body's trailing paragraph points operators at
  `packages/genie/README.md` and `packages/sandbox/README.md` (the
  artefacts TADA/47 produced) rather than restating the docs inline.

## Out of scope

- Restructuring older changeset entries.
- Reconciling the changeset with the PR description text — the
  changeset is the release-notes source of truth; the PR description
  is for reviewers.
