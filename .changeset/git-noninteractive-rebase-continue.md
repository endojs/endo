---
'@endo/git': patch
---

Make `NativeGitBackend` git invocations non-interactive with respect to the
editor. Under the default merge backend, `git rebase --continue` (and a
non-fast-forward `git merge`) open the configured editor to confirm a commit
message. With no controlling terminal the spawned editor blocks waiting on
stdin or fails outright, stranding a conflict-resolution `rebase({ mode:
'continue' })` mid-rebase. The backend now pins `GIT_EDITOR=true` and
`GIT_SEQUENCE_EDITOR=:` in the sanitized environment it hands each git child,
so the continue path completes non-interactively while preserving the original
commit message.
